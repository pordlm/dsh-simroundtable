import base64, io, json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
M="../assets/build/gemini-v1/gemini.layout.model3.json"
FR=dict(left=839,top=510,width=372,height=300)
k=1.2599; ox=380.4; oy=68.5
matte=np.array(Image.open(r"assets/build/gemini-parts/matte.png").convert("RGBA"))
img=Image.fromarray(matte).resize((round(1024*k),round(1536*k)),Image.BILINEAR)
_a=np.array(img).astype(np.float32); REF=np.zeros((2048,2048,4),np.float32)
h,w,_=_a.shape; L0=int(round(ox)); T0=int(round(oy)); REF[T0:T0+h,L0:L0+w]=_a[:min(h,2048-T0),:min(w,2048-L0)]
RA=REF[:,:,3]/255.0; RL=0.299*REF[:,:,0]+0.587*REF[:,:,1]+0.114*REF[:,:,2]
with sync_playwright() as p:
    br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=br.new_page(viewport={"width":300,"height":300},device_scale_factor=1); pg.set_default_timeout(180000)
    pg.goto("http://127.0.0.1:8848/preview/probe.html?scale=1&model="+M.replace("/","%2F"),wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'",timeout=180000)
    b=pg.evaluate("async()=>await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    im=np.array(Image.open(io.BytesIO(base64.b64decode(b.split(',',1)[-1]))).convert("RGBA")).astype(np.float32)
    br.close()
ss=(slice(FR["top"]-10,FR["top"]+FR["height"]+10),slice(FR["left"]-10,FR["left"]+FR["width"]+10))
A=im[ss][:,:,3]/255.0; L=0.299*im[ss][:,:,0]+0.587*im[ss][:,:,1]+0.114*im[ss][:,:,2]
ra=RA[ss]; rl=RL[ss]
dark=(ra>0.9)&(A>0.85)&((rl-L)>45)
dark[:280,:]=False
ys,xs=np.nonzero(dark)
print("jaw-band dark px:",dark.sum())
vis=im[ss]
for i in np.linspace(0,len(ys)-1,6).astype(int):
    y,x=ys[i],xs[i]
    cy,cx=y+FR["top"]-10,x+FR["left"]-10
    print(" canvas(%d,%d) render RGBA=%s A=%.2f  master RGB=%s A=%.2f"%(
      cx,cy,vis[y,x,:3].astype(int),A[y,x],REF[cy,cx,:3].astype(int),ra[y,x]))
