# -*- coding: utf-8 -*-
"""t3: split the two mechanisms at the face -- (a) alpha gutter (bg shows through)
and (b) baked-in dark paint (opaque but far darker than the master)."""
import base64, io, json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
M="../assets/build/gemini-v1/gemini.layout.model3.json"
EVI=r"preview/_evidence/t3"
FR=dict(left=839,top=510,width=372,height=300)
k=1.2599; ox=380.4; oy=68.5
matte=np.array(Image.open(r"assets/build/gemini-parts/matte.png").convert("RGBA"))
img=Image.fromarray(matte).resize((round(1024*k),round(1536*k)),Image.BILINEAR)
_a=np.array(img).astype(np.float32)
REF=np.zeros((2048,2048,4),np.float32); h,w,_=_a.shape; L0=int(round(ox)); T0=int(round(oy))
REF[T0:T0+h,L0:L0+w]=_a[:min(h,2048-T0),:min(w,2048-L0)]
RA=REF[:,:,3]/255.0
RL=(0.299*REF[:,:,0]+0.587*REF[:,:,1]+0.114*REF[:,:,2])
# eye / brow boxes excluded from the dark metric (legit dark eyelashes show where the
# master had bangs)
LY=json.load(open(r"assets/build/gemini-v1/gemini.layout.json",encoding="utf-8"))
R={l["name"]:l["rect"] for l in LY["layers"]}
EX=np.zeros((2048,2048),bool)
for n in ("eyewhite-l","eyewhite-r","eye close-l","eye close-r","irides-l","irides-r"):
    r=R[n]; EX[r["top"]-18:r["top"]+r["height"]+18, r["left"]-18:r["left"]+r["width"]+18]=True
EX[FR["top"]:FR["top"]+150, :]=True   # eyebrows / bangs row band
def load(pg,par):
    q=["scale=1","model="+M.replace("/","%2F")]
    if par: q.append("p="+",".join("%s:%s"%(a,b) for a,b in par.items()).replace(",","%2C"))
    pg.goto("http://127.0.0.1:8848/preview/probe.html?"+"&".join(q),wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'",timeout=180000)
    b=pg.evaluate("async()=>await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.array(Image.open(io.BytesIO(base64.b64decode(b.split(',',1)[-1]))).convert("RGBA")).astype(np.float32)
CASES=[("neutral",{}),("stage_pose",dict(AngleX=-6,AngleY=-3,BodyAngleX=-2.3,HairFront=-0.118,Breath=1.0)),
       ("anglex_m10",dict(AngleX=-10)),("angley_p8",dict(AngleY=8)),("anglexy_p6p4",dict(AngleX=6,AngleY=4))]
print("%-12s %8s %10s %8s %9s %10s"%("case","gap_px","gap_maxdef","dark_px","darkDL","dark_in_jaw"))
rows={}
with sync_playwright() as p:
    br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=br.new_page(viewport={"width":300,"height":300},device_scale_factor=1); pg.set_default_timeout(180000)
    for nm,par in CASES:
        im=load(pg,par)
        ss=(slice(FR["top"]-10,FR["top"]+FR["height"]+10),slice(FR["left"]-10,FR["left"]+FR["width"]+10))
        A=im[ss][:,:,3]/255.0; L=0.299*im[ss][:,:,0]+0.587*im[ss][:,:,1]+0.114*im[ss][:,:,2]
        ra=RA[ss]; rl=RL[ss]; ex=EX[ss]
        gap=(ra>0.9)&(A<0.85)
        dark=(ra>0.9)&(A>0.85)&((rl-L)>45)&~ex
        jaw=np.zeros_like(dark); jaw[270:,:]=True
        rows[nm]=dict(gap=int(gap.sum()),gap_maxdef=round(float((ra-A)[gap].max()) if gap.any() else 0,3),
                      dark=int(dark.sum()),dark_meanDL=round(float((rl-L)[dark].mean()) if dark.any() else 0,1),
                      dark_in_jaw=int((dark&jaw).sum()))
        print("%-12s %8d %10.3f %8d %9.1f %10d"%(nm,rows[nm]["gap"],rows[nm]["gap_maxdef"],rows[nm]["dark"],rows[nm]["dark_meanDL"],rows[nm]["dark_in_jaw"]))
        if nm in ("neutral","stage_pose"):
            vis=im[ss].astype(np.uint8); ov=vis.copy()
            ov[gap]=[0,255,255,255]; ov[dark]=[255,0,0,255]
            out=Image.fromarray(np.concatenate([vis,ov],axis=1))
            out.resize((out.width*2,out.height*2),Image.NEAREST).save(EVI+"/face_two_mechanisms_%s.png"%nm)
    br.close()
json.dump(rows,open(EVI+"/face_two_mechanisms.json","w"),indent=1)
