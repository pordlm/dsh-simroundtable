# -*- coding: utf-8 -*-
"""t11: calibrate a hair/skin classifier on the matte, along the jaw strip."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(r"D:\dsh_simroundtable")
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

rig = C.discover_rigs()["gemini"]
mat = C.matte_ref(rig)[:, :, :3]
print("matte canvas", mat.shape, "max", mat.max())
hsv = np.asarray(Image.fromarray(mat.astype(np.uint8)).convert("HSV")).astype(np.int32)
H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]

for y in range(660, 821, 20):
    row = []
    for x in range(1140, 1241, 10):
        row.append(f"{x}:H{H[y,x]}/S{S[y,x]}/V{V[y,x]}")
    print("y", y, " ".join(row))
print()
print("hue histogram over jaw box (x1140-1240,y640-830), S>40,V>60")
box = (slice(640, 830), slice(1140, 1240))
sel = (S[box] > 40) & (V[box] > 60)
h = H[box][sel]
print(np.bincount(h // 10, minlength=36))