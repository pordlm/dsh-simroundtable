import json
import numpy as np
from PIL import Image
from pathlib import Path
lay = json.loads(Path("assets/build/dounai-layout/dounai.layout.json").read_text(encoding="utf-8"))
for L in lay["layers"]:
    if "hand" in L["name"]:
        print(L["name"], L["image"]["path"], L.get("rect"))
        p = Path("assets/build/dounai-layout") / L["image"]["path"]
        a = np.asarray(Image.open(p))[..., 3]
        ys, xs = np.nonzero(a)
        print("   image bbox", (xs.min(), ys.min(), xs.max(), ys.max()), "size", Image.open(p).size)
