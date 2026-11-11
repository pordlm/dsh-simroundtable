import asyncio, io, urllib.parse
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

MODELS = {"old": "../assets/build/gemini-v1.prev/gemini.layout.model3.json",
          "new": "../assets/build/gemini-v1/gemini.layout.model3.json"}

async def shot(pg, rel, ax):
    url = ("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23202733&model="
           + rel.replace("/","%2F"))
    if ax: url += "&p=" + urllib.parse.quote(f"ParamAngleX:{ax}")
    await pg.goto(url); await pg.wait_for_timeout(800)
    return Image.open(io.BytesIO(await pg.screenshot())).convert("RGB").crop((790, 440, 1290, 1080))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        old = await shot(pg, MODELS["old"], 0)
        new = await shot(pg, MODELS["new"], 0)
        turn = await shot(pg, MODELS["new"], -8)
        await b.close()
    w, h = old.size
    sheet = Image.new("RGB", (w*3, h + 34), (18, 25, 39))
    sheet.paste(old, (0, 34)); sheet.paste(new, (w, 34)); sheet.paste(turn, (w*2, 34))
    d = ImageDraw.Draw(sheet)
    d.text((8, 10), "before", fill=(235, 130, 130))
    d.text((w+8, 10), "after (plate + rim clean)", fill=(140, 225, 165))
    d.text((w*2+8, 10), "after, head turned 8 deg", fill=(200, 200, 210))
    sheet.save("preview/_evidence/gemini_base_plate_ab.png")
    print(sheet.size)

asyncio.run(main())
