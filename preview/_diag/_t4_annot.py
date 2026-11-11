# -*- coding: utf-8 -*-
"""t4: annotate the right-jaw crop with the fill mask + edge sample strips."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

OUT = ROOT / "preview" / "_evidence" / "t4"
fill = np.load(ROOT / ".tmp" / "t4_fill.npy")
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
rgba = np.asarray(Image.open(OUT / "gemini_neutral_now.png"))
comp = C.composite(rgba).astype(np.uint8)
# composite plate too
pcomp = C.composite(plate).astype(np.uint8)

box = (1100, 600, 1260, 860)
x0, y0, x1, y1 = box

def crop6(img, mark=None, name=""):
    im = Image.fromarray(img).crop(box).resize(((x1 - x0) * 6, (y1 - y0) * 6), Image.NEAREST)
    im.save(OUT / name)

# 1) render with fill tinted green, fill boundary drawn red
r = comp.copy()
m = fill.copy()
r[m] = (0.55 * r[m] + 0.45 * np.array([0, 255, 0])).astype(np.uint8)
# red line on the fill's right bbox edge (x=1201)
r[600:860, 1201] = [255, 0, 0]
# yellow outside sample strip x 1205..1210 and cyan inside 1196..1200
r[600:860, 1205:1211] = [255, 255, 0]
r[600:860, 1196:1201] = [0, 255, 255]
crop6(r, name="gemini_fill_tint_6x.png")

# 2) plate canvas composite alone (what the plate paints)
p = pcomp.copy()
p[fill] = (0.55 * p[fill] + 0.45 * np.array([0, 255, 0])).astype(np.uint8)
p[600:860, 1201] = [255, 0, 0]
crop6(p, name="gemini_plate_fill_6x.png")

# 3) ref plate alone
crop6(C.composite(ref).astype(np.uint8), name="gemini_refplate_6x.png")
print("saved annotated crops")

# numeric: exact 6-col means at the right bbox edge for the 184 rows, L*
L = C.to_lstar(plate[..., :3]); Lr = C.to_lstar(ref[..., :3])
lab, n = __import__("scipy.ndimage", fromlist=["ndimage"]).label(fill)
m = lab == 609
ys, xs = np.where(m)
bx1 = xs.max()
rows = np.unique(ys[xs >= bx1 - 2])
ins, outs, rr = [], [], []
for y in rows:
    a = [L[y, x] for x in range(bx1 - 6, bx1) if plate[y, x, 3] >= 250]
    b = [Lr[y, x] for x in range(bx1 + 4, bx1 + 10) if ref[y, x, 3] >= 250]
    if len(a) >= 5 and len(b) >= 5:
        ins.append(np.mean(a)); outs.append(np.mean(b)); rr.append(y)
ins, outs = np.array(ins), np.array(outs)
print("rows used", len(rr), "dl", round(float(ins.mean() - outs.mean()), 2))
print("inside mean L", round(float(ins.mean()), 1), "outside", round(float(outs.mean()), 1))
d = ins - outs
print("per-row dl: min %.1f p10 %.1f med %.1f p90 %.1f max %.1f" %
      (d.min(), np.percentile(d, 10), np.median(d), np.percentile(d, 90), d.max()))
print("frac rows |dl|<3:", round(float((np.abs(d) < 3).mean()), 3))
bad = np.argsort(-np.abs(d))[:10]
for i in bad:
    print("  worst row y=%d dl=%+.1f inside=%.1f outside=%.1f" % (rr[i], d[i], ins[i], outs[i]))
np.save(ROOT / ".tmp" / "t4_right_rows.npy", np.array(rr))
np.save(ROOT / ".tmp" / "t4_right_ins.npy", ins)
np.save(ROOT / ".tmp" / "t4_right_outs.npy", outs)