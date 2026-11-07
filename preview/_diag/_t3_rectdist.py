# -*- coding: utf-8 -*-
"""t3: is the face defect tied to the `face` piece rectangle boundary?

For every "master says opaque / render says transparent" pixel inside the head
region we histogram the distance to the nearest `face` piece edge (left/right/
top/bottom of its layout rect) and to the nearest eye/head-base edge.  If the
defects cluster at distance 0-4 px from one specific rect, that rectangle is
the seam; if they scatter along the drawn jaw line, the seam follows the art,
not the rect.
"""
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
EVI = ROOT / "preview" / "_evidence" / "t3"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LAY = json.loads((ROOT / "assets/build/gemini-v1/gemini.layout.json").read_text(encoding="utf-8"))
RECTS = {l["name"]: l["rect"] for l in LAY["layers"]}
MATTE = np.array(Image.open(ROOT / "assets/build/gemini-parts/matte.png").convert("RGBA")).astype(np.float32)
SCALE, OFF = 1.2599, (380.4, 68.5)


def ref_alpha():
    h, w = MATTE.shape[:2]
    ys = (np.arange(2048, dtype=np.float32) - OFF[1]) / SCALE
    xs = (np.arange(2048, dtype=np.float32) - OFF[0]) / SCALE
    yi = np.clip(np.round(ys).astype(np.int32), 0, h - 1)
    xi = np.clip(np.round(xs).astype(np.int32), 0, w - 1)
    sub = MATTE[np.ix_(yi, xi)][:, :, 3] / 255.0
    sub[(ys < -0.5)] = 0
    sub[:, (xs < -0.5)] = 0
    return sub


REF = ref_alpha()


def dist_to_rect_edge(mask, r):
    """distance (px) from each True pixel to the nearest of the 4 rect edges"""
    ys, xs = np.where(mask)
    l, t = r["left"], r["top"]
    rr, bb = l + r["width"], t + r["height"]
    d = np.minimum.reduce([np.abs(xs - l), np.abs(xs - rr), np.abs(ys - t), np.abs(ys - bb)])
    return xs, ys, d


def main():
    out = {}
    cases = [("neutral", {}),
             ("stage_pose", dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0)),
             ("anglex_m10", dict(AngleX=-10, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5)),
             ("angley_p4", dict(AngleX=0, AngleY=+4, BodyAngleX=0, HairFront=0, Breath=0.5)),
             ("anglexy_p6p4", dict(AngleX=+6, AngleY=+4, BodyAngleX=0, HairFront=0, Breath=0.5)),
             ("anglexy_m6m4", dict(AngleX=-6, AngleY=-4, BodyAngleX=0, HairFront=0, Breath=0.5))]
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 300, "height": 300}, device_scale_factor=1)
        pg.set_default_timeout(180000)
        for case, params in cases:
            q = "scale=1&model=" + MODEL.replace("/", "%2F")
            if params:
                q += "&p=" + ",".join("%s:%s" % (k, v) for k, v in params.items()).replace(":", "%3A").replace(",", "%2C")
            pg.goto("http://127.0.0.1:8848/preview/probe.html?" + q, wait_until="load")
            pg.wait_for_function("() => document.title === 'READY'", timeout=180000)
            b64 = pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
            rgba = np.array(Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA"))
            A = rgba[:, :, 3] / 255.0
            defect = (REF > 0.85) & (A < 0.60)
            face = RECTS["face"]
            fx0, fy0 = face["left"] - 30, face["top"] - 30
            fx1, fy1 = fx0 + face["width"] + 60, fy0 + face["height"] + 60
            sub = np.zeros_like(defect)
            sub[fy0:fy1, fx0:fx1] = defect[fy0:fy1, fx0:fx1]
            xs, ys, d = dist_to_rect_edge(sub, face)
            hist = {int(k): int(v) for k, v in zip(*np.unique(np.minimum(d, 40).astype(int), return_counts=True))}
            # same histogram for the whole head region, as a control
            hb = RECTS["head base"]
            hsub = np.zeros_like(defect)
            hsub[hb["top"]:hb["top"] + hb["height"], hb["left"]:hb["left"] + hb["width"]] = defect[hb["top"]:hb["top"] + hb["height"], hb["left"]:hb["left"] + hb["width"]]
            hx, hy, hd = dist_to_rect_edge(hsub, hb)
            out[case] = dict(face_px=int(sub.sum()), face_dmin=int(d.min()) if len(d) else -1,
                             face_d_hist=hist,
                             face_med=float(np.median(d)) if len(d) else -1,
                             head_px=int(hsub.sum()), head_med=float(np.median(hd)) if len(hd) else -1,
                             head_d_hist={int(k): int(v) for k, v in zip(*np.unique(np.minimum(hd, 40).astype(int), return_counts=True))})
            print("%-14s face_defect=%5d  median_dist_to_face_rect=%5.1f  (0-2px: %d, 3-6: %d, >10: %d)"
                  % (case, out[case]["face_px"], out[case]["face_med"],
                     sum(v for k, v in hist.items() if k <= 2),
                     sum(v for k, v in hist.items() if 3 <= k <= 6),
                     sum(v for k, v in hist.items() if k > 10)), flush=True)
            print("                 head_defect=%6d median_dist_to_head_rect=%5.1f"
                  % (out[case]["head_px"], out[case]["head_med"]), flush=True)
        br.close()
    (EVI / "face_rect_distance.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()