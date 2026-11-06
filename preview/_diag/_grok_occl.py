import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
M="../assets/build/grok-v1/grok.layout.model3.json"
async def shot(pg, params):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale=0.6&model={M}&{params}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(350)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1]))))[...,3]>200
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        for ang in (0,12,-12):
            for hf in (0.0,0.22,-0.22):
                on = await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:{hf}")
                off= await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:{hf}&part=PartHairFront:0")
                fon= await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:{hf}&part=PartFace:0")
                foff=await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:{hf}&part=PartFace:0,PartHairFront:0")
                withface=int((on&~off).sum()); noface=int((fon&~foff).sum())
                print(f"ang={ang:3d} hf={hf:+.2f} hairVisible_withFace={withface:6d} hairVisible_faceHidden={noface:6d} delta={noface-withface:+6d}", flush=True)
        await b.close()
asyncio.run(main())
