import asyncio, io
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2300,"height":2300}, device_scale_factor=1)
        await pg.goto("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00"
                      "&model=../assets/build/gemini-v1/gemini.layout.model3.json")
        await pg.wait_for_timeout(2500)
        buf = await pg.screenshot(); await b.close()
    im = Image.open(io.BytesIO(buf)).convert("RGB"); im.save("preview/_diag/_g6_full.png")
    a = np.asarray(im).astype(int)
    g = (a[:,:,0]<40)&(a[:,:,1]>200)&(a[:,:,2]<40)
    print("face", int(g[500:900,800:1260].sum()), "jaw", int(g[820:900,850:1200].sum()), "eye", int(g[540:720,820:1240].sum()))
    im.crop((600,120,1420,860)).resize((1640,1480), Image.LANCZOS).save("preview/_diag/_g6_head.png")

asyncio.run(main())
