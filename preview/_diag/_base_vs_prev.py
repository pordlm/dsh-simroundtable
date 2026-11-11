import asyncio, io, urllib.parse
import numpy as np
from PIL import Image
from scipy import ndimage
from playwright.async_api import async_playwright

MODELS = {
 "prev": "../assets/build/gemini-v1.prev/gemini.layout.model3.json",
 "base": "../assets/build/gemini-v1/gemini.layout.model3.json",
}

async def probe(pg, rel, q):
    url = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00&model=" + rel.replace("/","%2F") + q
    await pg.goto(url); await pg.wait_for_timeout(700)
    im = Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
    a = np.asarray(im).astype(int)
    green = (a[:,:,0] < 90) & (a[:,:,1] > 190) & (a[:,:,2] < 90)
    holes = ndimage.binary_fill_holes(~green) & green
    lab, n = ndimage.label(holes, structure=np.ones((3,3)))
    objs = ndimage.find_objects(lab)
    rows = []
    for i, s in enumerate(objs):
        if not s: continue
        size = int((lab[s] == i+1).sum())
        rows.append((size, s[1].start, s[0].start, s[1].stop, s[0].stop))
    rows.sort(reverse=True)
    return rows[:5]

async def main():
    q = "&p=" + urllib.parse.quote("ParamAngleX:-6")
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        for tag, rel in MODELS.items():
            print(tag, await probe(pg, rel, q))
        await b.close()

asyncio.run(main())
