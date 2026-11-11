import asyncio, io, urllib.parse
from PIL import Image
from playwright.async_api import async_playwright

M = "../assets/build/gemini-v1/gemini.layout.model3.json"
BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23202733&model=" + M.replace("/","%2F")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        for tag, ax in (("rest", 0), ("turn", -8)):
            q = "&p=" + urllib.parse.quote(f"ParamAngleX:{ax}") if ax else ""
            await pg.goto(BASE + q); await pg.wait_for_timeout(800)
            im = Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
            im.save(f"preview/_diag/_base_{tag}.png")
            im.crop((780, 420, 1300, 1150)).save(f"preview/_diag/_base_{tag}_head.png")
        await b.close()

asyncio.run(main())
