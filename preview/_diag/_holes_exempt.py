#!/usr/bin/env python3
"""Holes with and without the mother-art exemption, on the real 1:1 render.

run_audit.py calls metrics.holes(rgba, win) without a truth alpha, so every
transparent gap between hair strands counts as a hole even where the mother art
is transparent too (that is negative space the character is supposed to show).
metrics.holes already supports ref_a/exempt_below for exactly this, so this
side-check reports both numbers per pose:

    python preview/_diag/_holes_exempt.py --chars kimi,mimo,minimax

    raw     -- what audit.md reports
    exempt  -- same, minus gaps the matte says should be transparent
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview/_diag"))

from _audit import common as C   # noqa: E402
from _audit import metrics as M  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", required=True)
    ap.add_argument("--poses", default="neutral,stage_pose")
    args = ap.parse_args()

    rigs = C.discover_rigs()
    want = [c.strip() for c in args.chars.split(",") if c.strip()]
    poses = [p.strip() for p in args.poses.split(",") if p.strip()]

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="msedge", headless=True,
                                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)
        for key in want:
            rig = rigs[key]
            win = rig.window()
            ref = C.ref_alpha(rig) if rig.has_truth and rig.map_residual is not None \
                and max(abs(v) for v in rig.map_residual) <= 8 else None
            for pose in poses:
                params = C.pose_params(pose, list(rig.params))
                rgba = C.grab(page, rig, params, scale=1.0)
                a = np.asarray(rgba)
                raw = M.holes(a, win)
                if ref is not None:
                    ex = M.holes(a, win, ref_a=ref, exempt_below=128)
                    print(f"{key:10s} {pose:11s} raw {raw['enclosed_px']:5d}px/{raw['enclosed_n']:3d}  "
                          f"exempt {ex['enclosed_px']:4d}px/{ex['enclosed_n']:3d}  "
                          f"largest {ex['largest_enclosed_px']}", flush=True)
                else:
                    print(f"{key:10s} {pose:11s} raw {raw['enclosed_px']:5d}px/"
                          f"{raw['enclosed_n']:3d}  exempt n/a (no truth)", flush=True)
        br.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())