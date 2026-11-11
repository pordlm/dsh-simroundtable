# -*- coding: utf-8 -*-
"""t11: inspect the matte-as-seen-by-the-builder at the pale pixels."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(r"D:\dsh_simroundtable")
sys.path.insert(0, str(ROOT / "assets" / "_raw"))
import make_layout_manifest_gemini as M

CANVAS = 2048
matte = ROOT / "assets/build/gemini-parts/matte.png"
ms = Image.open(matte).convert("RGBA")
k = 1836.0 / float(1487 - 30)
mapping = {"scale": k, "dx": CANVAS / 2.0 - k * (91 + 932) / 2.0,
           "dy": (CANVAS - 1836) // 2 - k * 30}
print("mapping", mapping)
ms = ms.resize((int(round(ms.width * k)), int(round(ms.height * k))), Image.LANCZOS)
img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
img.paste(ms, (int(round(mapping["dx"])), int(round(mapping["dy"]))), ms)
ref = np.asarray(img).astype(np.float64)
mhsv = np.asarray(Image.fromarray(np.clip(ref[..., :3], 0, 255).round().astype(np.uint8)).convert("HSV"))
mh, msv, mv = (mhsv[..., j].astype(np.int32) for j in range(3))
cls = np.zeros((CANVAS, CANVAS), np.int8)
cls[((mh <= 25) | (mh >= 235)) & (msv >= 10) & (mv >= 90)] = 1
cls[(mh >= 135) & (mh <= 232) & (msv >= 35) & (mv >= 50)] = 2
for (x, y) in [(1185, 670), (1180, 660), (1190, 660), (1175, 680), (1198, 660), (1206, 660)]:
    print((x, y), "ref", ref[y, x].astype(int), "HSV", (mh[y, x], msv[y, x], mv[y, x]), "cls", cls[y, x])