import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1"
JS="""async () => { const app=window.__app; const m=window.__models.map(x=>{const cm=x.internalModel.coreModel;const g=id=>{try{return cm.getParameterValueById(id)}catch(e){return null}};
 const r=x.getBounds(); return {hb:g('ParamHairBack'), hx:g('ParamAngleX'), b:[r.x,r.y,r.width,r.height]};});
 return {m, url: await app.renderer.extract.base64(app.stage,'image/png')}; }"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":800})
        await pg.goto(URL); await pg.wait_for_function("window.__ready===true",timeout=60000)
        await pg.wait_for_timeout(2500)
        hbr=[[] for _ in range(5)]; maxhole=[0]*5
        for k in range(24):
            d=await pg.evaluate(JS)
            for i,s in enumerate(d["m"][:5]):
                hbr[i].append(round(s["hb"],2))
            im=Image.open(io.BytesIO(base64.b64decode(d["url"].split(",",1)[1])))
            al=np.asarray(im)[...,3]
            fill=ndimage.binary_fill_holes(al>40)
            holes=fill&(al<40)
            for i,s in enumerate(d["m"][:5]):
                x,y,w,h=s["b"]; X0=max(0,int(x)); Y0=max(0,int(y)); X1=min(al.shape[1],int(x+w)); Y1=min(al.shape[0],int(y+h))
                sub=holes[Y0:Y1,X0:X1]
                maxhole[i]=max(maxhole[i], int(sub.sum()))
            await pg.wait_for_timeout(450)
        for i in range(5):
            v=[x for x in hbr[i] if x is not None]
            print(f"seat{i} HairBack min={min(v) if v else None} max={max(v) if v else None} maxholePx={maxhole[i]}")
        await b.close()
asyncio.run(main())
