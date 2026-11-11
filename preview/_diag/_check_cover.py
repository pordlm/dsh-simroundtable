import json
import numpy as np
from PIL import Image
from pathlib import Path
lay = json.loads(Path("assets/build/dounai-v1/dounai.layout.json").read_text(encoding="utf-8"))
base = Path("assets/build/dounai-v1")
comp = np.zeros((2048, 2048), np.uint8)
for L in lay["layers"]:
    p = base / L["image"]["path"]
    r = L.get("rect") or {}
    im = Image.open(p).convert("RGBA")
    canvas = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(r.get("left", 0)), int(r.get("top", 0))))
    a = np.asarray(canvas)[..., 3]
    reg = a[1240:1650, 560:840]
    print(f'{L["name"]:12s} rect={r.get("left")},{r.get("top")} {r.get("width")}x{r.get("height")} whole={int((a>0).sum()):8d} inRegion={int((reg>0).sum()):6d}')
    comp = np.maximum(comp, a)
m = comp[1240:1650, 560:840]
print("composite inRegion", int((m>0).sum()))
