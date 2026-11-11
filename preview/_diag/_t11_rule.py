# -*- coding: utf-8 -*-
"""t11: bleed under the task's exact rule (dE<12 to skin OR hue diff < 15 deg)."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(r"D:\dsh_simroundtable")
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

rig = C.discover_rigs()["gemini"]
mat = C.matte_ref(rig)[:, :, :3].astype(np.uint8)
mhsv = np.asarray(Image.fromarray(mat).convert("HSV")).astype(np.int32)
mH, mS, mV = mhsv[..., 0], mhsv[..., 1], mhsv[..., 2]
hair_m = (mH >= 135) & (mH <= 232) & (mS >= 35) & (mV >= 50)
skin_m = ((mH <= 25) | (mH >= 235)) & (mS >= 10) & (mV >= 90)

man = json.loads(rig.layout.read_text(encoding="utf-8"))
face = next(l for l in man["layers"] if l["name"] == "face")
aimg = np.asarray(Image.open(rig.layout.parent / face["image"]["path"]).convert("RGBA"))[..., 3]
fa = np.zeros((2048, 2048), np.uint8)
fr = face["rect"]
fa[fr["top"]:fr["top"] + aimg.shape[0], fr["left"]:fr["left"] + aimg.shape[1]] = aimg
face_op = fa > 0
ring = ndimage.binary_dilation(face_op, ndimage.generate_binary_structure(2, 2), iterations=8) & ~face_op


def to_lab(rgb):
    x = rgb.astype(np.float64) / 255.0
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def eval_img(img, label):
    a = img[..., 3]
    lab = to_lab(img[..., :3])
    hsv = np.asarray(Image.fromarray(img[..., :3].copy()).convert("HSV")).astype(np.int32)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    inner = face_op & (a >= 250) & skin_m
    skin_ref = np.median(lab[inner], 0)
    sh = int(np.median(H[inner])); ss = int(np.median(S[inner]))
    dsk = np.linalg.norm(lab - skin_ref, axis=-1)
    dh = np.minimum(np.abs(H - sh), 255 - np.abs(H - sh))
    skin_like = (dsk < 12) | ((dh < 11) & (S <= max(ss * 2, 60)) & (V >= 110) & (S >= 8))
    cand = ring & hair_m & (a >= 200)
    bleed = cand & skin_like
    lb, n = ndimage.label(bleed, ndimage.generate_binary_structure(2, 1))
    sizes = np.bincount(lb.ravel())[1:] if n else np.array([0])
    top = np.argsort(sizes)[::-1][:4]
    print(f"{label}: skinref={skin_ref.round(0)} H{sh} S{ss} | bleed {int(bleed.sum())} n={n} "
          f"max={int(sizes.max()) if n else 0}")
    for i in top:
        if sizes[i] == 0:
            continue
        m = lb == (i + 1)
        ys, xs = np.where(m)
        print(f"    px={int(sizes[i])} bbox=({xs.min()},{ys.min()})-({xs.max()},{ys.max()}) "
              f"meanRGB={img[m][:, :3].mean(0).round(0)} dE={dsk[m].mean():.1f}")
    return bleed


EV = ROOT / "preview" / "_evidence"
eval_img(np.asarray(Image.open(EV / "t4" / "gemini_neutral_before.png").convert("RGBA")), "render old")
eval_img(np.asarray(Image.open(EV / "t4" / "gemini_neutral_now.png").convert("RGBA")), "render new")