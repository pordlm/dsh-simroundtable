import asyncio, io
import numpy as np
from playwright.async_api import async_playwright
from PIL import Image
from scipy import ndimage

MODELS = {
 "Gemini": "../assets/build/gemini-v1/gemini.layout.model3.json",
 "Claude": "../assets/build/claude-v3/model/claude.layout.model3.json",
}
BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.5&bg=%23FF00FF&model="
VALS = [-0.36,-0.24,-0.12,-0.06,0,0.06,0.12,0.24,0.36,0.6,1.0]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":1100,"height":1100})
        for name, M in MODELS.items():
            print("==", name)
            for hf in VALS:
                url = BASE + M.replace('/','%2F') + "&p=ParamHairFront%3A" + str(hf)
                await pg.goto(url); await pg.wait_for_timeout(600)
                buf = await pg.screenshot()
                a = np.asarray(Image.open(io.BytesIO(buf)).convert("RGB"))[:1024,:1024].astype(int)
                mag = (a[:,:,0]>200)&(a[:,:,1]<80)&(a[:,:,2]>200)
                lab, n = ndimage.label(mag)
                border = set(lab[0,:]) | set(lab[-1,:]) | set(lab[:,0]) | set(lab[:,-1]); border.discard(0)
                hole = mag & ~np.isin(lab, list(border))
                labh, nh = ndimage.label(hole)
                sizes = ndimage.sum(hole, labh, range(1, nh+1)) if nh else np.array([0])
                big = sizes[sizes > 100]
                print(f"  hf={hf:+.2f}  holes={int(hole.sum()):6d}  n>100px={len(big):2d}  sum>100={int(big.sum()):6d}  largest={int(sizes.max()):5d}")
        await b.close()

asyncio.run(main())
