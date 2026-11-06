import asyncio, io, base64
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np
URL="http://127.0.0.1:8848/preview/longtable.html?n=3&names=Grok,Gemini,Claude&nochairs=1"
GRAB="""async () => { const app = window.__app;
  const seats = window.__seats.map(s => { const b = s.model.getBounds(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; });
  const url = await app.renderer.extract.base64(app.stage, 'image/png');
  return { seats, url }; }"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":920})
        await pg.goto(URL); await pg.wait_for_function("window.__stageReady===true",timeout=30000)
        await pg.wait_for_timeout(2000)
        series={0:[],1:[],2:[]}; frames={}
        for k in range(90):
            await pg.wait_for_timeout(150)
            g=await pg.evaluate(GRAB)
            im=Image.open(io.BytesIO(base64.b64decode(g["url"].split(",")[1]))).convert("RGBA")
            a=np.asarray(im).astype(np.int16)
            for i,(x,y,w,h) in enumerate(g["seats"]):
                x0,y0=max(0,x),max(0,y); x1,y1=min(a.shape[1],x+w),min(a.shape[0],y+h)
                sub=a[y0:y1,x0:x1]; alpha=sub[...,3]; rgb=sub[...,:3]
                dark=((rgb[...,0]<24)&(rgb[...,1]<24)&(rgb[...,2]<24)&(alpha>200)); n=int(dark.sum())
                series[i].append(n)
                frames[(i,k)]=(n, im.crop((x0,y0,x1,y1)))
        for i in series:
            s=np.array(series[i]); print(f"seat{i} min={s.min()} med={int(np.median(s))} max={s.max()} p90={int(np.percentile(s,90))} series={list(s[:20])}")
        for i in series:
            ks=[k for k in range(90)]
            kx=max(ks,key=lambda k:frames[(i,k)][0]); kn=min(ks,key=lambda k:frames[(i,k)][0])
            frames[(i,kx)][1].save(f"preview/_dh_seat{i}_max.png"); frames[(i,kn)][1].save(f"preview/_dh_seat{i}_min.png")
            print(f"seat{i} maxFrame={kx} n={frames[(i,kx)][0]} minFrame={kn} n={frames[(i,kn)][0]}")
        await b.close()
asyncio.run(main())
