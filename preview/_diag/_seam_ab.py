import asyncio, io, json
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2300FF00&model="
MODELS = {
 "orig": "../assets/build/gemini-v1/gemini.layout.model3.json",
 "pad8": "../assets/build/_gemini-pad8/gemini.layout.model3.json",
}

def green(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    g = (a[:,:,0] < 90) & (a[:,:,1] > 190) & (a[:,:,2] < 90)
    return g

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
            args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":2100,"height":2100})
        for tag, rel in MODELS.items():
            await pg.goto(BASE + rel.replace("/","%2F"))
            await pg.wait_for_timeout(900)
            buf = await pg.screenshot()
            im = Image.open(io.BytesIO(buf))
            g = green(im)
            face = g[500:900, 800:1260]
            jaw = g[820:900, 860:1200]
            eye = g[560:700, 820:1240]
            im.save(f"preview/_diag/_seam_{tag}.png")
            print(tag, "face", int(face.sum()), "jaw", int(jaw.sum()), "eye", int(eye.sum()),
                  "total", int(g.sum()))
        await b.close()

asyncio.run(main())
