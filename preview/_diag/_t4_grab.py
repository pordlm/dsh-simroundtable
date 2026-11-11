# -*- coding: utf-8 -*-
"""t4: grab the current gemini neutral frame 1:1 and crop the right jaw region."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

from playwright.sync_api import sync_playwright

OUT = ROOT / "preview" / "_evidence" / "t4"
OUT.mkdir(parents=True, exist_ok=True)
rig = C.discover_rigs()["gemini"]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True,
                          args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = b.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
    img = C.grab(page, rig, {}, scale=1.0, mip=False)
    rgba = np.asarray(img)
    print("frame", rgba.shape, "opaque", int((rgba[..., 3] > 0).sum()))
    Image.fromarray(rgba, "RGBA").save(OUT / "gemini_neutral_now.png")
    # composite on stage colour, then crop 6x
    comp = C.composite(rgba).astype(np.uint8)
    box = (1100, 600, 1260, 860)
    crop = Image.fromarray(comp[box[1]:box[3], box[0]:box[2]])
    crop = crop.resize((crop.width * 6, crop.height * 6), Image.NEAREST)
    crop.save(OUT / "gemini_right_jaw_6x.png")
    # also alpha-included raw crop 6x
    raw = Image.fromarray(rgba[box[1]:box[3], box[0]:box[2]], "RGBA")
    bg = Image.new("RGBA", raw.size, (255, 0, 255, 255))
    bg.alpha_composite(raw)
    bg = bg.convert("RGB").resize((raw.width * 6, raw.height * 6), Image.NEAREST)
    bg.save(OUT / "gemini_right_jaw_magenta_6x.png")
    b.close()
print("saved", OUT)