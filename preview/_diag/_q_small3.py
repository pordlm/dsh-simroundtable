import asyncio, io
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":600,"height":600})
        await pg.goto("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.18&bg=%2314121a&model=../assets/build/gemini-v1/gemini.layout.model3.json")
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path="preview/_diag/_q_small_0.18.png")
        await b.close()
asyncio.run(main())
