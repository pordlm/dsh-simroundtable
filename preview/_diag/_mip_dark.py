import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
GM="../assets/build/gemini-v1/gemini.layout.model3.json"
G="../assets/build/grok-v1/grok.layout.model3.json"
async def grab(pg, model, params):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale=0.35&model={model}&{params}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(400)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1])))).astype(np.int16)
def dark(a):
    al=a[...,3]; lum=a[...,:3].mean(axis=2)
    return int(((al>180)&(lum<26)).sum()), int((al>180).sum())
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        for name,m in (("gemini",GM),("grok",G)):
            for tag,extra in (("plain",""),("mip","&mip=1")):
                d,t=await grab(pg,m,f"p=ParamAngleX:0{extra}").then if False else (None,None)
                a=await grab(pg,m,f"p=ParamAngleX:0{extra}")
                dk,tot=dark(a)
                print(f"{name:7s} {tag:5s} dark={dk:5d} / opaque={tot:7d}", flush=True)
        await b.close()
asyncio.run(main())
