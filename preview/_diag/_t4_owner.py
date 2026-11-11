# -*- coding: utf-8 -*-
"""t4: which HEAD_PARTS own the outside strip (x1205..1210, y644..827)?"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C

rig = C.discover_rigs()["gemini"]
man = json.loads(rig.layout.read_text(encoding="utf-8"))
base = rig.layout.parent
HEAD = ("neck", "face", "eye close", "eyewhite", "irides", "mouth close",
        "mouth open", "ears", "front hair", "headwear")
tot = 0
for l in man["layers"]:
    if l["name"] not in HEAD:
        continue
    p = base / l["image"]["path"]
    if not p.exists():
        p = rig.build / l["image"]["path"]
    a = np.asarray(Image.open(p).convert("RGBA"))
    out = np.zeros((2048, 2048, 4), np.uint8)
    r = l["rect"]
    out[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a
    n_out = int((out[644:828, 1205:1211, 3] > 128).sum())
    n_in = int((out[644:828, 1196:1201, 3] > 128).sum())
    print(f"{l['name']:12s} outside={n_out:4d} inside={n_in:4d} rect={l['rect']}")
    tot += n_out
print("outside total", tot, "of", 184 * 6)
# dump colours of the head part(s) that own the outside strip
for l in man["layers"]:
    if l["name"] not in HEAD:
        continue
    p = base / l["image"]["path"]
    if not p.exists():
        p = rig.build / l["image"]["path"]
    a = np.asarray(Image.open(p).convert("RGBA"))
    out = np.zeros((2048, 2048, 4), np.uint8)
    r = l["rect"]
    out[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a
    if (out[644:828, 1205:1211, 3] > 128).sum() > 100:
        print("OWNER", l["name"])
        for y in [650, 700, 740, 780, 820]:
            print("  y", y, [tuple(int(v) for v in out[y, x]) for x in (1205, 1207, 1209)])