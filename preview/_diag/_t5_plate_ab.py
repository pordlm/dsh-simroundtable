# -*- coding: utf-8 -*-
"""t5: what exactly did the t4 plate fix change, and how hard is its edge?

Compares assets/build/gemini-v1.bak/parts/head_base.png with the shipped
parts/head_base.png, both placed on the 2048 canvas, and reports:

  * the bbox / area of the changed skin (canvas px and 1x stage px at k=0.14111)
  * the tonal step across the patch boundary (L* just inside vs just outside)
  * flatness: L* std inside the patch vs the untouched skin right next to it
  * the same step measured on the *old* defect (backdrop showing through) for a
    fair "which is more conspicuous" comparison

Writes preview/_evidence/t5/plate_ab.json|txt + plate_ab_{5x}.png
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
NEW = ROOT / "assets" / "build" / "gemini-v1"
OLD = ROOT / "assets" / "build" / "gemini-v1.bak"
K = 0.14111


def canvas_plate(build: Path):
    man = json.loads((build / "gemini.layout.json").read_text(encoding="utf-8"))
    rects = {l["name"]: l["rect"] for l in man["layers"]}
    r = rects["head base"]
    arr = np.asarray(Image.open(build / "parts" / "head_base.png").convert("RGBA"))
    out = np.zeros((2048, 2048, 4), np.uint8)
    out[r["top"]:r["top"] + arr.shape[0], r["left"]:r["left"] + arr.shape[1]] = arr
    return out, rects


def lstar(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    return np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)


def main() -> int:
    new, rects = canvas_plate(NEW)
    old, _ = canvas_plate(OLD)
    an, ao = new[..., 3], old[..., 3]
    ln, lo = lstar(new[..., :3]), lstar(old[..., :3])

    face = rects["face"]
    fx0, fy0 = face["left"], face["top"]
    fx1, fy1 = fx0 + face["width"], fy0 + face["height"]

    filled = (an >= 250) & (ao < 200)
    filled[:] = filled & np.pad(np.ones((2048, 2048), bool), 0)  # no-op, clarity
    ys, xs = np.where(filled)
    box = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    area = int(filled.sum())

    # tonal step across the left/right vertical boundary of the fill, sampled on
    # rows the fill actually covers
    def col_profile(mask: np.ndarray, x0: int, x1: int, step: int) -> dict:
        rows = np.where(mask.any(axis=1))[0]
        ins = ln[rows][:, max(0, x0):min(2048, x0 + step)]
        outs = ln[rows][:, max(0, x1 - step):min(2048, x1)]
        return {"inside_l": round(float(ins.mean()), 1), "outside_l": round(float(outs.mean()), 1)}

    # find columns where the fill starts, per row band
    left_edge = int(xs.min())
    right_edge = int(xs.max())
    rowband = filled[:, left_edge:left_edge + 6].any(axis=1)
    rows = np.where(rowband)[0]
    left_step = {"inside": round(float(ln[rows, left_edge + 2:left_edge + 10].mean()), 1),
                 "outside": round(float(ln[rows, left_edge - 10:left_edge - 2].mean()), 1)}
    right_step = {"inside": round(float(ln[rows, right_edge - 10:right_edge - 2].mean()), 1),
                  "outside": round(float(ln[rows, right_edge + 2:right_edge + 10].mean()), 1)}

    # flatness inside the fill vs surrounding untouched plate skin
    inside_std = round(float(ln[filled].std()), 1)
    ring = ndi.binary_dilation(filled, iterations=14) & ~ndi.binary_dilation(filled, iterations=3) & (ao >= 250)
    ring_std = round(float(ln[ring].std()), 1)
    inside_l = round(float(ln[filled].mean()), 1)
    ring_l = round(float(ln[ring].mean()), 1)

    # gradient magnitude across the fill boundary: 1-px L* jumps
    gy, gx = np.gradient(ln)
    gm = np.hypot(gx, gy)
    edge = ndi.binary_dilation(filled, iterations=1) & ~filled
    edge_jump = round(float(np.percentile(gm[edge], 95)), 1) if edge.any() else None
    skin_jump = round(float(np.percentile(gm[ring], 95)), 1)

    res = {
        "fill_bbox_canvas": box,
        "fill_px_canvas": area,
        "fill_px_stage1x": round(area * K * K, 1),
        "fill_bbox_stage1x": [round((box[2] - box[0] + 1) * K, 1), round((box[3] - box[1] + 1) * K, 1)],
        "face_rect": face,
        "fill_vs_face_rect_ratio": round(area / float(face["width"] * face["height"]), 3),
        "left_step_l": left_step,
        "right_step_l": right_step,
        "inside_mean_l": inside_l,
        "ring14_mean_l": ring_l,
        "inside_std_l": inside_std,
        "ring14_std_l": ring_std,
        "edge_p95_gradient": edge_jump,
        "skin_p95_gradient": skin_jump,
    }
    print(json.dumps(res, ensure_ascii=False, indent=1))

    # visual: 5x crop of the plate around the face with the fill boundary marked
    pad = 40
    box2 = (fx0 - pad, fy0 - pad, fx1 + pad, fy1 + pad)
    comp_new = Image.new("RGBA", (2048, 2048), (12, 16, 26, 255))
    comp_new.alpha_composite(Image.fromarray(new))
    im = comp_new.crop(box2).convert("RGB")
    im = im.resize((im.width * 5, im.height * 5), Image.NEAREST)
    d = ImageDraw.Draw(im)
    d.rectangle([(box[0] - box2[0]) * 5, (box[1] - box2[1]) * 5,
                 (box[2] - box2[0]) * 5, (box[3] - box2[1]) * 5], outline=(255, 60, 60), width=2)
    im.save(OUT / "plate_fill_5x.png")
    (OUT / "plate_ab.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        "t5 / head_base fill (old plate -> shipped plate)",
        f"  changed skin area: {area} canvas px = {res['fill_px_stage1x']} stage px^2 at k=0.141",
        f"  changed bbox: {box} canvas = {res['fill_bbox_stage1x']} stage CSS px",
        f"  left step: inside L={left_step['inside']} outside L={left_step['outside']} "
        f"(delta {left_step['inside'] - left_step['outside']:+.1f})",
        f"  right step: inside L={right_step['inside']} outside L={right_step['outside']} "
        f"(delta {right_step['inside'] - right_step['outside']:+.1f})",
        f"  flatness: inside std={inside_std} vs ring std={ring_std} (L*)",
        f"  edge p95 gradient {edge_jump} vs skin p95 {skin_jump} L*/px",
    ]
    (OUT / "plate_ab.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())