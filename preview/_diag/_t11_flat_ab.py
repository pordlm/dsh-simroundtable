# -*- coding: utf-8 -*-
"""t11: layout-flat composite of two builds, crops for visual checks."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

def composite(build: Path) -> np.ndarray:
    man = json.loads(next(build.glob("*.layout.json")).read_text(encoding="utf-8"))
    out = np.zeros((2048, 2048, 4), np.float64)
    for l in man["layers"]:
        im = np.asarray(Image.open(build / l["image"]["path"]).convert("RGBA")).astype(np.float64) / 255.0
        r = l["rect"]
        h, w = im.shape[:2]
        sl = out[r["top"]:r["top"] + h, r["left"]:r["left"] + w]
        a = im[..., 3:4]
        sl[..., :3] = im[..., :3] * a + sl[..., :3] * (1 - a)
        sl[..., 3:4] = a + sl[..., 3:4] * (1 - a)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)

new = composite(Path(sys.argv[1]))
old = composite(Path(sys.argv[2]))
OUT = ROOT / "preview" / "_evidence" / "t11"
boxes = {"left band": (815, 715, 895, 785), "right pale": (1150, 630, 1225, 705), "right low": (1180, 760, 1250, 840)}
rows = []
for name, box in boxes.items():
    pair = []
    for tag, arr in (("old", old), ("new", new)):
        comp = C.composite(arr).astype(np.uint8)
        crop = Image.fromarray(comp[box[1]:box[3], box[0]:box[2]])
        crop = crop.resize((crop.width * 9, crop.height * 9), Image.LANCZOS)
        canvas = Image.new("RGB", (crop.width, crop.height + 30), (245, 245, 245))
        canvas.paste(crop, (0, 30))
        ImageDraw.Draw(canvas).text((8, 9), f"{name} {tag} {box}", fill=(0, 0, 0))
        pair.append(canvas)
    w = sum(p.width for p in pair) + 10
    strip = Image.new("RGB", (w, pair[0].height), (255, 255, 255))
    x = 0
    for p in pair:
        strip.paste(p, (x, 0))
        x += p.width + 10
    rows.append(strip)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), (255, 255, 255))
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height
p = OUT / "flat_AB_1.png"
sheet.save(p)
print("saved", p, sheet.size)