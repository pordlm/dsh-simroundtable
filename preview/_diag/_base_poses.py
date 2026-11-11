import asyncio, io, json, urllib.parse
import numpy as np
from PIL import Image
from scipy import ndimage
from playwright.async_api import async_playwright

M = "../assets/build/gemini-v1/gemini.layout.model3.json"
BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00&model=" + M.replace("/","%2F")

async def gaps(pg, q):
    await pg.goto(BASE + q); await pg.wait_for_timeout(700)
    im = Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
    a = np.asarray(im).astype(int)
    green = (a[:,:,0] < 90) & (a[:,:,1] > 190) & (a[:,:,2] < 90)
    holes = ndimage.binary_fill_holes(~green) & green
    lab, n = ndimage.label(holes, structure=np.ones((3,3)))
    objs = ndimage.find_objects(lab)
    head = [int((lab[s] == i+1).sum()) for i, s in enumerate(objs)
            if s and 470 <= s[0].start <= 900 and 800 <= s[1].start <= 1250]
    return len(head), sum(head), max(head) if head else 0

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        for ax in (0, -6, 6, -10, 10):
            for hf in (0.0, -0.12, 0.12):
                q = "&p=" + urllib.parse.quote(f"ParamAngleX:{ax},ParamHairFront:{hf}")
                n, s, m = await gaps(pg, q)
                print(f"ax={ax:+3d} hf={hf:+.2f}  holes={n:3d} sum={s:5d} max={m:4d}")
        await b.close()

asyncio.run(main())
