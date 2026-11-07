#!/usr/bin/env python
"""t4: compare head_base candidates offline (alpha plate + colour sanity + shift test)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
CANVAS = 2048


def load(layout: Path):
    man = json.loads((layout / "gemini.layout.json").read_text(encoding="utf-8"))
    stack = {}
    for l in man["layers"]:
        arr = np.asarray(Image.open(layout / l["image"]["path"]).convert("RGBA"))
        o = np.zeros((CANVAS, CANVAS, 4), np.uint8)
        r = l["rect"]
        o[r["top"]:r["top"] + arr.shape[0], r["left"]:r["left"] + arr.shape[1]] = arr
        stack[l["name"]] = o
    return man, stack


def report(tag: str, layout: Path):
    man, st = load(layout)
    names = [l["name"] for l in man["layers"]]
    face = st["face"]
    plate = st["head base"]
    fb = next(l["rect"] for l in man["layers"] if l["name"] == "face")
    fr = np.zeros((CANVAS, CANVAS), bool)
    fr[fb["top"]:fb["top"] + fb["height"], fb["left"]:fb["left"] + fb["width"]] = True

    fa = face[..., 3]
    pa = plate[..., 3]
    print(f"== {tag} ({layout.name}) ==")
    print(f"  plate alpha in face rect: frac>=250={float((pa[fr] >= 250).mean()):.4f} frac<8={float((pa[fr] < 8).mean()):.4f}")
    opaque = fr & (pa >= 250)
    lum = plate[..., :3].astype(int).mean(axis=2)
    print(f"  plate colour in face rect (opaque): L min={int(lum[opaque].min())} p1={np.percentile(lum[opaque],1):.1f} "
          f"median={np.percentile(lum[opaque],50):.1f} max={int(lum[opaque].max())} dark(<60)={int((lum[opaque]<60).sum())}")
    # skin reference from face's own opaque pixels
    fl = face[..., :3].astype(int).mean(axis=2)[fa >= 250]
    print(f"  face own colour L median={np.percentile(fl,50):.1f} p1={np.percentile(fl,1):.1f}")

    silhouette = np.zeros_like(pa)
    for nm in names:
        silhouette = np.maximum(silhouette, st[nm][..., 3])
    order = names.index("face")
    below = np.zeros_like(pa)
    above = np.zeros_like(pa)
    for i, nm in enumerate(names):
        if nm in ("head base", "face"):
            continue
        if i < order:
            below = np.maximum(below, st[nm][..., 3])
        else:
            above = np.maximum(above, st[nm][..., 3])

    win = np.zeros((CANVAS, CANVAS), bool)
    win[fb["top"] - 24:fb["top"] + fb["height"] + 24, fb["left"] - 24:fb["left"] + fb["width"] + 24] = True
    print("  face-shift test (defect = silhouette opaque at 0deg, composite < 150):")
    for dx, dy in ((0, 0), (-6, 0), (-4, -2), (6, 0), (4, 2), (0, 2), (0, -2), (-6, -2), (6, -2)):
        fsh = np.roll(np.roll(fa, dy, axis=0), dx, axis=1)
        comp = np.maximum.reduce([below, pa, fsh, above])
        d = win & (silhouette > 230) & (comp < 150)
        semi = win & (silhouette > 230) & (comp >= 150) & (comp < 240)
        print(f"    shift({dx:+d},{dy:+d}): hole={int(d.sum()):>6}px semi={int(semi.sum()):>6}px")
    # min composite alpha inside face rect at 0,0 (the static gutter)
    comp0 = np.maximum.reduce([below, pa, fa, above])
    print(f"  static: face-rect px with comp<250 = {int((fr & (comp0 < 250)).sum())}, comp<150 = {int((fr & (comp0 < 150)).sum())}")
    return 0


def main() -> int:
    for arg in sys.argv[1:]:
        report(Path(arg).name, Path(arg))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())