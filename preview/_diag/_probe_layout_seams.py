#!/usr/bin/env python3
"""Layout-level seam probe: where exactly do the parts fail to touch?

For one char (or `all`), load assets/build/<name>-layout/<name>.layout.json,
composite every part's alpha on the 2048 canvas, then:

  1. print layout-part union bbox vs matte mapped bbox (the -172/-141 px thing)
  2. find `enclosed` alpha<0.5 components inside the face window and report the
     top ones with bbox + which two parts they sit between (nearest part per
     side of the component)
  3. for the matte: report per-column alpha coverage near the right edge to
     expose a straight full-height cut line

    python preview\\_diag\\_probe_layout_seams.py glm qwen kimi mimo minimax dounai
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "assets" / "build"
CANVAS = 2048


def find_layout(name: str) -> Path:
    for cand in (BUILD / f"{name}-layout" / f"{name}.layout.json",
                 BUILD / f"{name}-prop-layout" / f"{name}-prop.layout.json"):
        if cand.is_file():
            return cand
    raise SystemExit(f"no layout for {name}")


def find_matte(name: str) -> Path | None:
    for cand in (BUILD / f"{name}-parts" / "matte.png",
                 BUILD / f"{name}-prop-parts" / "matte.png"):
        if cand.is_file():
            return cand
    return None


def composite(layout_path: Path):
    lay = json.loads(layout_path.read_text(encoding="utf-8"))
    base = layout_path.parent
    acc = np.zeros((CANVAS, CANVAS), np.float32)
    parts = []
    for L in lay["layers"]:
        p = base / L["image"]["path"]
        if not p.is_file():
            print(f"  MISSING {p}")
            continue
        im = Image.open(p).convert("RGBA")
        a = np.asarray(im)[..., 3].astype(np.float32) / 255.0
        r = L["rect"]
        x, y = int(r["left"]), int(r["top"])
        h, w = a.shape
        acc[y:y + h, x:x + w] = np.maximum(acc[y:y + h, x:x + w], a)
        m = a > 0.5
        if m.any():
            ys, xs = np.nonzero(m)
            parts.append((L["name"], x + xs.min(), y + ys.min(), x + xs.max(), y + ys.max(), int(m.sum())))
    return lay, acc, parts


def matte_map(name: str):
    mp = find_matte(name)
    if mp is None:
        return None, None
    a = np.asarray(Image.open(mp).convert("RGBA"))[..., 3].astype(np.float32) / 255.0
    m = a > (64 / 255)
    ys, xs = np.nonzero(m)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    k = 1836.0 / (y1 - y0)
    dx = 1024 - k * (x0 + x1) / 2.0
    dy = 106 - k * y0
    return (x0, y0, x1, y1, k, dx, dy), a


def main(argv):
    names = argv[1:] or ["glm", "qwen", "kimi", "mimo", "minimax", "dounai"]
    for name in names:
        lp = find_layout(name)
        lay, acc, parts = composite(lp)
        print(f"\n=== {name}  ({lp.relative_to(ROOT)})")
        m = acc > 0.5
        ys, xs = np.nonzero(m)
        print(f"  parts union bbox = ({xs.min()},{ys.min()})-({xs.max()},{ys.max()})  area={int(m.sum())}")
        mm, matte_a = matte_map(name)
        if mm:
            x0, y0, x1, y1, k, dx, dy = mm
            mapb = (k * x0 + dx, k * y0 + dy, k * x1 + dx, k * y1 + dy)
            print(f"  matte src bbox = ({x0},{y0})-({x1},{y1})  k={k:.4f} dx={dx:.1f} dy={dy:.1f}")
            print(f"  matte mapped   = ({mapb[0]:.0f},{mapb[1]:.0f})-({mapb[2]:.0f},{mapb[3]:.0f})")
            print(f"  residual       = left {xs.min()-mapb[0]:+.0f} top {ys.min()-mapb[1]:+.0f} "
                  f"right {xs.max()-mapb[2]:+.0f} bottom {ys.max()-mapb[3]:+.0f}")
            # matte column coverage: find columns fully covered top-to-bottom
            solid = matte_a > 0.85
            colfrac = solid.mean(axis=0)
            tall = np.nonzero(colfrac > 0.95)[0]
            if len(tall):
                print(f"  matte full-height columns: x {tall.min()}..{tall.max()} (n={len(tall)})")
            # alpha profile of the rightmost 20 columns inside bbox
            prof = matte_a[:, max(0, x1 - 12):x1 + 1].mean(axis=0)
            print("  matte right-edge alpha profile:", " ".join(f"{v:.2f}" for v in prof))

        # ---- enclosed gap components inside the face window
        # face window: from the 'face' layer bbox grown 40 px, else canvas centre
        fw = next((p for p in parts if p[0] == "face"), None)
        if fw:
            fx0, fy0, fx1, fy1 = fw[1] - 30, fw[2] - 30, fw[3] + 30, fw[4] + 30
        else:
            fx0, fy0, fx1, fy1 = 700, 300, 1350, 900
        hole = acc < 0.5
        lab, n = ndimage.label(hole)
        # open components touch the canvas border
        border = np.zeros_like(hole)
        border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
        open_ids = np.unique(lab[border & hole])
        sizes = ndimage.sum(hole, lab, range(1, n + 1))
        rows = []
        for k in range(1, n + 1):
            if k in open_ids:
                continue
            if sizes[k - 1] < 2:
                continue
            mm2 = lab == k
            ys2, xs2 = np.nonzero(mm2)
            if xs2.max() < fx0 or xs2.min() > fx1 or ys2.max() < fy0 or ys2.min() > fy1:
                continue
            rows.append((int(sizes[k - 1]), int(xs2.min()), int(ys2.min()), int(xs2.max()), int(ys2.max())))
        rows.sort(reverse=True)
        print(f"  enclosed gaps in face window: n={len(rows)} total={sum(r[0] for r in rows)} px")
        for r in rows[:8]:
            print(f"    {r[0]:5d} px  bbox=({r[1]},{r[2]})-({r[3]},{r[4]})  "
                  f"w={r[3]-r[1]+1} h={r[4]-r[2]+1}")
        if rows:
            # layer masks on the canvas, so each gap can name its two neighbours
            masks = {}
            for L in lay["layers"]:
                p = lp.parent / L["image"]["path"]
                if not p.is_file():
                    continue
                a = np.asarray(Image.open(p).convert("RGBA"))[..., 3]
                c = np.zeros((CANVAS, CANVAS), bool)
                r = L["rect"]
                h, w = a.shape
                c[r["top"]:r["top"] + h, r["left"]:r["left"] + w] = a > 127
                masks[L["name"]] = c
            for r in rows[:6]:
                comp = np.zeros((CANVAS, CANVAS), bool)
                comp[r[2]:r[4] + 1, r[1]:r[3] + 1] = True
                comp &= lab == np.bincount(lab[comp]).argmax() if comp.any() else comp
                ring = ndimage.binary_dilation(comp, iterations=2) & ~comp
                touch = [n2 for n2, m2 in masks.items() if (m2 & ring).any()]
                print(f"    gap {r[0]:5d} px at ({r[1]},{r[2]})-({r[3]},{r[4]}) touches: {', '.join(touch)}")
        print("  parts:", ", ".join(f"{p[0]}[{p[5]}]" for p in parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))