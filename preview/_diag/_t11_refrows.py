# -*- coding: utf-8 -*-
"""t11: what is outside the fill boundary, row by row (ref plate vs matte vs old render)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(r"D:\dsh_simroundtable")
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

rig = C.discover_rigs()["gemini"]
EV = ROOT / "preview" / "_evidence"
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
old = np.asarray(Image.open(EV / "t4" / "gemini_neutral_before.png").convert("RGBA"))
new = np.asarray(Image.open(EV / "t4" / "gemini_neutral_now.png").convert("RGBA"))
mat = C.matte_ref(rig)[:, :, :3].astype(np.uint8)
mhsv = np.asarray(Image.fromarray(mat).convert("HSV")).astype(np.int32)
mH, mS, mV = mhsv[..., 0], mhsv[..., 1], mhsv[..., 2]


def cls(x, y):
    h, s, v = mH[y, x], mS[y, x], mV[y, x]
    if (h <= 25 or h >= 235) and s >= 10 and v >= 90:
        return "SKIN"
    if 135 <= h <= 232 and s >= 35 and v >= 50:
        return "hair"
    return f"?({h},{s},{v})"


print(" y   matte@1198  ref@1206 r/g/b   old@1206    new@1198   new@1206")
for y in range(644, 828, 8):
    print(f"{y:4d} {cls(1198,y):11s} {tuple(ref[y,1206,:3])} {tuple(old[y,1206,:3])} "
          f"{tuple(new[y,1198,:3])} {tuple(new[y,1206,:3])}")
print()
print("matte class census x1170..1210, y644..827")
cnt = {}
for y in range(644, 828):
    for x in range(1170, 1211):
        cnt[cls(x, y)] = cnt.get(cls(x, y), 0) + 1
print(cnt)
print("alpha at (1198,y) new:", [int(new[y, 1198, 3]) for y in range(644, 828, 16)])