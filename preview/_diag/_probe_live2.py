import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
URL = os.environ.get("URLX")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            args=["--headless=new","--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":760,"height":760})
        errs=[]
        pg.on("console", lambda m: errs.append(m.type+": "+m.text[:140]) if m.type in ("error","warning") else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERROR: "+str(e)[:200]))
        await pg.goto(URL, wait_until="load")
        for k in range(20):
            await pg.wait_for_timeout(5000)
            st = await pg.evaluate("""() => ({
              loaded: !!window.__loaded,
              models: (window.__models||[]).map(m=>!!m),
              ready: !!window.__ready,
              err: document.body.dataset.error || null,
              kids: window.__app ? window.__app.stage.children.length : -1 })""")
            print(k*5+5, json.dumps(st), flush=True)
            if st["loaded"]: break
        for e in errs[-6:]: print("LOG", e, flush=True)
        await b.close()
asyncio.run(main())
