# -*- coding: utf-8 -*-
"""t4: per-layer coverage + colours along the right-jaw rows."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

rig = C.discover_rigs()["gemini"]
man = json.loads(rig.layout.read_text(encoding="utf-8"))
base = rig.layout.parent
names = ["face", "front hair", "back hair", "neck", "topwear", "head base"]
layers = {}
for l in man["layers"]:
    nm = l["name"]
    if nm not in names:
        continue
    p = base / l["image"]["path"]
    if not p.exists():
        p = rig.build / l["image"]["path"]
    a = np.asarray(Image.open(p).convert("RGBA"))
    out = np.zeros((2048, 2048, 4), np.uint8)
    r = l["rect"]
    out[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a
    layers[nm] = out
print("layers", list(layers))
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
L = C.to_lstar(plate[..., :3]); Lr = C.to_lstar(ref[..., :3])
for y in [700, 740, 780, 800, 820]:
    print(f"===== y={y}")
    for x in range(1140, 1226, 4):
        row = f"x={x} Lnew={L[y,x]:5.1f} Lref={Lr[y,x]:5.1f} rgbnew={tuple(plate[y,x,:3])} rgbold={tuple(ref[y,x,:3])}"
        for nm, arr in layers.items():
            row += f" {nm[:4]}={arr[y,x,3]:3d}"
        print(row)
# Coverage census: for x=1205..1210 rows 644..827 which layer owns pixels
print("=== coverage of outside strip x1205..1210, y644..827 ===")
cnt = {}
for nm, arr in layers.items():
    cnt[nm] = int((arr[644:828, 1205:1211, 3] > 128).sum())
print(cnt, "total px", 184 * 6)
# and inside 1196..1200
print("=== inside strip x1196..1200 ===")
cnt = {}
for nm, arr in layers.items():
    cnt[nm] = int((arr[644:828, 1196:1201, 3] > 128).sum())
print(cnt)