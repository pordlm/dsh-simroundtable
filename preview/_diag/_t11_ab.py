# -*- coding: utf-8 -*-
"""t11: before/after jaw comparison at 6x, both jaw segments + bleed numbers."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C, metrics as M

OUT = ROOT / "preview" / "_evidence" / "t11"
OUT.mkdir(parents=True, exist_ok=True)
rig = C.discover_rigs()["gemini"]
old = np.asarray(Image.open(ROOT / "preview/_evidence/t4/gemini_neutral_before.png").convert("RGBA"))
new = np.load(ROOT / ".tmp" / "t11_new_frame.npy")

bo = M.bleed_mask(rig, old)
bn = M.bleed_mask(rig, new)
print("old bleed", bo["px"], bo["largest"], bo["bbox"], bo["pass"])
print("new bleed", bn["px"], bn["largest"], bn["bbox"], bn["pass"])

def comp(a):
    return C.composite(a).astype(np.uint8)

boxes = {"right jaw": (1120, 600, 1260, 860), "left jaw": (820, 600, 960, 860)}
rows = []
for name, box in boxes.items():
    pair = []
    for tag, arr in (("old", old), ("new", new)):
        crop = Image.fromarray(comp(arr)[box[1]:box[3], box[0]:box[2]])
        crop = crop.resize((crop.width * 6, crop.height * 6), Image.LANCZOS)
        canvas = Image.new("RGB", (crop.width, crop.height + 34), (245, 245, 245))
        canvas.paste(crop, (0, 34))
        d = ImageDraw.Draw(canvas)
        d.text((8, 10), f"{name}  {tag}", fill=(0, 0, 0))
        pair.append(canvas)
    sep = 12
    w = sum(p.width for p in pair) + sep
    h = max(p.height for p in pair)
    strip = Image.new("RGB", (w, h), (255, 255, 255))
    x = 0
    for p in pair:
        strip.paste(p, (x, 0))
        x += p.width + sep
    rows.append(strip)

W = max(r.width for r in rows)
H = sum(r.height for r in rows) + 8
sheet = Image.new("RGB", (W, H), (255, 255, 255))
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height + 8
p = OUT / "jaw_AB_1.png"
sheet.save(p)
print("saved", p, sheet.size)
print(f"BLEED old={bo['px']}/{bo['largest']} new={bn['px']}/{bn['largest']}")