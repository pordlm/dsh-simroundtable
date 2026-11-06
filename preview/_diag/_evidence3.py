import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
G="../assets/build/grok-v1/grok.layout.model3.json"
GM="../assets/build/gemini-v1/gemini.layout.model3.json"
async def shot(pg, model, params):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale=0.6&model={model}&{params}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(350)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1]))).convert("RGBA")
def crop_head(im, frac=0.34):
    a=np.asarray(im)[...,3]; ys,xs=np.where(a>40)
    x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max(); h=y1-y0
    return im.crop((x0,y0,x1,y0+int(h*frac)))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        for name,model,params in [("grok_m6",G,"p=ParamAngleX:-6"),("gemini_0",GM,"p=ParamAngleX:0")]:
            im=await shot(pg,model,params)
            c=crop_head(im)
            c=c.resize((c.width*3,c.height*3), Image.LANCZOS)
            bg=Image.new("RGB",c.size,(18,25,39)); bg.paste(c,(0,0),c)
            bg.save(f"preview/_evidence/{name}.png"); print(name, bg.size)
        await b.close()
asyncio.run(main())
