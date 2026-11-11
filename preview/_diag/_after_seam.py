import asyncio, io, sys
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
from scipy import ndimage

URL = ("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00"
       "&model=../assets/build/gemini-v1/gemini.layout.model3.json")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2300,"height":2300}, device_scale_factor=1)
        await pg.goto(URL)
        await pg.wait_for_timeout(2500)
        buf = await pg.screenshot()
        await b.close()
    im = Image.open(io.BytesIO(buf)).convert("RGB")
    im.save("preview/_diag/_after_full.png")
    a = np.asarray(im).astype(int)
    bg = (abs(a[:,:,0]-0)<12)&(abs(a[:,:,1]-255)<12)&(abs(a[:,:,2]-0)<12)
    body = ~bg
    solid = ndimage.binary_closing(body, np.ones((9,9)))
    inner = solid & bg
    lab, n = ndimage.label(inner)
    if n:
        sizes = ndimage.sum(inner, lab, range(1, n+1))
        big = int(sizes.max())
    else:
        big = 0
    print("size", im.size, "interior_bg_total", int(inner.sum()), "largest", big)
    im.crop((600,120,1420,860)).resize((1640,1480), Image.LANCZOS).save("preview/_diag/_after_head.png")

asyncio.run(main())
