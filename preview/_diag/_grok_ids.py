import asyncio
from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/probe.html?model=../assets/build/grok-v1/"
       "grok.layout.model3.json&scale=0.6")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        await pg.goto(URL)
        await pg.wait_for_function("() => !!window.__model", timeout=60000)
        ids = await pg.evaluate("() => window.__model.internalModel.coreModel.getDrawableIds()")
        print("\n".join(f"{i:2d} {s}" for i, s in enumerate(ids)))
        meta = await pg.evaluate("""() => {const m=window.__model;
          const cm=m.internalModel.coreModel; const b=m.getLocalBounds();
          return {ppu: m.internalModel.pixelsPerUnit||null,
                  canvas:[cm.canvasWidth,cm.canvasHeight],
                  bounds:[b.x,b.y,b.width,b.height]};}""")
        print(meta)
        await b.close()

asyncio.run(main())