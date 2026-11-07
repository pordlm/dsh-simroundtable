# -*- coding: utf-8 -*-
"""t3: ground-truth hole audit.

The cut-out master (`assets/build/gemini-parts/matte.png`, 1024x1536) is the
reference for "the character owns this pixel".  Mapped into the layout canvas
(scale 1.2599, offset 380.4/68.5 - fitted from the alpha bboxes) it says which
pixels must be covered.  Any pixel the master says is opaque but the rendered
frame shows as transparent is a real "background showing through the model"
defect - this catches open slits as well as enclosed holes, and it does not
need a morphological guess.

Writes preview/_evidence/t3/truth_<case>.png (defect heatmap over the render)
and preview/_evidence/t3/truth_report.txt / .json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
EVI = ROOT / "preview" / "_evidence" / "t3"
EVI.mkdir(parents=True, exist_ok=True)
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
MATTE = ROOT / "assets" / "build" / "gemini-parts" / "matte.png"
LAYOUT = ROOT / "assets" / "build" / "gemini-v1" / "gemini.layout.json"
SCALE = 1.2599
OFF = (380.4, 68.5)

CASES = [
    ("neutral", {}, {}),
    ("stage_pose", dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0), {}),
    ("stage_pose_breath0", dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=0.0), {}),
    ("anglex_m10", dict(AngleX=-10, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5), {}),
    ("angley_m4", dict(AngleX=0, AngleY=-4, BodyAngleX=0, HairFront=0, Breath=0.5), {}),
    ("angley_p4", dict(AngleX=0, AngleY=+4, BodyAngleX=0, HairFront=0, Breath=0.5), {}),
    ("anglexy_m6m4", dict(AngleX=-6, AngleY=-4, BodyAngleX=0, HairFront=0, Breath=0.5), {}),
    ("anglexy_p6p4", dict(AngleX=+6, AngleY=+4, BodyAngleX=0, HairFront=0, Breath=0.5), {}),
    ("hair_m25", dict(AngleX=0, AngleY=0, BodyAngleX=0, HairFront=-0.25, Breath=0.5), {}),
    ("hair_p25", dict(AngleX=0, AngleY=0, BodyAngleX=0, HairFront=+0.25, Breath=0.5), {}),
    ("body_m5", dict(AngleX=0, AngleY=0, BodyAngleX=-5, HairFront=0, Breath=0.5), {}),
    ("body_p5", dict(AngleX=0, AngleY=0, BodyAngleX=+5, HairFront=0, Breath=0.5), {}),
    ("angz_m8", dict(AngleZ=-8, AngleX=0, AngleY=0, HairFront=0), {}),
    ("angz_p8", dict(AngleZ=+8, AngleX=0, AngleY=0, HairFront=0), {}),
    ("bodyz_m8", dict(BodyAngleZ=-8, BodyAngleX=0, AngleY=0, HairFront=0), {}),
    ("bodyz_p8", dict(BodyAngleZ=+8, BodyAngleX=0, AngleY=0, HairFront=0), {}),
    ("eyes_closed", dict(EyeLOpen=0, EyeROpen=0, AngleX=0, AngleY=0, HairFront=0), {}),
    ("mouth_open", dict(MouthOpenY=1.0, AngleX=0, AngleY=0, HairFront=0), {}),
]


def ref_canvas():
    mat = np.array(Image.open(MATTE).convert("RGBA")).astype(np.float32)
    h, w = mat.shape[:2]
    out = np.zeros((2048, 2048, 4), np.float32)
    # canvas -> matte coords, nearest sample (alpha is what matters)
    ys = (np.arange(2048, dtype=np.float32) - OFF[1]) / SCALE
    xs = (np.arange(2048, dtype=np.float32) - OFF[0]) / SCALE
    yi = np.clip(np.round(ys).astype(np.int32), 0, h - 1)
    xi = np.clip(np.round(xs).astype(np.int32), 0, w - 1)
    ok_y = (ys >= -0.5) & (ys <= h - 0.5)
    ok_x = (xs >= -0.5) & (xs <= w - 0.5)
    sub = mat[np.ix_(yi, xi)]
    sub[~ok_y, :, :] = 0
    sub[:, ~ok_x, :] = 0
    return sub


REF = ref_canvas()
REF_A = REF[:, :, 3] / 255.0
LAY = json.loads(LAYOUT.read_text(encoding="utf-8"))
RECTS = {l["name"]: l["rect"] for l in LAY["layers"]}


def owners(cx, cy):
    hit = []
    for name, r in RECTS.items():
        if r["left"] - 4 <= cx <= r["left"] + r["width"] + 4 and r["top"] - 4 <= cy <= r["top"] + r["height"] + 4:
            hit.append(name)
    return hit


def analyse(rgba, case, dump=True):
    A = rgba[:, :, 3] / 255.0
    defect = (REF_A > 0.85) & (A < 0.60)
    # drop pixels whose neighbours are also empty and that sit on the outer
    # silhouette: those are legit (the master has a soft glow the rig keeps).
    lab, n = ndi.label(defect)
    sizes = ndi.sum(defect, lab, range(1, n + 1)) if n else []
    comps = []
    for k in np.argsort(sizes)[::-1] if n else []:
        if sizes[k] < 12:
            break
        ys, xs = np.where(lab == int(k) + 1)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
        cx, cy = float(xs.mean()), float(ys.mean())
        comps.append(dict(px=int(sizes[k]), bbox=[x0, y0, x1, y1], c=[round(cx, 1), round(cy, 1)],
                          owners=owners(cx, cy), fill=round(int(sizes[k]) / max(1.0, (x1 - x0 + 1) * (y1 - y0 + 1)), 3)))
    tot = int(defect.sum())
    face_rect = RECTS["face"]
    fx0, fy0 = face_rect["left"] - 30, face_rect["top"] - 30
    fx1, fy1 = fx0 + face_rect["width"] + 60, fy0 + face_rect["height"] + 60
    in_face = int(defect[fy0:fy1, fx0:fx1].sum())
    head_rect = RECTS["head base"]
    hx0, hy0 = head_rect["left"], head_rect["top"]
    in_head = int(defect[hy0:hy0 + head_rect["height"], hx0:hx0 + head_rect["width"]].sum())
    if dump:
        over = np.zeros((2048, 2048, 3), np.uint8)
        base = (rgba[:, :, :3].astype(np.float32) * A[:, :, None] + np.array([24, 22, 30], np.float32) * (1 - A[:, :, None]))
        over = base.astype(np.uint8).copy()
        over[defect] = (255, 40, 40)
        img = Image.fromarray(over)
        d = ImageDraw.Draw(img)
        d.rectangle([fx0, fy0, fx1, fy1], outline=(0, 200, 255))
        img.crop((460, 90, 1600, 1500)).save(EVI / ("truth_%s.png" % case))
    return dict(total=tot, in_face=in_face, in_head=in_head, comps=comps)


def main():
    lines = []
    rep = {}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 300, "height": 300}, device_scale_factor=1)
        pg.set_default_timeout(180000)
        for case, params, parts in CASES:
            qs = ["scale=1", "model=" + MODEL.replace("/", "%2F")]
            if params:
                qs.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items()).replace(":", "%3A").replace(",", "%2C"))
            pg.goto("http://127.0.0.1:8848/preview/probe.html?" + "&".join(qs), wait_until="load")
            pg.wait_for_function("() => document.title === 'READY'", timeout=180000)
            b64 = pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
            import base64, io
            rgba = np.array(Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA"))
            res = analyse(rgba, case)
            rep[case] = dict(params=params, **res)
            head = "%-20s total=%6d face=%5d head=%5d" % (case, res["total"], res["in_face"], res["in_head"])
            lines.append(head)
            for c in res["comps"][:4]:
                lines.append("   %5d px bbox=%s owners=%s fill=%.2f" % (c["px"], c["bbox"], c["owners"][:5], c["fill"]))
            print(head, flush=True)
            for c in res["comps"][:3]:
                print("   %5d px bbox=%s owners=%s" % (c["px"], c["bbox"], c["owners"][:4]), flush=True)
        br.close()
    (EVI / "truth_report.txt").write_text("\n".join(lines), encoding="utf-8")
    (EVI / "truth_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()