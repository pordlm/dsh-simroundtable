# -*- coding: utf-8 -*-
"""Real-stage-scale (k=0.379, derived from user report iris spacing) proof images."""
import base64, io, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
E = Path(r"D:\dsh_simroundtable\preview\_evidence\t4")
BG=(16,21,34)
FACE=(839,510,1211,810)
CASES={"neutral":{},"stage_pose":dict(AngleX=-6,AngleY=-3,BodyAngleX=-2.3,HairFront=-0.118,Breath=1.0)}
MODELS={"new":"../assets/build/gemini-v1/gemini.layout.model3.json",
        "old":"../assets/build/gemini-v1.bak/gemini.layout.model3.json"}
def grab(pg,model,params,mip):
    qs=["scale=1","model="+model.replace("/","%2F")]
    if params: qs.append("p="+",".join("%s:%s"%(k,v) for k,v in params.items()))
    if mip: qs.append("mip=1")
    pg.goto("http://127.0.0.1:8848/preview/probe.html?"+"&".join(qs),wait_until="load")
    pg.wait_for_function("()=>document.title==='READY'",timeout=180000)
    d=pg.evaluate("()=>window.__app.renderer.extract.canvas(window.__model).toDataURL('image/png')")
    return Image.open(io.BytesIO(base64.b64decode(d.split(",")[1]))).convert("RGBA")
def comp(img,k):
    if k!=1.0: img=img.resize((max(1,int(round(img.width*k))),max(1,int(round(img.height*k)))),Image.LANCZOS)
    base=Image.new("RGBA",img.size,BG+(255,)); base.alpha_composite(img); return base.convert("RGB")
KS=(0.379,0.30,0.45)
for mip in (False,True):
    with sync_playwright() as p:
        br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=br.new_page(viewport={"width":300,"height":300},device_scale_factor=1); pg.set_default_timeout(180000)
        for tag,m in MODELS.items():
            for case,par in CASES.items():
                img=grab(pg,m,par,mip)
                if mip: pass
                img.save(E/("render_%s_%s%s.png"%(tag,case,"_mip" if mip else "")))
                for k in KS:
                    s=comp(img,k); pad=int(round(24*k))
                    box=(int(FACE[0]*k)-pad,int(FACE[1]*k)-pad,int(FACE[2]*k)+pad,int(FACE[3]*k)+pad)
                    c=s.crop(box)
                    f=max(2,int(round(6/ (k/0.379) ))) if False else 6
                    c.resize((c.width*6,c.height*6),Image.NEAREST).save(E/("face_%s_%s_k%s%s_6x.png"%(tag,case,str(k).replace('.',''),"_mip" if mip else "")))
        br.close()
print("ok")
