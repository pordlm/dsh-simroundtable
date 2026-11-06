import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
M="../assets/build/grok-v1/grok.layout.model3.json"
async def shot(pg, params):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale=0.6&model={M}&{params}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(300)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1]))))[...,3]>200
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        for ang in (0,6,-6):
            row=[]
            for hf in (-0.11,0,0.11):
                on=await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:{hf}")
                off=await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:{hf}&part=PartHairFront:0")
                row.append(int((on&~off).sum()))
            print(f"ang={ang:3d} hairVisible(hf -0.11 / 0 / +0.11) = {row}", flush=True)
        await b.close()
asyncio.run(main())
