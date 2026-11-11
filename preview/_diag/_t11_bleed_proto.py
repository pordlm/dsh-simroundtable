# -*- coding: utf-8 -*-
"""t11: nearest-reference bleed metric (product-domain skin vs hair)."""
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
EV = ROOT / "preview" / "_evidence"

mat = C.matte_ref(rig)[:, :, :3].astype(np.uint8)
mhsv = np.asarray(Image.fromarray(mat).convert("HSV")).astype(np.int32)
mH, mS, mV = mhsv[..., 0], mhsv[..., 1], mhsv[..., 2]
skin_m = ((mH <= 25) | (mH >= 235)) & (mS >= 10) & (mV >= 90)
hair_m = (mH >= 135) & (mH <= 232) & (mS >= 35) & (mV >= 50)

man = json.loads(rig.layout.read_text(encoding="utf-8"))
face = next(l for l in man["layers"] if l["name"] == "face")
aimg = np.asarray(Image.open(rig.layout.parent / face["image"]["path"]).convert("RGBA"))[..., 3]
fa = np.zeros((2048, 2048), np.uint8)
r = face["rect"]
fa[r["top"]:r["top"] + aimg.shape[0], r["left"]:r["left"] + aimg.shape[1]] = aimg
face_op = fa > 0
ring = ndimage.binary_dilation(face_op, ndimage.generate_binary_structure(2, 2), iterations=8) & ~face_op


def lab_lin(x):
    x = x / 255.0
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def to_lab(rgb):
    lin = lab_lin(rgb.astype(np.float64))
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def eval_frame(path, label):
    fr = np.asarray(Image.open(path).convert("RGBA")).astype(np.int32)
    a = fr[..., 3]
    lab = to_lab(fr[..., :3])
    inner = face_op & (a >= 250) & skin_m
    hair_core = hair_m & (a >= 250) & ~ring
    skin_ref = np.median(lab[inner], 0)
    hair_ref = np.median(lab[hair_core], 0)
    dsk = np.linalg.norm(lab - skin_ref, axis=-1)
    dhr = np.linalg.norm(lab - hair_ref, axis=-1)
    cand = ring & hair_m & (a >= 200)
    bleed = cand & (dsk + 6.0 < dhr)
    lab2, n = ndimage.label(bleed, ndimage.generate_binary_structure(2, 1))
    sizes = np.bincount(lab2.ravel())[1:] if n else np.array([0])
    # where is the biggest one?
    big = int(np.argmax(sizes)) + 1 if n else 0
    bb = None
    if big:
        ys, xs = np.where(lab2 == big)
        bb = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    print(f"{label} skin_ref={skin_ref.round(1)} hair_ref={hair_ref.round(1)} | cand {int(cand.sum())} "
          f"bleed {int(bleed.sum())} n={n} max={int(sizes.max()) if n else 0} bbox={bb}")
    return bleed


old = eval_frame(EV / "t4" / "gemini_neutral_before.png", "old")
new = eval_frame(EV / "t4" / "gemini_neutral_now.png", "new")
out = ROOT / "preview" / "_evidence" / "t11"
out.mkdir(parents=True, exist_ok=True)
for nm, msk in (("old", old), ("new", new)):
    fr = np.asarray(Image.open(EV / "t4" / f"gemini_neutral_{'before' if nm == 'old' else 'now'}.png").convert("RGBA")).copy()
    fr[msk] = [255, 0, 0, 255]
    Image.fromarray(fr).crop((1120, 600, 1300, 880)).resize((1080, 1680), Image.NEAREST).save(out / f"bleed_{nm}_overlay.png")