# -*- coding: utf-8 -*-
"""t4: does the PIL composite agree with the rigged model's neutral render?"""
from __future__ import annotations

import base64
import io
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
EVI = ROOT / "preview/_evidence/t4"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"


def main() -> int:
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 300, "height": 300}, device_scale_factor=1)
        pg.set_default_timeout(120000)
        url = ("http://127.0.0.1:8848/preview/probe.html?scale=1&model="
               + MODEL.replace("/", "%2F"))
        pg.goto(url, wait_until="load")
        pg.wait_for_function("() => document.title === 'READY'", timeout=120000)
        b64 = pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
        br.close()
    rgba = np.array(Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA"))
    print("render shape", rgba.shape)
    Image.fromarray(rgba).save(EVI / "render_old_neutral.png")

    for tag in ("old", "new"):
        comp = np.array(Image.open(EVI / f"composite_{tag}_1x.png").convert("RGBA"))
        # composite_*_1x.png is cropped with pad 40 from (839-40, 500-40)
        ox, oy = 839 - 40, 500 - 40
        print(f"-- {tag} composite --")
        for (x, y) in [(900, 760), (1150, 700), (1000, 700), (900, 690), (1100, 780), (860, 700)]:
            c = comp[y - oy, x - ox]
            r = rgba[y, x]
            print(f"   ({x},{y}) composite={tuple(int(v) for v in c)}  render={tuple(int(v) for v in r)}")
    # agreement stats over the face rect
    comp = np.array(Image.open(EVI / "composite_old_1x.png").convert("RGBA"))
    ox, oy = 839 - 40, 500 - 40
    sub = rgba[510:810, 839:1211].astype(int)[:, :, :3]
    csub = comp[510 - oy:810 - oy, 839 - ox:1211 - ox].astype(int)[:, :, :3]
    d = np.abs(sub - csub).mean(axis=2)
    print("face rect |render-composite| mean=%.1f p95=%.1f frac>40=%.3f" % (d.mean(), np.percentile(d, 95), (d > 40).mean()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())