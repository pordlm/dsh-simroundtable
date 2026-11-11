import asyncio, io, urllib.parse
import numpy as np
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

MODELS = {"old": "../assets/build/gemini-v1.prev/gemini.layout.model3.json",
          "new": "../assets/build/gemini-v1/gemini.layout.model3.json"}
BG = "%23202733"

async def shot(pg, rel, ax):
    url = ("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=" + BG +
           "&model=" + rel.replace("/","%2F"))
    if ax: url += "&p=" + urllib.parse.quote(f"ParamAngleX:{ax}")
    await pg.goto(url); await pg.wait_for_timeout(800)
    im = Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
    return im.crop((780, 430, 1300, 1120))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        crops = {}
        for tag, rel in MODELS.items():
            for ax in (0, -8):
                crops[(tag, ax)] = await shot(pg, rel, ax)
        await b.close()

    w, h = crops[("old",0)].size
    sheet = Image.new("RGB", (w*2, h*2 + 56), (18, 25, 39))
    d = ImageDraw.Draw(sheet)
    for col, ax in enumerate((0, -8)):
        for row, tag in enumerate(("old", "new")):
            sheet.paste(crops[(tag, ax)], (col*w, 56 + row*h))
    d.text((12, 16), "before  (parts only touch)", fill=(230, 120, 120))
    d.text((12, 36), "after   (head plate behind the face)", fill=(140, 220, 160))
    d.text((w+12, 16), "head turned 8 deg", fill=(200, 200, 210))
    sheet.save("preview/_evidence/gemini_base_plate_ab.png")
    print(sheet.size)

asyncio.run(main())
