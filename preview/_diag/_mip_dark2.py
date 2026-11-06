import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
GM="../assets/build/gemini-v1/gemini.layout.model3.json"
G="../assets/build/grok-v1/grok.layout.model3.json"
async def grab(pg, model, scale, extra=""):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale={scale}&model={model}&p=ParamAngleX:0{extra}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(500)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    im=np.asarray(Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1])))).astype(np.int16)
    al=im[...,3]; lum=im[...,:3].mean(axis=2)
    # "hole" = dark pixel inside the figure that is surrounded by opaque pixels
    return int(((al>200)&(lum<28)).sum()), int((al>200).sum())
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        for name,m in (("gemini",GM),("grok",G)):
            for scale in (0.35,0.2):
                a=await grab(pg,m,scale,"")
                c=await grab(pg,m,scale,"&mip=1")
                print(f"{name:7s} scale={scale}: plain dark={a[0]:5d}/{a[1]:6d}   mip dark={c[0]:5d}/{c[1]:6d}", flush=True)
        await b.close()
asyncio.run(main())
