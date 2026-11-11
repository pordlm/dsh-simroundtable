import json
import numpy as np
from PIL import Image
from pathlib import Path
lay = json.loads(Path("assets/build/dounai-v1/dounai.layout.json").read_text(encoding="utf-8"))
base = Path("assets/build/dounai-v1")
comp = np.zeros((2048, 2048), np.uint8)
per = {}
for L in lay["layers"]:
    r = L["rect"]
    im = Image.open(base / L["image"]["path"]).convert("RGBA")
    cv = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    cv.alpha_composite(im, (int(r["left"]), int(r["top"])))
    a = np.asarray(cv)[..., 3]
    per[L["name"]] = a
    comp = np.maximum(comp, a)
box = (1361, 1559, 620, 748)   # y0,y1,x0,x1 left mitt
box2 = (1374, 1559, 1304, 1428)
for name in ("left", "right"):
    y0, y1, x0, x1 = box if name == "left" else box2
    print("==", name)
    for k, a in per.items():
        n = int((a[y0:y1, x0:x1] > 0).sum())
        if n: print(f"   {k:14s} {n:6d}")
    print("   composite", int((comp[y0:y1, x0:x1] > 0).sum()), "of", (y1-y0)*(x1-x0))
