import numpy as np, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
BASE="http://127.0.0.1:8848"
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={"width":760,"height":438},device_scale_factor=3)
    pg.goto(BASE+"/preview/stage-760.html?n=1&names=Gemini&active=0&tpin=6000&nogest=1&seed=7",wait_until="load")
    pg.wait_for_function("() => window.__models && window.__models.length",timeout=60000)
    pg.wait_for_timeout(2500)
    shot=pg.screenshot()
    img=Image.open(io.BytesIO(shot)).convert("RGB")
    img.save(r"preview\_evidence\t7\stage_dpr3_full.png")
    w,h=img.size
    print("stage dpr3 size",w,h)
    # head is roughly upper-middle of the single seat
    crop=img.crop((int(w*0.30),int(h*0.05),int(w*0.70),int(h*0.62)))
    crop=crop.resize((crop.width*3,crop.height*3),Image.NEAREST)
    crop.save(r"preview\_evidence\t7\stage_dpr3_head_3x.png"); print("crop",crop.size)
    b.close()
