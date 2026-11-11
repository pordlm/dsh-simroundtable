# -*- coding: utf-8 -*-
"""t4: dump the right-jaw fill boundary (x ~1180..1220, y 644..827).  Read-only."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C
from _audit import metrics as M

fill = np.load(ROOT / ".tmp" / "t4_fill.npy")
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
rig = C.discover_rigs()["gemini"]
L = C.to_lstar(plate[..., :3])
Lr = C.to_lstar(ref[..., :3])
# front hair alpha on canvas
man = json.loads(rig.layout.read_text(encoding="utf-8"))
base = rig.layout.parent

def layer_canvas(name):
    for l in man["layers"]:
        if l["name"] == name:
            p = base / l["image"]["path"]
            if not p.exists():
                p = rig.build / l["image"]["path"]
            a = np.asarray(Image.open(p).convert("RGBA"))
            out = np.zeros((2048, 2048, 4), np.uint8)
            r = l["rect"]
            out[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a
            return out
    return None

fh = layer_canvas("front hair")
face = layer_canvas("face")
print("fh px", (fh[..., 3] > 0).sum(), "face px", (face[..., 3] > 0).sum())
# master ref mapped the same way
mp = C.matte_mapping(rig.matte)
master = Image.open(rig.matte).convert("RGBA")
k = mp["scale"]
master = master.resize((int(round(master.width * k)), int(round(master.height * k))), Image.LANCZOS)
mm = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
mm.paste(master, (int(round(mp["dx"])), int(round(mp["dy"]))), master)
mr = np.asarray(mm)
Lm = C.to_lstar(mr[..., :3])

ys = np.where(fill[:, 1180:1210].any(axis=1))[0]
print("fill rows in x1180..1210:", ys.min(), ys.max(), len(ys))
for y in [650, 680, 710, 740, 770, 800, 820]:
    print(f"--- y={y} (L plate | ref | master ; fhA faceA fill refA)")
    for x in range(1180, 1224, 4):
        print(f"  x={x}: L={L[y,x]:6.1f} Lref={Lr[y,x]:6.1f} Lm={Lm[y,x]:6.1f} "
              f"fh={fh[y,x,3]:3d} face={face[y,x,3]:3d} fill={int(fill[y,x])} "
              f"refA={ref[y,x,3]:3d} newA={plate[y,x,3]:3d}")
# Column profile: per-column mean L of fill rows at y 700..800
print("--- column means over fill rows y 700..800 ---")
sel = np.zeros(2048, bool); sel[700:801] = True
for x in range(1150, 1230, 2):
    m = sel & fill[:, x]
    if not m.any():
        continue
    print(f"x={x}: n={m.sum():3d} Lnew={L[m,x].mean():6.1f} Lref={Lr[m,x].mean():6.1f} "
          f"meanfh={fh[m,x,3].mean():5.1f} meanface={face[m,x,3].mean():5.1f}")

# what part of the fill is covered by semitransparent hair vs opaque face?
sub = fill[600:860, 1000:1240]
fhs = fh[600:860, 1000:1240, 3]
fs = face[600:860, 1000:1240, 3]
print("fill sub px", sub.sum())
for lo, hi, nm in [(0, 1, "fh=0"), (1, 20, "fh1-19"), (20, 128, "fh20-127"),
                   (128, 256, "fh>=128")]:
    m = sub & (fhs >= lo) & (fhs < hi)
    print(f"  {nm}: {int(m.sum())} px, meanface={fs[m].mean() if m.any() else 0:.0f}")