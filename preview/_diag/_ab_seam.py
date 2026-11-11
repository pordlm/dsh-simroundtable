import asyncio, io, sys
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
from scipy import ndimage

def run(arg):
    which, out = arg
    return (which, out)

async def grab(pg, model, out):
    url = ("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00&model=" + model)
    await pg.goto(url)
    await pg.wait_for_timeout(2500)
    buf = await pg.screenshot()
    im = Image.open(io.BytesIO(buf)).convert("RGB")
    im.save(out)
    a = np.asarray(im).astype(int)
    bg = (abs(a[:,:,0])<12)&(abs(a[:,:,1]-255)<12)&(abs(a[:,:,2])<12)
    body = ~bg
    solid = ndimage.binary_closing(body, np.ones((9,9)))
    inner = solid & bg
    lab, n = ndimage.label(inner)
    sizes = ndimage.sum(inner, lab, range(1, n+1)) if n else [0]
    return int(inner.sum()), int(max(sizes))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2300,"height":2300}, device_scale_factor=1)
        for model, tag in [("../assets/build/gemini-v1.bak/gemini.layout.model3.json","before"),
                           ("../assets/build/gemini-v1/gemini.layout.model3.json","after")]:
            try:
                tot, big = await grab(pg, model, f"preview/_diag/_{tag}_full.png")
                print(tag, "interior_bg_total", tot, "largest", big)
            except Exception as e:
                print(tag, "failed", e)
        await b.close()

asyncio.run(main())
