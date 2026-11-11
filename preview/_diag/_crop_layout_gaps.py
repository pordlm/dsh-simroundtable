#!/usr/bin/env python3
"""Crop the 2048 layout composite (and its holes) around a region, upscaled.

    python preview/_diag/_crop_layout_gaps.py kimi 640 500 820 820 [out.png]

Left: composite over dark stage, right: alpha with enclosed holes in yellow.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
CANVAS = 2048


def main() -> int:
    name = sys.argv[1]
    x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6])
    out = Path(sys.argv[6]) if len(sys.argv) > 6 else ROOT / "preview" / "_diag" / f"_{name}_gap_{x0}_{y0}.png"
    lay_dir = ROOT / "assets" / "build" / f"{name}-layout"
    lay = json.loads((lay_dir / f"{name}.layout.json").read_text(encoding="utf-8"))
    comp = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    for L in lay["layers"]:
        p = lay_dir / L["image"]["path"]
        if not p.is_file():
            continue
        im = Image.open(p).convert("RGBA")
        comp.alpha_composite(im, (L["rect"]["left"], L["rect"]["top"]))
    a = np.asarray(comp)
    alpha = a[..., 3]
    solid = alpha > 127
    lab, n = ndimage.label(~solid)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    holes = np.zeros_like(solid)
    for i in range(1, n + 1):
        if i not in border:
            holes |= lab == i
    holes &= alpha < 128

    stage = np.array([18, 24, 38], np.float64)
    al = alpha[..., None] / 255.0
    rgb = a[..., :3].astype(np.float64) * al + stage * (1 - al)
    left = rgb.astype(np.uint8).copy()
    left[holes] = [255, 235, 0]
    right = np.repeat(alpha[..., None], 3, axis=2)
    right[holes] = [255, 235, 0]
    crop = (x0, y0, x1, y1)
    L = Image.fromarray(left).crop(crop)
    R = Image.fromarray(right).crop(crop)
    z = 3
    L = L.resize((L.width * z, L.height * z), Image.NEAREST)
    R = R.resize((R.width * z, R.height * z), Image.NEAREST)
    both = Image.new("RGB", (L.width * 2 + 12, L.height), (60, 60, 60))
    both.paste(L, (0, 0))
    both.paste(R, (L.width + 12, 0))
    both.save(out)
    print(out, both.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())