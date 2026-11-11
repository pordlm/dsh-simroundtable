# -*- coding: utf-8 -*-
"""t11: reference plate crop (canvas coords) next to the old render, 9x."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C, metrics as M

rig = C.discover_rigs()["gemini"]
ref, kind = M.reference_plate(rig)
old = np.asarray(Image.open(ROOT / "preview/_evidence/t4/gemini_neutral_before.png").convert("RGBA"))
box = (815, 700, 900, 790)
imgs = []
for tag, arr in (("ref plate", ref), ("old render", old)):
    comp = C.composite(arr).astype(np.uint8)
    crop = Image.fromarray(comp[box[1]:box[3], box[0]:box[2]])
    crop = crop.resize((crop.width * 9, crop.height * 9), Image.LANCZOS)
    canvas = Image.new("RGB", (crop.width, crop.height + 28), (245, 245, 245))
    canvas.paste(crop, (0, 28))
    ImageDraw.Draw(canvas).text((6, 8), f"{tag} {box}", fill=(0, 0, 0))
    imgs.append(canvas)
w = sum(i.width for i in imgs) + 10
sheet = Image.new("RGB", (w, imgs[0].height), (255, 255, 255))
x = 0
for i in imgs:
    sheet.paste(i, (x, 0))
    x += i.width + 10
p = ROOT / "preview/_evidence/t11/ref_vs_old_left.png"
sheet.save(p)
print("saved", p, sheet.size)