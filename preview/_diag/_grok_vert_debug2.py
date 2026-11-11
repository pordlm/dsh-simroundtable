import asyncio

from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/probe.html?model=../assets/build/grok-v1/"
       "grok.layout.model3.json&scale=0.6")

JS = r"""
() => {
  const m = window.__model, im = m.internalModel, cm = im.coreModel;
  const idx = {}; cm.getDrawableIds().forEach((s, i) => { idx[s] = i; });
  const hair = () => {
    const v = cm.getDrawableVertexPositions(idx['ArtMeshFrontHair']);
    let sx = 0, sy = 0, n = v.length / 2;
    for (let k = 0; k < v.length; k += 2) { sx += v[k]; sy += v[k + 1]; }
    return [sx / n, sy / n];
  };
  const log = [];
  const push = (tag) => log.push([tag, cm.getParameterValueById('ParamAngleX'), hair()[0]]);
  push('rest');
  cm.setParameterValueById('ParamAngleX', -6);
  push('set -6 (no update)');
  cm.update();
  push('cm.update()');
  cm.setParameterValueById('ParamAngleX', 6);
  cm.update();
  push('set +6 cm.update()');
  im.update(16.6, performance.now());
  push('im.update()');
  cm.setParameterValueById('ParamAngleX', -6);
  im.update(16.6, performance.now());
  push('set -6 im.update()');
  m.update(16.6);
  push('m.update()');
  return {api: {mUpdate: typeof m.update, imUpdate: typeof im.update, cmUpdate: typeof cm.update,
                 drawables: cm.getDrawableIds().length},
          log};
}
"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        await pg.goto(URL)
        await pg.wait_for_function("() => !!window.__model", timeout=60000)
        res = await pg.evaluate(JS)
        print(res["api"])
        for tag, ax, hx in res["log"]:
            print(f"{tag:24s} ax={ax:+6.2f} hairCx={hx:.6f}")
        await b.close()

asyncio.run(main())