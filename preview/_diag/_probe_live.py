import asyncio, os
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8848/preview/stage-760.html?n=3&names=Grok,Gemini,GPT"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            args=["--headless=new","--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":760,"height":760})
        logs=[]
        pg.on("console", lambda m: logs.append(m.type+": "+m.text[:160]))
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: "+str(e)[:220]))
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_function("window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=180000)
        await pg.wait_for_timeout(2500)
        info = await pg.evaluate("""() => ({
          models: (window.__models||[]).length,
          hasApp: !!window.__app,
          children: window.__app ? window.__app.stage.children.length : -1,
          hooked: (window.__models||[]).filter(m=>m&&m.__hooked).length,
          acting: (window.__models||[]).filter(m=>m&&m.__acting).length,
          autoU: (window.__models||[]).filter(m=>m&&m.autoUpdate===true).length,
          tickers: (window.__models||[]).map(m=>m&&m.internalModel&&m.internalModel.breath?"breath":"-"),
          ax: (window.__models||[]).map(m=>{try{return +m.internalModel.coreModel.getParameterValueById("ParamAngleX").toFixed(2)}catch(e){return "err"}}),
        })""")
        print(info)
        print("\n".join(logs[-8:]))
        await b.close()
asyncio.run(main())

