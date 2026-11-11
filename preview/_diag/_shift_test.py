#!/usr/bin/env python3
"""Is the stage_pose truth count a real hole or just pose displacement?

The matte is the neutral-pose artwork; at stage_pose (AngleX -6 / AngleY -3 /
BodyAngleX -2.3 / Breath 1) a big chibi head and its hair swing by tens of canvas
pixels, so `(matte opaque) & (render transparent)` lights up the whole silhouette
edge without any part-to-part gap existing.  This script searches the best rigid
shift of the matte against the render; if a shift removes most of the count, the
"defect" is displacement, not a hole.

    python preview/_diag/_shift_test.py --chars dounai,mimo,minimax --pose stage_pose
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview/_diag"))

from _audit import common as C   # noqa: E402


def count(ref: np.ndarray, a: np.ndarray, win) -> int:
    m = (ref > 0.85) & (a < 0.60)
    return int(m[win[1]:win[3], win[0]:win[2]].sum())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", required=True)
    ap.add_argument("--pose", default="stage_pose")
    args = ap.parse_args()
    rigs = C.discover_rigs()
    want = [c.strip() for c in args.chars.split(",") if c.strip()]

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="msedge", headless=True,
                                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)
        for key in want:
            rig = rigs[key]
            ref = C.ref_alpha(rig)
            win = rig.window()
            for pose in ("neutral", args.pose):
                params = C.pose_params(pose, list(rig.params))
                a = np.asarray(C.grab(page, rig, params, scale=1.0))[:, :, 3] / 255.0
                base = count(ref, a, win)
                best = (base, 0, 0)
                for dy in range(-48, 49, 4):
                    for dx in range(-48, 49, 4):
                        shifted = ndi.shift(ref, (dy, dx), order=1, mode="nearest")
                        n = count(shifted, a, win)
                        if n < best[0]:
                            best = (n, dx, dy)
                print(f"{key:10s} {pose:11s} truth={base:5d}  best shift dx={best[1]:+3d} dy={best[2]:+3d}"
                      f" -> {best[0]:4d}  ({100 * (1 - best[0] / base) if base else 0:.0f}% removed)",
                      flush=True)
        br.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())