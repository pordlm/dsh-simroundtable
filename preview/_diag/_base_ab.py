import asyncio, io
import numpy as np
from PIL import Image
from scipy import ndimage
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00&model="
MODELS = {"orig": "../assets/build/gemini-v1/gemini.layout.model3.json",
          "base": "../assets/build/_gemini-based/gemini.layout.model3.json"}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        for tag, rel in MODELS.items():
            await pg.goto(BASE + rel.replace("/","%2F")); await pg.wait_for_timeout(900)
            im = Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
            im.save(f"preview/_diag/_seam_{tag}2.png")
            a = np.asarray(im).astype(int)
            green = (a[:,:,0] < 90) & (a[:,:,1] > 190) & (a[:,:,2] < 90)
            body = ~green
            holes = ndimage.binary_fill_holes(body) & green
            lab, n = ndimage.label(holes, structure=np.ones((3,3)))
            objs = ndimage.find_objects(lab)
            head = [int((lab[s] == i+1).sum()) for i, s in enumerate(objs)
                    if s and 470 <= s[0].start <= 900 and 800 <= s[1].start <= 1250]
            print(tag, "head gaps:", len(head), "sum", sum(head), "max", max(head) if head else 0,
                  "| face-green", int(green[500:900, 800:1260].sum()))
        await b.close()

asyncio.run(main())
