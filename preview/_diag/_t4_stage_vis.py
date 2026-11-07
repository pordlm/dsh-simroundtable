# -*- coding: utf-8 -*-
"""t4 stage-scale visual proof: new model vs old model, dark stage colour, 1:1 and stage pixels."""
import base64, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable"); EVI = ROOT/"preview"/"_evidence"/"t4"; EVI.mkdir(parents=True, exist_ok=True)
BG = (16, 21, 34)
CASES = {
  "neutral":   dict(),
  "stage_pose":dict(AngleX=-6, AngleY=-3, AngleZ=0, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0),
}
def q(model, params):
    qs = ["scale=1", "model=" + model.replace("/", "%2F")]
    if params: qs.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items()))
    return "http://127.0.0.1:8848/preview/probe.html?" + "&".join(qs)

def grab(pg, model, params):
    pg.goto(q(model, params), wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'", timeout=180000)
    d = pg.evaluate("() => { const c = window.__app.renderer.extract.canvas(window.__model); c.toBlob(()=>{}); return window.__model ? (()=>{const cv=window.__app.renderer.extract.canvas(window.__model); return cv.toDataURL('image/png');})() : null; }")
    d = pg.evaluate("() => window.__app.renderer.extract.canvas(window.__model).toDataURL('image/png')")
    return Image.open(io.BytesIO(base64.b64decode(d.split(",")[1]))).convert("RGBA")

def on_bg(img, k=1.0):
    if k != 1.0:
        img = img.resize((max(1,int(img.width*k)), max(1,int(img.height*k))), Image.LANCZOS)
    base = Image.new("RGBA", img.size, BG + (255,))
    base.alpha_composite(img)
    return base.convert("RGB")

MODELS = {"new": "../assets/build/gemini-v1/gemini.layout.model3.json",
          "old": "../assets/build/gemini-v1.bak/gemini.layout.model3.json"}
FACE = (839, 510, 1211, 810)
out = {}
with sync_playwright() as p:
    br = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = br.new_page(viewport={"width": 300, "height": 300}, device_scale_factor=1)
    pg.set_default_timeout(180000)
    for tag, model in MODELS.items():
        for case, params in CASES.items():
            img = grab(pg, model, params)
            img.save(EVI / f"render_{tag}_{case}.png")
            # 1x on dark, face crop 4x
            full = on_bg(img)
            pad = 40
            box = (FACE[0]-pad, FACE[1]-pad, FACE[2]+pad, FACE[3]+pad)
            crop = full.crop(box)
            crop.resize((crop.width*4, crop.height*4), Image.NEAREST).save(EVI / f"face_{tag}_{case}_4x.png")
            # stage scale: stage shows the whole character at ~0.096 of canvas
            for k in (0.096,):
                small = on_bg(img, k)
                w, h = small.size
                sb = tuple(int(v*k) for v in box)
                sc = small.crop(sb)
                sc.resize((sc.width*6, sc.height*6), Image.NEAREST).save(EVI / f"face_{tag}_{case}_stage{k}_6x.png")
            out[f"{tag}_{case}"] = {"size": img.size}
    br.close()
print(json.dumps(out, ensure_ascii=False))
