# -*- coding: utf-8 -*-
"""t3: per-part coverage isolation.

Render the stage pose seven times, each time hiding every part except one, so
each frame's alpha is that single part's own coverage in the deformed space.
Then, for every "master opaque / composite transparent" pixel, ask which part
(if any) still covers it in isolation:

  covered by exactly one part X, composite empty   -> X's alpha/beating is fine but
                                                      something above it erased it (mask/blend)
  covered by no part at all                        -> the pieces really parted; a
                                                      hole that geometry cannot explain
  covered only by the part whose rect edge is there -> the seam sits on that piece

Usage: python preview/_diag/_t3_parts.py
"""
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
EVI = ROOT / "preview" / "_evidence" / "t3"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
PARTS = ["PartHead", "PartHairBack", "PartFace", "PartHairFront",
         "PartHeadAccessories", "PartExtra", "PartBody"]
POSE = dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0)
POSES = [("stage_pose", POSE), ("neutral", {})]


def shot(pg, params, hide):
    q = ["scale=1", "model=" + MODEL.replace("/", "%2F")]
    if params:
        q.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items()).replace(":", "%3A").replace(",", "%2C"))
    if hide:
        q.append("part=" + ",".join("%s:0" % p for p in hide).replace("%3A", "%3A"))
    pg.goto("http://127.0.0.1:8848/preview/probe.html?" + "&".join(q), wait_until="load")
    pg.wait_for_function("() => document.title === 'READY'", timeout=180000)
    b64 = pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return np.array(Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA"))


def main():
    rep = {}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 300, "height": 300}, device_scale_factor=1)
        pg.set_default_timeout(180000)
        for name, pose in POSES:
            comp = shot(pg, pose, [])
            A = comp[:, :, 3] / 255.0
            per = {}
            for part in PARTS:
                # PartBody is the root of the part chain (hiding it also kills the
                # head and the face), so isolation keeps it and hides the other
                # five group parts only.
                hide = [x for x in PARTS if x not in (part, "PartBody")]
                rgba = shot(pg, pose, hide)
                a = rgba[:, :, 3] / 255.0
                per[part] = a
                print("  %-10s isolated alpha>0.5 px=%d" % (part, int((a > 0.5).sum())), flush=True)
            stack = np.stack([per[k] for k in PARTS])
            best = stack.max(axis=0)
            owner = stack.argmax(axis=0)
            covered = best > 0.5
            empty = A < 0.5
            # pixels the composite leaves empty where at least one part is opaque
            guilt = empty & covered
            none = empty & ~covered
            print("== %s: composite empty px=%d | covered-by-some-part=%d | covered-by-none=%d"
                  % (name, int(empty.sum()), int(guilt.sum()), int(none.sum())), flush=True)
            rep[name] = dict(per_part_px={k: int((v > 0.5).sum()) for k, v in per.items()},
                             composite_empty=int(empty.sum()),
                             empty_but_one_part_opaque=int(guilt.sum()),
                             empty_and_no_part=int(none.sum()),
                             per_part_owner_hist={PARTS[i]: int(((owner == i) & guilt).sum()) for i in range(len(PARTS))})
            Image.fromarray((owner * 30).astype(np.uint8)).save(EVI / ("parts_owner_%s.png" % name))
    (EVI / "parts_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()