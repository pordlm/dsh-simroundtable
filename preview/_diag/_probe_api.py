import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1200, "height": 1200})
        await pg.goto("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model=../assets/build/gemini-v1/gemini.layout.model3.json")
        await pg.wait_for_function("() => !!window.__model", timeout=45000)
        info = await pg.evaluate("""() => {
          const core = window.__model.internalModel.coreModel;
          const proto = Object.getPrototypeOf(core);
          const names = Object.getOwnPropertyNames(proto).filter((n) => /aram/i.test(n));
          return { names, hasMin: typeof core.getParameterMinimumValue,
                   sample: core.getParameterMaximumValue ? core.getParameterMaximumValue('ParamAngleX') : 'no fn' };
        }""")
        print(info)
        await b.close()

asyncio.run(main())
