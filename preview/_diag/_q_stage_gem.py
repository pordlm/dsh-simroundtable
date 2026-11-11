import asyncio, io
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/stage-760.html?n=1&names=Gemini&tpin=6000&nogest=1&nolook=1"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":800}, device_scale_factor=2)
        await pg.goto(URL); await pg.wait_for_timeout(3000)
        im=Image.open(io.BytesIO(await pg.screenshot()))
        im.save("preview/_diag/_q_stage_gem.png")
        a=np.asarray(im.convert("RGB")).astype(int)
        print("size",im.size)
        # locate the character: non-background column band in the upper area
        bg=a[2,2]
        d=np.abs(a-bg).sum(axis=2)
        mask=d>40
        ys,xs=np.where(mask[100:700,:])
        print("fig bbox", xs.min(), ys.min()+100, xs.max(), ys.max()+100, "bg", bg)
        x0,x1=xs.min(),xs.max(); y0,y1=ys.min()+100, ys.min()+100+240
        im.crop((max(0,x0-10),y0,max(0,x1+10),y1)).resize(((x1-x0+20)*3,240*3), Image.NEAREST).save("preview/_diag/_q_stage_gem_head.png")
        await b.close()
asyncio.run(main())
