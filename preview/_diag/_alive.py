import asyncio, os, io, base64
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np
URL=os.environ["URLX"]
GRAB="""async () => {
  const app = window.__app;
  const bounds = window.__models.map(m => { const b = m.getBounds(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; });
  const url = await app.renderer.extract.base64(app.stage, 'image/png');
  return { bounds, url };
}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":800})
        await pg.goto(URL); await pg.wait_for_function("window.__ready===true",timeout=30000)
        await pg.wait_for_timeout(4000)
        a=await pg.evaluate(GRAB); await pg.wait_for_timeout(1000); c=await pg.evaluate(GRAB)
        ia=Image.open(io.BytesIO(base64.b64decode(a["url"].split(",")[1]))).convert("RGBA")
        ib=Image.open(io.BytesIO(base64.b64decode(c["url"].split(",")[1]))).convert("RGBA")
        print("canvas", ia.size, "bounds", a["bounds"])
        na=np.asarray(ia).astype(np.int16); nb=np.asarray(ib).astype(np.int16)
        # composite on stage bg
        bg=np.array([18,25,39],dtype=np.int16)
        ca=(na[...,:3]*na[...,3:4]/255 + bg*(255-na[...,3:4])/255)
        cb=(nb[...,:3]*nb[...,3:4]/255 + bg*(255-nb[...,3:4])/255)
        for i,(x,y,w,h) in enumerate(a["bounds"]):
            x0,y0=max(0,x),max(0,y); x1,y1=min(ca.shape[1],x+w),min(ca.shape[0],y+h)
            d=np.abs(ca[y0:y1,x0:x1]-cb[y0:y1,x0:x1]).mean(axis=2)
            print(f"seat{i} box=({x},{y},{w},{h}) mean={d.mean():.2f} changed>12={(d>12).sum()}")
        await b.close()
asyncio.run(main())
