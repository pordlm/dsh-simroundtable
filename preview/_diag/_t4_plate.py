#!/usr/bin/env python
"""t4: measure the head_base plate's alpha coverage and simulate a candidate plate.

Runs offline on assets/build/gemini-layout (no rig needed): the defect mechanism
is "face and plate shift relatively by a few px, and where the plate is
transparent the composite alpha falls to 0".
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = ROOT / "assets/build/gemini-layout"
CANVAS = 2048
HEAD_PARTS = {"neck", "face", "eye close", "eyewhite", "irides", "mouth close",
              "mouth open", "ears", "front hair", "headwear"}


def place(path: Path, rect: dict) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)[..., 3]
    out = np.zeros((CANVAS, CANVAS), np.uint8)
    out[rect["top"]:rect["top"] + a.shape[0], rect["left"]:rect["left"] + a.shape[1]] = a
    return out


def load():
    man = json.loads((LAYOUT / "gemini.layout.json").read_text(encoding="utf-8"))
    alphas, colours = {}, {}
    for l in man["layers"]:
        im = Image.open(LAYOUT / l["image"]["path"]).convert("RGBA")
        arr = np.asarray(im)
        out = np.zeros((CANVAS, CANVAS, 4), np.uint8)
        r = l["rect"]
        out[r["top"]:r["top"] + arr.shape[0], r["left"]:r["left"] + arr.shape[1]] = arr
        alphas[l["name"]] = out[..., 3]
        colours[l["name"]] = out[..., :3]
    return man, alphas, colours


def stats(name, a):
    print(f"  {name:<22} frac(A>230)={float((a > 230).mean()):.4f} min={int(a.min())} cov={int((a > 8).sum())}")


def main() -> int:
    man, alphas, colours = load()
    names = [l["name"] for l in man["layers"]]
    print("layers:", names)

    face = alphas["face"]
    plate = alphas["head base"]
    ys, xs = np.where(face > 8)
    fb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    print("face bbox:", fb)
    fr = np.zeros_like(face, bool)
    fr[fb[1]:fb[3], fb[0]:fb[2]] = True

    print("[current head_base] within face bbox:")
    stats("plate alpha", plate[fr])
    # where is the plate transparent inside the face bbox
    hole = fr & (plate < 250)
    lab, n = ndimage.label(hole)
    sizes = ndimage.sum(hole, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1][:8]
    print(f"  transparent px in face bbox: {int(hole.sum())}  components={n}")
    for i in order:
        sl = ndimage.find_objects(lab == i + 1)[0]
        print(f"    comp {int(sizes[i]):>7}px  x{sl[1].start}..{sl[1].stop} y{sl[0].start}..{sl[0].stop}")

    head_union = np.zeros_like(face)
    for nm in HEAD_PARTS:
        if nm in alphas:
            head_union = np.maximum(head_union, alphas[nm])
    silhouette = np.zeros_like(face)
    for nm in names:
        silhouette = np.maximum(silhouette, alphas[nm])
    print("[union] head parts cov=%d silhouette cov=%d" % (int((head_union > 8).sum()), int((silhouette > 8).sum())))

    # composite alpha with face shifted (proxy for the rig moving face vs plate)
    below = np.zeros_like(face)
    above = np.zeros_like(face)
    order_idx = names.index("face")
    for i, nm in enumerate(names):
        if nm in ("head base", "face"):
            continue
        if i < order_idx:
            below = np.maximum(below, alphas[nm])
        else:
            above = np.maximum(above, alphas[nm])

    def measure(plate_a, label, shifts=(-6, -4, -2, 0, 2, 4, 6)):
        print(f"[{label}]")
        for dx in shifts:
            for dy in (0, -2, 2):
                if dx == 0 and dy == 0:
                    continue
                fsh = np.roll(np.roll(face, dy, axis=0), dx, axis=1)
                comp = np.maximum.reduce([below, plate_a, fsh, above])
                defect = fr & (silhouette > 230) & (comp < 150)
                if defect.any():
                    print(f"    dx={dx:+d} dy={dy:+d}: defect={int(defect.sum()):>6}px  maxcomp={int(comp[fr].max())}")

    measure(plate, "current plate")

    # candidate: plate = union(head parts) filled, dilated N, clipped to silhouette
    solid0 = head_union > 0
    solid0 = ndimage.binary_fill_holes(ndimage.binary_closing(solid0, np.ones((5, 5))))
    for it in (10, 14, 18, 24):
        solid = ndimage.binary_dilation(solid0, ndimage.generate_binary_structure(2, 2), iterations=it)
        solid &= silhouette > 0
        cand = np.where(solid, 255, 0).astype(np.uint8)
        inner_face = fr & (face > 8)
        print(f"[candidate dilate={it}] plate in face-alpha area frac(A>230)={float((cand[inner_face] > 230).mean()):.4f} "
              f"cov={int((cand > 8).sum())}")
        measure(cand, f"candidate dilate={it}", shifts=(-6, 6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())