import base64, io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
M="../assets/build/gemini-v1/gemini.layout.model3.json"
def load(pg,q):
    pg.goto("http://127.0.0.1:8848/preview/probe.html?"+q, wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'", timeout=180000)
    meta=pg.inner_text("#meta")
    b=pg.evaluate("async()=>await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    a=np.array(Image.open(io.BytesIO(base64.b64decode(b.split(',',1)[-1]))).convert('RGBA'))[:,:,3]
    return meta,(a>127).sum()
with sync_playwright() as p:
    br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=br.new_page(viewport={"width":300,"height":300},device_scale_factor=1); pg.set_default_timeout(180000)
    for q in ["scale=1&model="+M.replace('/','%2F'),
              "scale=1&model="+M.replace('/','%2F')+"&part=PartHead:0",
              "scale=1&model="+M.replace('/','%2F')+"&part=PartFace:0",
              "scale=1&model="+M.replace('/','%2F')+"&part=PartBody:0",
              "scale=1&model="+M.replace('/','%2F')+"&part=PartExtra:0",
              "scale=1&model="+M.replace('/','%2F')+"&part=PartHead:0,PartHairBack:0",
              "scale=1&model="+M.replace('/','%2F')+"&part=PartHairBack:0,PartFace:0,PartHairFront:0,PartHeadAccessories:0,PartExtra:0,PartBody:0"]:
        m,px=load(pg,q); print(px,'|',m)
    br.close()
