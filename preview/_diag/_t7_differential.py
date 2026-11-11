import numpy as np, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
BASE="http://127.0.0.1:8848"
CASES={"neutral":"","stage_pose":"AngleX:-6,AngleY:-3,BodyAngleX:-2.3,HairFront:-0.118,Breath:1","m10":"AngleX:-10","p6p4":"AngleX:6,AngleY:4"}
ms=Image.open(r"assets/build/gemini-parts/matte.png").convert("RGBA")
k=1.2599; ms=ms.resize((int(round(ms.width*k)),int(round(ms.height*k))),Image.LANCZOS)
MT=np.zeros((2048,2048,4),np.uint8); MT[68:68+ms.height,380:380+ms.width]=np.asarray(ms)
face=(839,510,1211,810)
def extract(pg):
    b64=pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b64.split(',')[1]))).convert("RGBA")).astype(int)
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={"width":700,"height":700},device_scale_factor=1)
    for name,pp in CASES.items():
        got={}
        for bg in ("white","magenta"):
            qs=["scale=1.0",f"bg={bg}"]+([f"p={pp}"] if pp else [])
            pg.goto(BASE+"/preview/probe.html?"+"&".join(qs),wait_until="load")
            pg.wait_for_function("() => document.title === 'READY'",timeout=120000)
            got[bg]=extract(pg)
        diff=(np.abs(got["white"][...,:3]-got["magenta"][...,:3]).sum(-1)>24)
        zone=(MT[...,3]>230); sub=np.zeros_like(zone); sub[face[1]:face[3],face[0]:face[2]]=True
        bad=diff&zone&sub
        a=got["white"][...,3]
        hole=(a<60)&zone&sub
        print(f"{name}: bg-dep px {int(bad.sum())} | alpha<60 in skin zone {int(hole.sum())}", end="")
        if bad.sum():
            ys,xs=np.nonzero(bad); print("  bbox",int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max()))
        else: print()
    b.close()
