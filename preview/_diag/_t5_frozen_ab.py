# -*- coding: utf-8 -*-
"""t5: frozen-clock A/B so the only difference is the rig.

?tpin=6000 pins the frame clock, so two separate loads of the same build should
render (nearly) the same pixels.  We therefore shoot:

  new_a  shipped build
  new_b  shipped build again          -> new_a vs new_b = animation/filter noise floor
  old    .bak build via request route -> old vs new_a   = effect of the t4 plate

and report the diff of the Gemini face region for both pairs.

Writes preview/_evidence/t5/frozen_{new_a,new_b,old}_two_2x.png,
frozen_diff.json|txt, frozen_pair_10x.png
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
OLD = ROOT / "assets" / "build" / "gemini-v1.bak"
URL = ("http://127.0.0.1:8848/preview/stage-760.html"
       "?n=2&names=Grok,Gemini&seed=20261103&nogest=1&active=-1&tpin=6000")


def L(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    return np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)


def capture(br, path: Path, route_old: bool):
    ctx = br.new_context(viewport={"width": 820, "height": 700}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.set_default_timeout(180000)
    if route_old:
        def reroute(route):
            rel = route.request.url.split("?")[0].split("/assets/build/gemini-v1/")[-1]
            f = OLD / rel
            if not f.is_file():
                return route.continue_()
            ctype = "image/png" if f.suffix == ".png" else (
                "application/json" if f.suffix == ".json" else "application/octet-stream")
            route.fulfill(status=200, body=f.read_bytes(), content_type=ctype)
        pg.route("**/assets/build/gemini-v1/*", reroute)
    pg.goto(URL, wait_until="load")
    pg.wait_for_function("() => window.__ready === true && window.__loaded === true"
                         " && (window.__models||[]).filter(Boolean).length === 2", timeout=180000)
    pg.wait_for_function("() => (window.__models||[]).every(m => !m || (m.__fade||0) >= 1)",
                         timeout=60000)
    pg.wait_for_timeout(1200)
    pg.query_selector("#inner").screenshot(path=str(path))
    ctx.close()


def main() -> int:
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        capture(br, OUT / "frozen_new_a_two_2x.png", False)
        capture(br, OUT / "frozen_new_b_two_2x.png", False)
        capture(br, OUT / "frozen_old_two_2x.png", True)
        br.close()

    a = np.asarray(Image.open(OUT / "frozen_new_a_two_2x.png").convert("RGB"))
    b = np.asarray(Image.open(OUT / "frozen_new_b_two_2x.png").convert("RGB"))
    o = np.asarray(Image.open(OUT / "frozen_old_two_2x.png").convert("RGB"))
    # Gemini face region at 2x (seat x=559, scale .15605)
    x0, x1, y0, y1 = 1000, 1240, 280, 560
    da = np.abs(L(a) - L(b))[y0:y1, x0:x1]
    do = np.abs(L(a) - L(o))[y0:y1, x0:x1]
    res = {
        "noise_new_vs_new": {"mean": round(float(da.mean()), 2), "p99": round(float(np.percentile(da, 99)), 2),
                             "px_gt4": int((da > 4).sum())},
        "old_vs_new": {"mean": round(float(do.mean()), 2), "p99": round(float(np.percentile(do, 99)), 2),
                       "px_gt4": int((do > 4).sum())},
    }
    print(json.dumps(res, indent=1))
    (OUT / "frozen_diff.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    lines = [
        "t5 / frozen-clock (?tpin=6000) stage diff, Gemini face window (2x, 240x280 px)",
        f"  new vs new  : mean |dL| {res['noise_new_vs_new']['mean']}, p99 {res['noise_new_vs_new']['p99']}, "
        f"px>4 {res['noise_new_vs_new']['px_gt4']}",
        f"  old vs new  : mean |dL| {res['old_vs_new']['mean']}, p99 {res['old_vs_new']['p99']}, "
        f"px>4 {res['old_vs_new']['px_gt4']}",
    ]
    (OUT / "frozen_diff.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))

    crop = (1000, 300, 1260, 540)
    z = 8
    w, h = (crop[2] - crop[0]) * z, (crop[3] - crop[1]) * z
    sheet = Image.new("RGB", (w * 2 + 16, h), (6, 8, 12))
    for i, src in enumerate((o, a)):
        im = Image.fromarray(src).crop(crop).resize((w, h), Image.NEAREST)
        sheet.paste(im, (i * (w + 16), 0))
    d = ImageDraw.Draw(sheet)
    d.text((6, 4), "OLD (.bak plate)", fill=(255, 210, 120))
    d.text((w + 22, 4), "NEW (shipped plate)", fill=(120, 240, 200))
    sheet.save(OUT / "frozen_pair_10x.png")
    print("wrote frozen_pair_10x.png", sheet.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())