import asyncio, io, base64, os
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
os.makedirs("preview/_evidence", exist_ok=True)
M="../assets/build/grok-v1/grok.layout.model3.json"
async def shot(pg, params):
    u=f"http://127.0.0.1:8848/preview/probe.html?scale=0.6&model={M}&{params}"
    await pg.goto(u); await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(350)
    b64=await pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return Image.open(io.BytesIO(base64.b64decode(b64.split(",",1)[1]))).convert("RGBA")
def headcrop(im):
    a=np.asarray(im)[...,3]; ys,xs=np.where(a>40)
    x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
    # head = top 34% of the figure
    h=int(y1-y0); return im.crop((x0,max(y0,y0),x1,y0+int(h*0.36)))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        tiles=[]
        for ang in (0,6,-6):
            im=await shot(pg,f"p=ParamAngleX:{ang},ParamHairFront:0")
            c=headcrop(im); c=c.resize((c.width*2,c.height*2), Image.LANCZOS)
            tiles.append((ang,c))
        w=max(t[1].width for t in tiles); h=sum(t[1].height for t in tiles)
        sheet=Image.new("RGB",(w,h),(18,25,39)); y=0
        for ang,c in tiles:
            bg=Image.new("RGB",c.size,(18,25,39)); bg.paste(c,(0,0),c); sheet.paste(bg,(0,y)); y+=c.height
        sheet.save("preview/_evidence/grok_head_angles.png")
        print("saved grok_head_angles.png", sheet.size)
        await b.close()
asyncio.run(main())
