import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
G="../assets/build/grok-v1/grok.layout.model3.json"
async def shot(pg, model, params):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale=0.6&model={model}&{params}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(350)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1]))).convert("RGBA")
def crop_head(im, frac=0.40):
    a=np.asarray(im)[...,3]; ys,xs=np.where(a>40)
    x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max(); h=y1-y0
    return im.crop((x0,y0,x1,y0+int(h*frac)))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        a=await shot(pg,G,"p=ParamAngleX:0")
        c=await shot(pg,G,"p=ParamAngleX:0&part=PartHairFront:0")
        ca,cc=crop_head(a),crop_head(c)
        W=ca.width+cc.width
        sheet=Image.new("RGB",(W,ca.height),(18,25,39))
        for i,img in enumerate((ca,cc)):
            bg=Image.new("RGB",img.size,(18,25,39)); bg.paste(img,(0,0),img); sheet.paste(bg,(i*img.width,0))
        sheet=sheet.resize((sheet.width*2,sheet.height*2), Image.LANCZOS)
        sheet.save("preview/_evidence/grok_fronthair_onoff.png")
        print("grok on/off", sheet.size, "delta px", int(((np.asarray(a)[...,3]>200)!=(np.asarray(c)[...,3]>200)).sum()))
        await b.close()
asyncio.run(main())
