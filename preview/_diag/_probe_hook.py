import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ.get("URLX")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            args=["--headless=new","--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":760,"height":760})
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_function("window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=180000)
        await pg.wait_for_timeout(2000)
        out = await pg.evaluate("""() => {
          const ms = window.__models.filter(Boolean);
          const m = ms[1];
          const im = m.internalModel;
          const res = {
            hooked: ms.map(x=>!!x.__hooked),
            acting: ms.map(x=>x.__acting ? {hair:+x.__acting.hair.toFixed(3), turn:+x.__acting.turn.toFixed(2)} : null),
            hasOn: typeof im.on, hasEmit: typeof im.emit,
            listeners: im.listenerCount ? im.listenerCount("beforeModelUpdate") : "n/a",
            hfBefore: im.coreModel.getParameterValueById("ParamHairFront"),
            canAdd: typeof im.coreModel.addParameterValueById,
          };
          try { im.emit("beforeModelUpdate"); } catch (e) { res.emitErr = String(e); }
          res.hfAfterEmit = im.coreModel.getParameterValueById("ParamHairFront");
          return res;
        }""")
        print(out)
        await b.close()
asyncio.run(main())
