#!/usr/bin/env python
"""t4: visual AB of the head plate and of the whole layout composite."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CANVAS = 2048
EVID = ROOT / "preview/_evidence/t4"
EVID.mkdir(parents=True, exist_ok=True)
STAGE = (16, 21, 34)


def composite(layout: Path) -> Image.Image:
    man = json.loads((layout / "gemini.layout.json").read_text(encoding="utf-8"))
    base = Image.new("RGBA", (CANVAS, CANVAS), STAGE + (255,))
    for l in man["layers"]:
        im = Image.open(layout / l["image"]["path"]).convert("RGBA")
        base.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
    return base


def plate(layout: Path) -> Image.Image:
    man = json.loads((layout / "gemini.layout.json").read_text(encoding="utf-8"))
    l = next(l for l in man["layers"] if l["name"] == "head base")
    im = Image.open(layout / l["image"]["path"]).convert("RGBA")
    base = Image.new("RGBA", (CANVAS, CANVAS), STAGE + (255,))
    base.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
    return base


def crop_face(im: Image.Image, pad: int = 40) -> Image.Image:
    box = (839 - pad, 500 - pad, 1211 + pad, 815 + pad)
    return im.crop(box)


def main() -> int:
    old, new = ROOT / "assets/build/gemini-layout", ROOT / "assets/build/_t4-layout"
    for tag, lay in (("old", old), ("new", new)):
        p = crop_face(plate(lay))
        p.resize((p.width * 4, p.height * 4), Image.NEAREST).save(EVID / f"plate_{tag}_4x.png")
        c = crop_face(composite(lay))
        c.save(EVID / f"composite_{tag}_1x.png")
        c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(EVID / f"composite_{tag}_2x.png")
        # sample the two cheek gaps that the plate used to leave transparent
        arr = np.asarray(p)
        print(tag, "plate px (900,760)=", arr[760 - 460, 900 - 799], "(1150,700)=", arr[700 - 460, 1150 - 799])
    # side by side composite, 2x
    a = crop_face(composite(old))
    b = crop_face(composite(new))
    sheet = Image.new("RGBA", (a.width * 2 + 8, a.height), (0, 0, 0, 255))
    sheet.paste(a, (0, 0))
    sheet.paste(b, (a.width + 8, 0))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(EVID / "composite_ab_2x.png")
    print("wrote", EVID)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())