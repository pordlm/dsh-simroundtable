# -*- coding: utf-8 -*-
"""t4: 12x zoom exactly on x1185..1225 (fill boundary) for new plate, ref plate, render."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

OUT = ROOT / "preview" / "_evidence" / "t4"
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
rgba = np.asarray(Image.open(OUT / "gemini_neutral_now.png"))
box = (1180, 620, 1230, 845)

def save(arr, name, marks=()):
    a = np.array(arr, copy=True)
    for x, col in marks:
        a[:, x - box[0]] = col
    im = Image.fromarray(a).crop(box)
    im = im.resize((im.width * 12, im.height * 12), Image.NEAREST)
    im.save(OUT / name)

save(C.composite(plate).astype(np.uint8), "zoom12_newplate.png",
     [(1201, [255, 0, 0])])
save(C.composite(ref).astype(np.uint8), "zoom12_refplate.png",
     [(1201, [255, 0, 0])])
save(C.composite(rgba).astype(np.uint8), "zoom12_render.png",
     [(1201, [255, 0, 0])])
# side by side (render | plate | ref) with 1 px gap
comp = C.composite(rgba).astype(np.uint8)
comb = np.concatenate([comp, np.full((2048, 3, 3), 255, np.uint8),
                       C.composite(plate).astype(np.uint8), np.full((2048, 3, 3), 255, np.uint8),
                       C.composite(ref).astype(np.uint8)], axis=1)
im = Image.fromarray(comb).crop((box[0], box[1], 3 * 2048 + 6, box[3]))
im = Image.fromarray(comb[:, :, :]).crop((box[0], box[1], box[2] + 3 * 2048 + 6 - 2048, box[3]))
# simpler: three separate crops
tiles = []
for arr in (comp, C.composite(plate).astype(np.uint8), C.composite(ref).astype(np.uint8)):
    t = Image.fromarray(arr).crop(box).resize(((box[2] - box[0]) * 6, (box[3] - box[1]) * 6), Image.NEAREST)
    tiles.append(t)
w = sum(t.width for t in tiles) + 20
h = tiles[0].height
canvas = Image.new("RGB", (w, h), (255, 255, 255))
x = 0
for t in tiles:
    canvas.paste(t, (x, 0))
    x += t.width + 10
canvas.save(OUT / "triptych_render_plate_ref_6x.png")
print("saved")