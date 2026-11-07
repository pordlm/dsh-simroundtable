# -*- coding: utf-8 -*-
"""t3: what the user actually sees - stage-scale audit of the Gemini face.

Renders preview/stage-760.html at the real seat scale (charH 182 -> ~0.096 of
the 2048 rig), extracts the stage with alpha, crops the Gemini head at the
model's own bounds, and cross-checks it against the master matte downscaled by
the same factor (so "art has it too" can be told apart from "rig created it").

Writes preview/_evidence/t3/stage_*.png and stage_report.txt
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
EVI.mkdir(parents=True, exist_ok=True)
MATTE = ROOT / "assets" / "build" / "gemini-parts" / "matte.png"

URL = ("http://127.0.0.1:8848/preview/stage-760.html?n=2&names=Gemini,Claude"
       "&active=0&tpin=6000&nogest=1&seed=7")

JS = r"""
() => {
  const out = [];
  for (const m of window.__models || []) {
    if (!m) continue;
    const b = m.getBounds();
    out.push({ char: m.__char && m.__char.name, b: [b.x, b.y, b.width, b.height],
               pos: [m.position.x, m.position.y], scale: m.scale.x });
  }
  return out;
}
"""


def main():
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 760, "height": 520}, device_scale_factor=1)
        pg.goto(URL, wait_until="load")
        pg.wait_for_function("() => window.__loaded === true", timeout=120000)
        pg.wait_for_timeout(1500)
        models = pg.evaluate("""() => {
            const out = [];
            const stage = (window.__app || null);
            return out;
        }""")
        info = pg.evaluate("""() => {
            const res = [];
            const ids = Object.keys(window).filter(k => k.startsWith('__model'));
            return { keys: ids.slice(0, 10) };
        }""")
        print("probe keys:", info)
        b64 = pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
        rgba = np.array(Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA"))
        print("stage image", rgba.shape)
        Image.fromarray(rgba).save(EVI / "stage_raw.png")
        A = rgba[:, :, 3:4].astype(np.float32) / 255.0
        comp = (rgba[:, :, :3].astype(np.float32) * A + np.array([24, 22, 30], np.float32) * (1 - A)).astype(np.uint8)
        Image.fromarray(comp).save(EVI / "stage_on_dark.png")
        # alpha bbox of the figure(s)
        m = rgba[:, :, 3] > 8
        ys, xs = np.where(m)
        print("alpha bbox", xs.min(), ys.min(), xs.max(), ys.max())
        # crop the left half (Gemini seat) generously
        x0, y0, x1, y1 = 0, 0, rgba.shape[1] // 2, rgba.shape[0]
        sub = comp[y0:y1, x0:x1]
        Image.fromarray(sub).resize(((x1 - x0) * 4, (y1 - y0) * 4), Image.LANCZOS).save(EVI / "stage_left4x.png")
        br.close()


if __name__ == "__main__":
    main()