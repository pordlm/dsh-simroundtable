import asyncio, io
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/stage-760.html?n=3&names=Gemini,Claude,GPT"
       "&tpin=7000&nogest=1&nolook=1")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":800,"height":720}, device_scale_factor=3)
        await pg.goto(URL); await pg.wait_for_timeout(4000)
        buf = await pg.screenshot(); await b.close()
    im = Image.open(io.BytesIO(buf)).convert("RGB")
    im.save("preview/_diag/_stage_after.png")
    print("full", im.size)
    # find Gemini's head: leftmost seat
    a = np.asarray(im).astype(int)
    bg = np.abs(a - np.array([18,25,39])).sum(axis=2) < 24
    cols = np.where((~bg).sum(axis=0) > 5)[0]
    print("body cols", cols.min() if len(cols) else None, cols.max() if len(cols) else None)

asyncio.run(main())
