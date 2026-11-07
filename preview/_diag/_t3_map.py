# -*- coding: utf-8 -*-
"""t3: ASCII defect map around the face, several poses."""
import base64, io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
M="../assets/build/gemini-v1/gemini.layout.model3.json"
FR=dict(left=839,top=510,width=372,height=300)
matte=np.array(Image.open(r"assets/build/gemini-parts/matte.png").convert("RGBA"))
k=1.2599; ox=380.4; oy=68.5
def ref_alpha():
    out=np.zeros((2048,2048),np.float32)
    img=Image.fromarray(matte).resize((round(1024*k),round(1536*k)),Image.BILINEAR)
    a=np.array(img)[:,:,3].astype(np.float32)/255.0
    h,w=a.shape; L=int(round(ox)); T=int(round(oy)); out[T:T+h,L:L+w]=a[:min(h,2048-T),:min(w,2048-L)]
    return out
REF=ref_alpha()
def load(pg,par):
    q=["scale=1","model="+M.replace("/","%2F")]
    if par: q.append("p="+",".join("%s:%s"%(a,b) for a,b in par.items()).replace(",","%2C"))
    pg.goto("http://127.0.0.1:8848/preview/probe.html?"+"&".join(q),wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'",timeout=180000)
    b=pg.evaluate("async()=>await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.array(Image.open(io.BytesIO(base64.b64decode(b.split(',',1)[-1]))).convert("RGBA"))[:,:,3].astype(np.float32)/255.0
CASES=[("neutral",{}),("stage_pose",dict(AngleX=-6,AngleY=-3,BodyAngleX=-2.3,HairFront=-0.118,Breath=1.0)),("anglex_m10",dict(AngleX=-10)),("anglexy_p6p4",dict(AngleX=6,AngleY=4))]
X0,X1,Y0,Y1=815,1235,486,834; B=8
with sync_playwright() as p:
    br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=br.new_page(viewport={"width":300,"height":300},device_scale_factor=1); pg.set_default_timeout(180000)
    for nm,par in CASES:
        A=load(pg,par)
        a=A[Y0:Y1,X0:X1]; r=REF[Y0:Y1,X0:X1]
        hole=(a<0.30)&(r>0.9); semi=(a>=0.30)&(a<0.85)&(r>0.9)
        print("\n=== %s   hole=%d semi=%d   (x %d..%d, y %d..%d, cell=%dpx)"%(nm,hole.sum(),semi.sum(),X0,X1,Y0,Y1,B))
        print("     "+"".join(str(((X0+i*B)//100)%10) for i in range((X1-X0)//B)))
        for j in range((Y1-Y0)//B):
            row=""
            for i in range((X1-X0)//B):
                h=hole[j*B:(j+1)*B,i*B:(i+1)*B].sum(); s=semi[j*B:(j+1)*B,i*B:(i+1)*B].sum()
                row += "#" if h>=6 else ("*" if h>0 else ("+" if s>=6 else ("." if s>0 else " ")))
            print("%4d "%(Y0+j*B)+row)
    br.close()
