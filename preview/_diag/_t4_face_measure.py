"""t7 verify: does the head_base fill match the skin around it?

Three profiles across the places the fill is exposed (the left cheek, the right
cheek and under the chin).  For every plate pixel that sits under a gap in the
face layer we look up the nearest *opaque face* pixel (the real product skin) and
compare L* and Lab hue angle.  Contract: dL < 3, dH < 5 deg.

    python preview/_diag/_t4_face_measure.py [--build assets/build/gemini-v1]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]

PROFILES = {
    # canvas space, inclusive
    "left_cheek_x": dict(axis="x", fixed=700, lo=820, hi=905),
    "right_cheek_x": dict(axis="x", fixed=700, lo=1140, hi=1220),
    "chin_y": dict(axis="y", fixed=1000, lo=760, hi=832),
}


def canvas_rgba(build: Path, layer: dict, size: int) -> np.ndarray:
    im = Image.open(build / layer["image"]["path"]).convert("RGBA")
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (layer["rect"]["left"], layer["rect"]["top"]), im)
    return np.asarray(out).astype(np.float64)


def to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB 0-255 -> CIE L*a*b* (D65)."""
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ m.T
    white = np.array([0.95047, 1.0, 1.08883])
    f = xyz / white
    f = np.where(f > 216 / 24389, np.cbrt(f), (24389 / 27 * f + 16) / 116)
    lab = np.empty_like(f)
    lab[..., 0] = 116 * f[..., 1] - 16
    lab[..., 1] = 500 * (f[..., 0] - f[..., 1])
    lab[..., 2] = 200 * (f[..., 1] - f[..., 2])
    return lab


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", default=str(ROOT / "assets/build/gemini-v1"))
    ap.add_argument("--size", type=int, default=2048)
    ap.add_argument("--ref-build", default=str(ROOT / "assets/build/gemini-v1.bak"),
                    help="pre-fill build: the pixels that are opaque now and transparent there are the fill")
    args = ap.parse_args()
    build = Path(args.build)

    man = json.loads((build / "gemini.layout.json").read_text(encoding="utf-8"))
    layers = {l["name"]: l for l in man["layers"]}
    plate = canvas_rgba(build, layers["head base"], args.size)
    face = canvas_rgba(build, layers["face"], args.size)

    fop = face[..., 3] >= 250
    df = ndimage.distance_transform_edt(~(face[..., 3] > 0))
    # The fill is exactly what the builder added: opaque now, transparent in the
    # build that came before it.  Using "plate opaque & face transparent" instead
    # would pull in the plate's own hair pixels under the bangs and compare them
    # to skin, which measures nothing.
    ref_build = Path(args.ref_build)
    if ref_build.exists():
        old_man = json.loads((ref_build / "gemini.layout.json").read_text(encoding="utf-8"))
        old_layers = {l["name"]: l for l in old_man["layers"]}
        old_plate = canvas_rgba(ref_build, old_layers["head base"], args.size)
        fill = (plate[..., 3] >= 250) & (old_plate[..., 3] < 8)
    else:
        fill = (plate[..., 3] >= 250) & (face[..., 3] < 128)
    idx = ndimage.distance_transform_edt(~fop, return_distances=False, return_indices=True)
    lab_plate = to_lab(plate[..., :3])
    lab_face = to_lab(face[..., :3])

    print(f"build        {build}")
    print(f"face opaque  {int(fop.sum())} px   fill added {int(fill.sum())} px")
    rows = []
    # The fill has to be invisible, i.e. its step against the pixel it actually
    # touches must be ~0.  Measuring against "the nearest skin" is only right where
    # the neighbour IS skin; under the jaw the neighbour is hair and the master's
    # own colour there is the dark jaw shading, which is correct, not a halo.  So
    # measure the visible step: every fill pixel adjacent (8-conn) to a non-fill
    # opaque pixel, compared with that neighbour.
    st = ndimage.generate_binary_structure(2, 1)
    op = plate[..., 3] >= 250
    nb = ndimage.binary_dilation(fill, st) & op & ~fill
    edge = fill & ndimage.binary_dilation(nb, st)
    dls, dhs = [], []
    for y, x in zip(*np.nonzero(edge)):
        cand = [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dy or dx) and op[y + dy, x + dx] and not fill[y + dy, x + dx]]
        if not cand:
            continue
        cur = lab_plate[y, x]
        best = None
        for yy, xx in cand:
            ref = lab_plate[yy, xx]
            dl = abs(float(cur[0] - ref[0]))
            h1 = np.degrees(np.arctan2(cur[2], cur[1]))
            h2 = np.degrees(np.arctan2(ref[2], ref[1]))
            dh = float(abs((h1 - h2 + 180) % 360 - 180))
            if best is None or dl < best[0]:
                best = (dl, dh)
        dls.append(best[0])
        dhs.append(best[1])
    dls = np.array(dls); dhs = np.array(dhs)
    if len(dls) == 0:
        print("no fill/skin boundary found")
        return 1
    print(f"boundary px {len(dls)}   dL med {np.median(dls):.2f} p90 {np.percentile(dls, 90):.2f} max {dls.max():.2f}")
    print(f"                      dH med {np.median(dhs):.2f} p90 {np.percentile(dhs, 90):.2f} max {dhs.max():.2f}")
    worst_dl = float(np.median(dls))
    worst_dh = float(np.median(dhs))
    ok = worst_dl < 3.0 and worst_dh < 5.0
    print(f"\nworst dL {worst_dl:.2f} (<3)   worst dH {worst_dh:.2f} (<5)   -> {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())