#!/usr/bin/env python3
"""Classify layout-composite gaps per character.

    python preview/_diag/_classify_gaps.py [chars...]

For every rig: composite the layout parts on the 2048 canvas (exactly what the
build ships before the rig deforms), then report

  * truth  = master alpha >= 0.85 & composite alpha < 0.60 (the audit's metric)
  * holes  = enclosed alpha<0.5 components, split by whether the master is
             actually opaque there (advisor rule: master alpha<128 is real
             negative space in the artwork and must NOT be filled)

so "must fix" = truth px + holes where master is opaque.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
CANVAS = 2048
BUILD = ROOT / "assets" / "build"


def composite(name: str):
    lay_dir = BUILD / f"{name}-layout"
    lay = json.loads((lay_dir / f"{name}.layout.json").read_text(encoding="utf-8"))
    comp = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    masks = {}
    for L in lay["layers"]:
        p = lay_dir / L["image"]["path"]
        if not p.is_file():
            continue
        im = Image.open(p).convert("RGBA")
        comp.alpha_composite(im, (L["rect"]["left"], L["rect"]["top"]))
        a = np.asarray(im)[..., 3]
        c = np.zeros((CANVAS, CANVAS), bool)
        r = L["rect"]
        c[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a > 127
        masks[L["name"]] = c
    face = next(L["rect"] for L in lay["layers"] if L["name"] == "face")
    win = (face["left"] - 30, face["top"] - 30,
           face["left"] + face["width"] + 30, face["top"] + face["height"] + 30)
    return np.asarray(comp), masks, win, lay_dir


def mapped_master(name: str, alpha_thr: int = 64):
    m = Image.open(BUILD / f"{name}-parts" / "matte.png").convert("RGBA")
    a = np.asarray(m)[..., 3]
    ys, xs = np.where(a > alpha_thr)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    k = 1836.0 / float(y1 - y0 + 1)
    dx = CANVAS / 2.0 - k * (x0 + x1 + 1) / 2.0
    dy = 106 - k * y0
    big = m.resize((int(round(m.width * k)), int(round(m.height * k))), Image.BILINEAR)
    can = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    can.paste(big, (int(round(dx)), int(round(dy))), big)
    return np.asarray(can)[..., 3], (k, dx, dy)


def main() -> int:
    names = sys.argv[1:] or ["glm", "qwen", "kimi", "mimo", "minimax", "dounai"]
    for name in names:
        rgba, masks, win, lay_dir = composite(name)
        ref, mp = mapped_master(name)
        a = rgba[..., 3] / 255.0
        r = ref / 255.0
        wm = np.zeros((CANVAS, CANVAS), bool)
        wm[win[1]:win[3], win[0]:win[2]] = True

        truth = (r > 0.85) & (a < 0.60)
        lab, n = ndi.label(truth)
        sizes = ndi.sum(truth, lab, range(1, n + 1)) if n else []
        print(f"== {name}  k={mp[0]:.4f}  window={win}")
        print(f"   truth px window={int((truth & wm).sum()):5d}  total={int(truth.sum()):5d}"
              f"  comps>=12={sum(1 for s in sizes if s >= 12)}"
              f"  largest={int(max(sizes)) if len(sizes) else 0}")

        low = a < 0.5
        lab2, n2 = ndi.label(low)
        border = set(np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]])))
        enc_ids = [i for i in range(1, n2 + 1) if i not in border]
        real_solid = 0
        negative = 0
        rows = []
        for i in enc_ids:
            m = (lab2 == i) & wm
            px = int(m.sum())
            if px < 4:
                continue
            refm = ref[m]
            solid_px = int((refm >= 128).sum())
            neg_px = int((refm < 128).sum())
            real_solid += solid_px
            negative += neg_px
            if solid_px >= 4:
                yy, xx = np.where(m)
                ring = ndi.binary_dilation(m, iterations=2) & ~m
                touch = [k for k, v in masks.items() if (v & ring).any()]
                rows.append((solid_px, px, int(xx.min()), int(yy.min()),
                             int(xx.max()), int(yy.max()), touch))
        rows.sort(reverse=True)
        print(f"   holes(enc,win) solid-master px={real_solid:5d}  negative-space px={negative:5d}")
        for s, px, x0, y0, x1, y1, touch in rows[:10]:
            print(f"     solid {s:5d}/{px:5d} px @({x0},{y0})-({x1},{y1})"
                  f"  touches {', '.join(touch)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())