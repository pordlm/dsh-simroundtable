# -*- coding: utf-8 -*-
"""t4: how visible is the new fill?  Compare the new plate against the parts
that are drawn BELOW head_base (back hair, tail) -- that is what the fill hides."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

OUT = ROOT / "preview" / "_evidence" / "t4"
rig = C.discover_rigs()["gemini"]
man = json.loads(rig.layout.read_text(encoding="utf-8"))
base = rig.layout.parent
order = [l["name"] for l in man["layers"]]
print("order", order)
below_names = order[:order.index("head base")]
print("below head base:", below_names)

def canvas_of(l):
    p = base / l["image"]["path"]
    if not p.exists():
        p = rig.build / l["image"]["path"]
    a = np.asarray(Image.open(p).convert("RGBA"))
    out = np.zeros((2048, 2048, 4), np.uint8)
    r = l["rect"]
    out[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a
    return out

below = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
for l in man["layers"]:
    if l["name"] in below_names:
        im = Image.fromarray(canvas_of(l), "RGBA")
        below.alpha_composite(im)
B = np.asarray(below)
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
fill = np.load(ROOT / ".tmp" / "t4_fill.npy")
Lb = C.to_lstar(B[..., :3]); Ln = C.to_lstar(plate[..., :3])
m = fill & (B[..., 3] > 250)
print("fill px over opaque back hair:", int(m.sum()), "of", int(fill.sum()))
d = Ln - Lb
print("visible dL: mean %+.1f med %+.1f p10 %+.1f p90 %+.1f  |d|>3: %.0f%%  |d|>8: %.0f%%" % (
    d[m].mean(), np.median(d[m]), np.percentile(d[m], 10), np.percentile(d[m], 90),
    100 * (np.abs(d[m]) > 3).mean(), 100 * (np.abs(d[m]) > 8).mean()))
# visible dL in the right component only, and by distance from its right edge
lab, n = ndi.label(fill)
sz = ndi.sum(fill, lab, range(1, n + 1))
rid = int(np.argmax(sz)) + 1
m2 = (lab == rid)
ys, xs = np.where(m2)
bx1 = xs.max()
dist = bx1 - np.indices(fill.shape)[1]
for lo, hi in [(0, 3), (3, 8), (8, 24), (24, 999)]:
    mm = m2 & (dist >= lo) & (dist < hi) & (B[..., 3] > 250)
    if mm.any():
        print("right comp dist %d-%d: n=%d mean dL=%+.1f med=%+.1f" %
              (lo, hi, int(mm.sum()), d[mm].mean(), np.median(d[mm])))
# and what colour the back hair has vs the fill
for y, x in [(740, 1180), (740, 1196), (780, 1196), (820, 1150), (700, 1160), (700, 1196)]:
    print("px", y, x, "belowA", int(B[y, x, 3]), "below", tuple(int(v) for v in B[y, x, :3]),
          "plate", tuple(int(v) for v in plate[y, x, :3]), "Lb %.1f Ln %.1f" % (Lb[y, x], Ln[y, x]))
# save a visual: below composite, new plate, and signed dL heat map at 6x
box = (1100, 600, 1260, 860)
x0, y0, x1, y1 = box
Image.fromarray(C.composite(B).astype(np.uint8)[y0:y1, x0:x1]).resize(
    ((x1 - x0) * 6, (y1 - y0) * 6), Image.NEAREST).save(OUT / "gemini_below_6x.png")
hm = np.zeros((y1 - y0, x1 - x0, 3), np.uint8)
dd = np.clip(d[y0:y1, x0:x1], -30, 30)
hm[..., 0] = np.clip(dd, 0, None) / 30 * 255
hm[..., 1] = np.clip(-dd, 0, None) / 30 * 255
Image.fromarray(hm).resize(((x1 - x0) * 6, (y1 - y0) * 6), Image.NEAREST).save(OUT / "gemini_visible_dl_6x.png")
print("saved below + dL heat")