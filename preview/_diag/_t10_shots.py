#!/usr/bin/env python3
"""t10 evidence shots: mark the stage_pose enclosed holes and crop them at 6x.

    python preview/_diag/_t10_shots.py mimo mimo-prop            # after
    python preview/_diag/_t10_shots.py mimo --before             # .bak2 baseline

The hole mask follows run_audit/metrics: low alpha (<0.5) enclosed components,
with pixels the matte says are transparent (ref alpha < 128) excluded, so only
real "the art is opaque here but the model is not" gaps stay marked.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview/_diag"))

from _audit import common as C   # noqa: E402

OUT = ROOT / "preview/_evidence/t10"


def _win(win):
    m = np.zeros((C.CANVAS, C.CANVAS), bool)
    m[win[1]:win[3], win[0]:win[2]] = True
    return m


def hole_mask(alpha: np.ndarray, ref: np.ndarray | None, win) -> np.ndarray:
    low = alpha < 0.5
    lab, n = ndi.label(low)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    keep = np.zeros_like(low)
    for i in range(1, n + 1):
        if i in border:
            continue
        m = lab == i
        if ref is not None:
            m = m & (ref >= 128 / 255.0)
        if int(m.sum()) < 4:
            continue
        keep |= m
    keep &= _win(win)
    return keep


def render(page, rig, pose: str) -> np.ndarray:
    params = C.pose_params(pose, list(rig.params))
    return np.asarray(C.grab(page, rig, params, scale=1.0))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="+")
    ap.add_argument("--pose", default="stage_pose")
    ap.add_argument("--before", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    swapped: list[tuple[Path, Path]] = []
    if args.before:
        for key in args.chars:
            live = ROOT / f"assets/build/{key}-v1"
            bak = Path(str(live) + ".bak2")
            tmp = Path(str(live) + ".live-tmp")
            if bak.exists() and live.exists():
                shutil.move(str(live), str(tmp))
                shutil.move(str(bak), str(live))
                swapped.append((live, tmp))
                print(f"swapped in {bak.name} as {live.name}")

    try:
        rigs = C.discover_rigs()
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            br = pw.chromium.launch(channel="msedge", headless=True,
                                   args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
            page.set_default_timeout(180000)
            for key in args.chars:
                rig = rigs[key]
                ref = C.ref_alpha(rig) if rig.has_truth else None
                rgba = render(page, rig, args.pose)
                a = rgba[:, :, 3] / 255.0
                keep = hole_mask(a, ref, rig.window())
                rgb = C.composite(rgba).astype(np.uint8)
                out = np.dstack([rgb, np.full(rgb.shape[:2], 255, np.uint8)])
                out[keep] = [255, 0, 200, 255]
                tag = "before" if args.before else "after"
                C.save_png(OUT / f"{key}_{args.pose}_{tag}_1x.png", out)

                lab, n = ndi.label(keep)
                if n:
                    sizes = ndi.sum(keep, lab, range(1, n + 1))
                    big = int(np.argmax(sizes)) + 1
                    sl = ndi.find_objects(lab == big)[0]
                    cy, cx = (sl[0].start + sl[0].stop) // 2, (sl[1].start + sl[1].stop) // 2
                    print(f"{key}: {int(keep.sum())} hole px, largest {int(sizes[big - 1])} px "
                          f"@ x{sl[1].start}-{sl[1].stop} y{sl[0].start}-{sl[0].stop}")
                else:
                    size = max(rgba.shape[:2])
                    cy = cx = size // 2
                    print(f"{key}: no holes")
                half = 150
                x0, y0 = max(0, cx - half), max(0, cy - half)
                crop = out[y0:y0 + 2 * half, x0:x0 + 2 * half]
                up = np.asarray(Image.fromarray(crop).resize(
                    (crop.shape[1] * 6, crop.shape[0] * 6), Image.NEAREST))
                C.save_png(OUT / f"{key}_{args.pose}_{tag}_6x.png", up)

                # annotated 1x with a box around the largest hole
                im = Image.fromarray(out, "RGBA")
                dr = ImageDraw.Draw(im)
                dr.rectangle([x0, y0, x0 + 2 * half, y0 + 2 * half], outline=(255, 255, 255), width=3)
                im.save(OUT / f"{key}_{args.pose}_{tag}_boxed.png")
            br.close()
    finally:
        for live, tmp in swapped:
            bak = Path(str(live) + ".bak2")
            if live.exists():
                shutil.move(str(live), str(bak))
            shutil.move(str(tmp), str(live))
            print(f"restored {live.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())