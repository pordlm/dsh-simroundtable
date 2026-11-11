# -*- coding: utf-8 -*-
"""t5: measure the artifact straight off the rendered stage.

stage_new_two_2x.png and stage_old_two_2x.png are the same scene (same camera,
same seed, same stage code) rendered with the shipped plate vs the .bak plate,
so every pixel difference is attributable to the plate change.

Reports, in 1x CSS px:
  * bbox / area of "new is lighter by >= 8 L*" (the pale patch)
  * the same for "new is darker" (what the fix removed)
  * tonal step across the patch's straight boundary
  * leftover near-black pixels inside the Gemini head (the defect t4 targeted)

Writes preview/_evidence/t5/stage_diff.json|txt, stage_diff_heat_6x.png,
stage_pair_gemini_6x.png
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

OUT = Path(r"D:\dsh_simroundtable\preview\_evidence\t5")


def lstar(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    return np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)


def main() -> int:
    new = np.asarray(Image.open(OUT / "stage_new_two_2x.png").convert("RGB"))
    old = np.asarray(Image.open(OUT / "stage_old_two_2x.png").convert("RGB"))
    assert new.shape == old.shape, (new.shape, old.shape)
    ln, lo = lstar(new), lstar(old)
    d = ln - lo

    # Gemini sits at x=559 CSS -> 1118 px at 2x, head spans roughly y 60..200 CSS
    x0, x1 = 1118 - 140, 1118 + 140
    y0, y1 = 120, 400
    roi = np.zeros(d.shape, bool)
    roi[y0:y1, x0:x1] = True

    lighter = (d > 8) & roi
    darker = (d < -8) & roi
    res = {}
    for name, m in (("lighter", lighter), ("darker", darker)):
        area = int(m.sum())
        res[name + "_area_px1x"] = round(area / 4.0, 1)
        if area:
            ys, xs = np.where(m)
            res[name + "_bbox_css1x"] = [round(xs.min() / 2, 1), round(ys.min() / 2, 1),
                                         round(xs.max() / 2, 1), round(ys.max() / 2, 1)]
            res[name + "_mean_dL"] = round(float(d[m].mean()), 1)

    # straight-boundary step: the patch's left edge column, sampled on rows it covers
    if lighter.any():
        ys, xs = np.where(lighter)
        cx = int(np.percentile(xs, 2))
        rows = ys[(xs > cx - 3) & (xs < cx + 3)]
        rows = rows[(rows > y0) & (rows < y1)]
        if rows.size:
            inside = ln[rows][:, cx + 2:cx + 12].mean()
            outside = ln[rows][:, cx - 12:cx - 2].mean()
            res["patch_edge_step_dL"] = round(float(inside - outside), 1)
            res["patch_edge_rows"] = int(rows.size)

    # leftover near-black skin pixels inside the Gemini head (defect t4 targeted)
    head = np.zeros(d.shape, bool)
    head[y0:y1, x0:x1] = True
    for tag, img in (("new", new), ("old", old)):
        dark = (img.max(axis=2) < 45) & head
        res[tag + "_dark_px1x"] = round(float(dark.sum()) / 4.0, 1)

    print(json.dumps(res, ensure_ascii=False, indent=1))
    (OUT / "stage_diff.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        "t5 / rendered-stage diff (same camera+seed, shipped plate vs .bak plate)",
        f"  pale patch: {res.get('lighter_area_px1x')} CSS px^2, bbox {res.get('lighter_bbox_css1x')} "
        f"(1x), mean dL* {res.get('lighter_mean_dL')}",
        f"  removed dark seam: {res.get('darker_area_px1x')} CSS px^2, mean dL* {res.get('darker_mean_dL')}",
        f"  patch boundary step: {res.get('patch_edge_step_dL')} L* over {res.get('patch_edge_rows')} rows",
        f"  near-black px in Gemini head: old {res.get('old_dark_px1x')} -> new {res.get('new_dark_px1x')}",
    ]
    (OUT / "stage_diff.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))

    # visuals: 6x pair + heat map
    pad = 20
    crop = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    pair = Image.new("RGB", ((crop[2] - crop[0]) * 6 * 2 + 12, (crop[3] - crop[1]) * 6), (10, 13, 20))
    for i, src in enumerate((old, new)):
        im = Image.fromarray(src).crop(crop)
        im = im.resize((im.width * 6, im.height * 6), Image.NEAREST)
        pair.paste(im, (i * ((crop[2] - crop[0]) * 6 + 12), 0))
    d2 = ImageDraw.Draw(pair)
    d2.text((8, 6), "OLD plate (t4 .bak)", fill=(255, 220, 120))
    d2.text(((crop[2] - crop[0]) * 6 + 20, 6), "SHIPPED plate", fill=(120, 255, 160))
    pair.save(OUT / "stage_pair_gemini_6x.png")

    hm = np.zeros((*d.shape, 3), np.uint8)
    hm[..., 0] = np.clip(np.maximum(d, 0) * 8, 0, 255)   # red = lighter
    hm[..., 2] = np.clip(np.maximum(-d, 0) * 8, 0, 255)  # blue = darker
    im = Image.fromarray(hm).crop(crop)
    im = im.resize((im.width * 6, im.height * 6), Image.NEAREST)
    im.save(OUT / "stage_diff_heat_6x.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())