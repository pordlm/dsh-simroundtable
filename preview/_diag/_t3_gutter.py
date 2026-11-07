# -*- coding: utf-8 -*-
"""t3: the gutter along the face piece's cut edge -- profile + area + scale survival."""
import base64, io, json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
M="../assets/build/gemini-v1/gemini.layout.model3.json"
EVI=r"preview/_evidence/t3"
FR=dict(left=839,top=510,width=372,height=300)
def load(pg,params):
    q=["scale=1","model="+M.replace("/","%2F")]
    if params: q.append("p="+",".join("%s:%s"%(k,v) for k,v in params.items()).replace(",","%2C"))
    pg.goto("http://127.0.0.1:8848/preview/probe.html?"+"&".join(q),wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'",timeout=180000)
    b=pg.evaluate("async()=>await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.array(Image.open(io.BytesIO(base64.b64decode(b.split(',',1)[-1]))).convert("RGBA"))
matte=np.array(Image.open(r"assets/build/gemini-parts/matte.png").convert("RGBA"))
k=1.2599; ox=380.4; oy=68.5
def ref_alpha():
    # matte -> canvas: canvas = matte*k + offset
    out=np.zeros((2048,2048),np.float32)
    img=Image.fromarray(matte).resize((round(1024*k),round(1536*k)),Image.BILINEAR)
    a=np.array(img)[:,:,3].astype(np.float32)/255.0
    h,w=a.shape; L=int(round(ox)); T=int(round(oy))
    out[T:T+h,L:L+w]=a[:min(h,2048-T),:min(w,2048-L)]
    return out
REF=ref_alpha()
CASES=[("neutral",{}),("stage_pose",dict(AngleX=-6,AngleY=-3,BodyAngleX=-2.3,HairFront=-0.118,Breath=1.0)),
       ("anglex_m10",dict(AngleX=-10)),("anglex_m15",dict(AngleX=-15)),
       ("anglex_p10",dict(AngleX=10)),("angley_m8",dict(AngleY=-8)),("angley_p8",dict(AngleY=8))]
rep={}
with sync_playwright() as p:
    br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=br.new_page(viewport={"width":300,"height":300},device_scale_factor=1); pg.set_default_timeout(180000)
    for name,par in CASES:
        img=load(pg,par); A=img[:,:,3].astype(np.float32)/255.0
        # 1) gutter: inside face bbox+8, master opaque, composite semi-transparent
        ss=(slice(FR["top"]-8,FR["top"]+FR["height"]+8),slice(FR["left"]-8,FR["left"]+FR["width"]+8))
        a=A[ss]; r=REF[ss]
        semi=(a>0.15)&(a<0.85)&(r>0.9)
        hole=(a<=0.15)&(r>0.9)
        # 2) darkness deficit: how much light the gap steals
        deficit=float(np.clip(r-a,0,1).sum())
        # 3) profile columns across the left seam and rows across the bottom seam
        col={}
        for x in range(FR["left"]-10,FR["left"]+16):
            col[x]=round(float(A[FR["top"]+80:FR["top"]+260,x].mean()),3)
        row={}
        for y in range(FR["top"]+FR["height"]-14,FR["top"]+FR["height"]+14):
            row[y]=round(float(A[y,FR["left"]+80:FR["left"]+300].mean()),3)
        rep[name]=dict(semi_px=int(semi.sum()),hole_px=int(hole.sum()),deficit=round(deficit,1),
                       maxdrop=round(float((r-a)[semi].max()) if semi.any() else 0,3),
                       left_col=col, bottom_row=row)
        print("%-11s semi(0.15-0.85)=%5d  hole<=0.15=%4d  deficit=%8.1f"%(name,rep[name]["semi_px"],rep[name]["hole_px"],rep[name]["deficit"]),flush=True)
    br.close()
json.dump(rep,open(EVI+"/face_gutter.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print("\nleft seam column profile (mean alpha over y=face.top+80..+260):")
for k2 in rep: print(" %-11s"%k2, " ".join("%d:%.2f"%(x,rep[k2]["left_col"][x]) for x in sorted(rep[k2]["left_col"])))
print("\nbottom seam row profile (mean alpha over x=face.left+80..+300):")
for k2 in rep: print(" %-11s"%k2, " ".join("%d:%.2f"%(y,rep[k2]["bottom_row"][y]) for y in sorted(rep[k2]["bottom_row"])))
