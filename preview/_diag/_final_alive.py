import asyncio, io, base64
from PIL import Image
import numpy as np
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek"
JS="""async () => { const app=window.__app; return {url: await app.renderer.extract.base64(app.stage,'image/png'),
 m: window.__models.map(x=>{const cm=x.internalModel.coreModel; const g=id=>{try{return cm.getParameterValueById(id)}catch(e){return null}}; return {hf:g('ParamHairFront'),hx:g('ParamAngleX'),hb:g('ParamHairBack'),eye:g('ParamEyeLOpen')};})}; }"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":800})
        await pg.goto(URL); await pg.wait_for_function("window.__ready===true",timeout=60000)
        await pg.wait_for_timeout(2500)
        prev=None; diffs=[]
        for k in range(10):
            d=await pg.evaluate(JS)
            im=np.asarray(Image.open(io.BytesIO(base64.b64decode(d["url"].split(",",1)[1])))).astype(np.int16)
            if prev is not None: diffs.append(round(float(np.abs(im-prev).mean()),2))
            prev=im
            await pg.wait_for_timeout(400)
        st=d["m"][:5]
        print("frame-day diffs:", diffs)
        print("Grok hf/hx/hb:", [round(st[0]["hf"],3), round(st[0]["hx"],2), round(st[0]["hb"],3)])
        print("eye now:", [round(s["eye"],2) for s in st])
        await b.close()
asyncio.run(main())
