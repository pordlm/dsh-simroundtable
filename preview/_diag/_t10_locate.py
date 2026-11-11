#!/usr/bin/env python3
"""Locate the stage_pose enclosed holes for one rig (exemption applied).

    python preview/_diag/_t10_locate.py mimo
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview/_diag"))

from _audit import common as C   # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="+")
    ap.add_argument("--pose", default="stage_pose")
    ap.add_argument("--crop", default=None, help="x0,y0,x1,y1 to save a 6x crop")
    args = ap.parse_args()

    rigs = C.discover_rigs()
    from playwright.sync_api import sync_playwright

    out_dir = ROOT / "preview/_evidence/t10"
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)
        for key in args.chars:
            rig = rigs[key]
            ref = C.ref_alpha(rig) if rig.has_truth else None
            win = rig.window()
            params = C.pose_params(args.pose, list(rig.params))
            rgba = np.asarray(C.grab(page, rig, params, scale=1.0))
            a = rgba[:, :, 3] / 255.0
            low = a < 0.5
            lab, n = ndi.label(low)
            border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
            wx0, wy0, wx1, wy1 = win
            wmask = np.zeros_like(low)
            wmask[wy0:wy1, wx0:wx1] = True
            keep = np.zeros_like(low)
            for i in range(1, n + 1):
                if i in border:
                    continue
                sl = ndi.find_objects(lab == i)[0]
                if not (sl[0].stop > wy0 and sl[0].start < wy1 and sl[1].stop > wx0 and sl[1].start < wx1):
                    continue
                m = lab == i
                if ref is not None:
                    m = m & (ref >= 128 / 255.0)
                px = int((m & wmask).sum())
                if px < 4:
                    continue
                keep |= m
                ys, xs = np.nonzero(m)
                print(f"{key} {args.pose}: {px:5d} px  bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}"
                      f"  (whole domain {int((lab == i).sum())} px)", flush=True)
            print(f"{key} total exempted px in window {int((keep & wmask).sum())}")

            # what parts sit around the holes: composite each layout part
            lay = json.loads(rig.layout.read_text(encoding="utf-8"))
            base = rig.build
            for L in lay["layers"]:
                p = base / L["image"]["path"]
                if not p.exists():
                    continue
                r = L.get("rect") or {}
                im = Image.open(p).convert("RGBA")
                cv = Image.new("RGBA", (C.CANVAS, C.CANVAS), (0, 0, 0, 0))
                cv.alpha_composite(im, (int(r.get("left", 0)), int(r.get("top", 0))))
                pa = np.asarray(cv)[..., 3]
                near = ndi.binary_dilation(keep, iterations=6) & ~keep
                npx = int((pa[near] > 0).sum())
                if npx:
                    print(f"   around: {L['name']:14s} {npx:5d} px of 6px ring", flush=True)

            prev = out_dir / f"{key}_{args.pose}_1x.png"
            C.save_png(prev, rgba)
            if args.crop:
                x0, y0, x1, y1 = (int(v) for v in args.crop.split(","))
                crop = rgba[y0:y1, x0:x1]
                up = np.asarray(Image.fromarray(crop).resize(
                    ((x1 - x0) * 6, (y1 - y0) * 6), Image.NEAREST))
                C.save_png(out_dir / f"{key}_{args.pose}_6x.png", up)
                print(f"   wrote {prev.name} + 6x crop {x1 - x0}x{y1 - y0}")
        br.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())