import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
GM="../assets/build/gemini-v1/gemini.layout.model3.json"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        u=f"http://127.0.0.1:8848/preview/probe.html?scale=1&model={GM}&p=ParamAngleX:0"
        await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
        await pg.wait_for_timeout(400)
        b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
        im=Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1]))).convert("RGBA")
        a=np.asarray(im)[...,3]; ys,xs=np.where(a>40)
        x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max(); h=y1-y0
        c=im.crop((x0,y0,x1,y0+int(h*0.32)))
        bg=Image.new("RGB",c.size,(18,25,39)); bg.paste(c,(0,0),c)
        bg.save("preview/_evidence/gemini_1x.png"); print("1x", bg.size)
        await b.close()
asyncio.run(main())
