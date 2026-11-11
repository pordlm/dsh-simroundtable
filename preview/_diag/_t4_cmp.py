# -*- coding: utf-8 -*-
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(r"D:\dsh_simroundtable")
plate = np.load(ROOT / ".tmp" / "t4_plate.npy")
rgba = np.asarray(Image.open(ROOT / "preview/_evidence/t4/gemini_neutral_now.png"))
for y, x in [(740, 1150), (740, 1180), (740, 1200), (740, 1205), (740, 1220),
             (700, 1160), (780, 1180), (820, 1190)]:
    print(y, x, "plate", tuple(int(v) for v in plate[y, x]), "render", tuple(int(v) for v in rgba[y, x]))
man = json.loads((ROOT / "assets/build/gemini-v1/gemini.layout.json").read_text(encoding="utf-8"))
print("layer order:", [l["name"] for l in man["layers"]])
print("keys", list(man.keys()))
print(json.dumps(man["layers"][0], ensure_ascii=False)[:300])