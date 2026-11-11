# -*- coding: utf-8 -*-
"""t4: flat composite of a layout dir (neutral, no mesh) for visual checks.

    python preview/_diag/_t4_preview.py assets/build/_t4-try assets/build/gemini-v1
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "preview" / "_evidence" / "t4"
OUT.mkdir(parents=True, exist_ok=True)


def composite(build: Path) -> np.ndarray:
    man = json.loads(next(build.glob("*.layout.json")).read_text(encoding="utf-8"))
    c = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    for l in man["layers"]:
        im = Image.open(build / l["image"]["path"]).convert("RGBA")
        c.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
    return np.asarray(c)


new_d = Path(sys.argv[1])
old_d = Path(sys.argv[2]) if len(sys.argv) > 2 else None
new = composite(new_d)
Image.fromarray(new).save(OUT / "t4_cand_flat.png")
box = (1180, 700, 1240, 830)
crop = Image.fromarray(new).crop(box).resize(((box[2] - box[0]) * 6, (box[3] - box[1]) * 6), Image.NEAREST)
crop.save(OUT / "t4_cand_6x.png")
# 3 px wide guide at the metric boundary x=1201 (drawn in the margin, not on top)
g = np.asarray(crop).copy()
g[:, (1201 - box[0]) * 6:(1201 - box[0]) * 6 + 3] = (0, 255, 0, 255)
Image.fromarray(g).save(OUT / "t4_cand_6x_guide.png")
if old_d is not None:
    old = composite(old_d)
    diff = np.abs(new[..., :3].astype(int) - old[..., :3].astype(int)).max(axis=2)
    d = np.zeros((2048, 2048, 3), np.uint8)
    d[..., 0] = np.clip(diff * 4, 0, 255)
    d[..., 1] = np.clip(diff, 0, 255)
    Image.fromarray(d).save(OUT / "t4_cand_diff.png")
    dc = Image.fromarray(d).crop(box).resize(((box[2] - box[0]) * 6, (box[3] - box[1]) * 6), Image.NEAREST)
    dc.save(OUT / "t4_cand_diff_6x.png")
    print("changed px", int((diff > 0).sum()), "max", int(diff.max()),
          "over8", int((diff > 8).sum()))
print("bbox", box, "saved", OUT)