import asyncio, io
from PIL import Image
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.16&bg=%2314121a&model=../assets/build/gemini-v1/gemini.layout.model3.json"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":900}, device_scale_factor=4)
        for tag,suffix in [("nomip",""),("mip","&mip=1")]:
            await pg.goto(BASE+suffix); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"preview/_diag/_q_mip_{tag}.png")
        await b.close()
asyncio.run(main())
