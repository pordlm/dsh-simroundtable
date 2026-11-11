import asyncio, io
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":600,"height":600})
        for s in ["0.09","0.18"]:
            await pg.goto(f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale={s}&bg=%2314121a&model=../assets/build/gemini-v1/gemini.layout.model3.json")
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"preview/_diag/_q_small_{s}.png")
        await b.close()
asyncio.run(main())
