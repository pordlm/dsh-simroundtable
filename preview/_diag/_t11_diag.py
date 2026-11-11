# -*- coding: utf-8 -*-
"""t11: diagnose the top bleed components (old vs new) before fixing the rule."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(r"D:\dsh_simroundtable")
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

rig = C.discover_rigs()["gemini"]
EV = ROOT / "preview" / "_evidence"
mat = C.matte_ref(rig)[:, :, :3].astype(np.uint8)
mhsv = np.asarray(Image.fromarray(mat).convert("HSV")).astype(np.int32)
mH, mS, mV = mhsv[..., 0], mhsv[..., 1], mhsv[..., 2]
skin_m = ((mH <= 25) | (mH >= 235)) & (mS >= 10) & (mV >= 90)
hair_m = (mH >= 135) & (mH <= 232) & (mS >= 35) & (mV >= 50)

man = json.loads(rig.layout.read_text(encoding="utf-8"))
layers = {}
for l in man["layers"]:
    p = rig.layout.parent / l["image"]["path"]
    if not p.exists():
        p = rig.build / l["image"]["path"]
    arr = np.asarray(Image.open(p).convert("RGBA"))[..., 3]
    full = np.zeros((2048, 2048), np.uint8)
    r = l["rect"]
    full[r["top"]:r["top"] + arr.shape[0], r["left"]:r["left"] + arr.shape[1]] = arr
    layers[l["name"]] = full

face_op = layers["face"] > 0
ring = ndimage.binary_dilation(face_op, ndimage.generate_binary_structure(2, 2), iterations=8) & ~face_op


def to_lab(rgb):
    x = rgb.astype(np.float64) / 255.0
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def eval_frame(path, label):
    fr = np.asarray(Image.open(path).convert("RGBA")).astype(np.int32)
    a = fr[..., 3]
    lab = to_lab(fr[..., :3])
    skin_ref = np.median(lab[face_op & (a >= 250) & skin_m], 0)
    hair_ref = np.median(lab[hair_m & (a >= 250) & ~ring], 0)
    dsk = np.linalg.norm(lab - skin_ref, axis=-1)
    dhr = np.linalg.norm(lab - hair_ref, axis=-1)
    cand = ring & hair_m & (a >= 200)
    bleed = cand & (dsk + 6.0 < dhr)
    lb, n = ndimage.label(bleed, ndimage.generate_binary_structure(2, 1))
    sizes = np.bincount(lb.ravel())[1:] if n else np.array([0])
    order = np.argsort(sizes)[::-1][:6]
    print(f"== {label}: bleed {int(bleed.sum())} n={n} skinref {skin_ref.round(0)} hairref {hair_ref.round(0)}")
    for i in order:
        if sizes[i] == 0:
            continue
        m = lb == (i + 1)
        ys, xs = np.where(m)
        rgb = fr[m][:, :3]
        d12 = float((dsk[m] < 12).mean())
        print(f"   comp {i+1}: px={int(sizes[i])} bbox=({xs.min()},{ys.min()})-({xs.max()},{ys.max()}) "
              f"meanRGB={rgb.mean(0).round(0)} dE_skin={dsk[m].mean():.1f} dE_hair={dhr[m].mean():.1f} "
              f"frac(dE<12)={d12:.2f} matteHSV=({np.median(mH[m]):.0f},{np.median(mS[m]):.0f},{np.median(mV[m]):.0f})")
        # which layer covers these pixels
        cov = {k: int((v[m] > 128).sum()) for k, v in layers.items() if (v[m] > 0).any()}
        print("      cover:", sorted(cov.items(), key=lambda kv: -kv[1])[:6])
    return bleed


eval_frame(EV / "t4" / "gemini_neutral_before.png", "old")
eval_frame(EV / "t4" / "gemini_neutral_now.png", "new")