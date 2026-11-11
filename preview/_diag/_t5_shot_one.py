# -*- coding: utf-8 -*-
"""t5: one-off stage shot.  usage: _t5_shot_one.py <out.png> <query> [crop x,y,w,h in CSS px]

Renders preview/stage-760.html<query> at DPR 2, waits for every model, screenshots
#inner, optionally crops, and prints window.__models scale/pos for the record.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8848/preview/stage-760.html"


def main() -> int:
    out = Path(sys.argv[1])
    query = sys.argv[2]
    crop = None
    if len(sys.argv) > 3:
        crop = [int(v) for v in sys.argv[3].split(",")]
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = br.new_context(viewport={"width": 820, "height": 700}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.set_default_timeout(180000)
        pg.goto(BASE + query, wait_until="load")
        pg.wait_for_function("() => window.__ready === true && window.__loaded === true"
                             " && (window.__models||[]).filter(Boolean).length >= 1", timeout=180000)
        pg.wait_for_function("() => (window.__models||[]).every(m => !m || (m.__fade||0) >= 1)",
                             timeout=60000)
        pg.wait_for_timeout(700)
        info = pg.evaluate("() => (window.__models||[]).filter(Boolean).map(m => "
                           "({name: m.__char && m.__char.key, scale: m.scale.x, x: m.x, y: m.y}))")
        if crop:
            clip = {"x": crop[0], "y": crop[1], "width": crop[2], "height": crop[3]}
            pg.screenshot(path=str(out), clip=clip)
        else:
            pg.query_selector("#inner").screenshot(path=str(out))
        ctx.close()
        br.close()
    print(json.dumps({"out": str(out), "models": info}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())