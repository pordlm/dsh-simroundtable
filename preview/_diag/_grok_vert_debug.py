import asyncio

from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/probe.html?model=../assets/build/grok-v1/"
       "grok.layout.model3.json&scale=0.6")

JS = r"""
() => {
  const m = window.__model, cm = m.internalModel.coreModel;
  const ids = cm.getDrawableIds();
  const idx = {}; ids.forEach((s, i) => { idx[s] = i; });
  const hair = () => {
    const v = cm.getDrawableVertexPositions(idx['ArtMeshFrontHair']);
    let sx = 0, sy = 0, n = v.length / 2;
    for (let k = 0; k < v.length; k += 2) { sx += v[k]; sy += v[k + 1]; }
    return {n, c: [sx / n, sy / n], first: [v[0], v[1]], mid: [v[Math.floor(n/2)*2], v[Math.floor(n/2)*2+1]]};
  };
  const snap = (label) => ({label, ax: cm.getParameterValueById('ParamAngleX'),
    hf: cm.getParameterValueById('ParamHairFront'), hair: hair()});
  const out = [];
  out.push(snap('rest'));
  cm.setParameterValueById('ParamAngleX', -6);
  m.update(16.6);
  out.push(snap('ax=-6 after update'));
  cm.setParameterValueById('ParamAngleX', 6);
  m.update(16.6);
  out.push(snap('ax=+6 after update'));
  cm.setParameterValueById('ParamHairFront', 0.22);
  m.update(16.6);
  out.push(snap('hf=0.22 after update'));
  // second update with the same values: does the geometry keep moving?
  m.update(16.6);
  out.push(snap('hf=0.22 second update'));
  return out;
}
"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        await pg.goto(URL)
        await pg.wait_for_function("() => !!window.__model", timeout=60000)
        rows = await pg.evaluate(JS)
        for r in rows:
            print(f"{r['label']:26s} ax={r['ax']:+6.2f} hf={r['hf']:+.2f} "
                  f"hairC=({r['hair']['c'][0]:.6f},{r['hair']['c'][1]:.6f}) "
                  f"first=({r['hair']['first'][0]:.6f},{r['hair']['first'][1]:.6f})")
        await b.close()

asyncio.run(main())