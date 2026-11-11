import asyncio, io
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&model=../assets/build/gemini-v1/gemini.layout.model3.json"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":2300,"height":2300})
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        im=Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
        im.save(r"preview/_diag/_q_full.png")
        a=np.asarray(im).astype(int)
        g=(np.abs(a-np.array([0,255,0])).sum(axis=2)<=20)
        g[:80,:]=False
        ys,xs=np.where(~g); print("bbox",xs.min(),ys.min(),xs.max(),ys.max())
        res=[]
        for x in range(xs.min(),xs.max()+1):
            col=g[:,x]; idx=np.where(~col)[0]
            if len(idx)<100: continue
            seg=col[idx.min():idx.max()+1]
            run=0;mx=0
            for v in seg:
                if v: run+=1; mx=max(mx,run)
                else: run=0
            res.append((mx,x))
        res.sort(reverse=True)
        print("top columns (maxGreenRun, x):", res[:6])
        await b.close()
asyncio.run(main())
