import json
from pathlib import Path
lay = json.loads(Path("assets/build/dounai-v1/dounai.layout.json").read_text(encoding="utf-8"))
for L in lay["layers"]:
    print(L["name"], {k: L.get(k) for k in ("visible","opacity","blend","group","tags","variant") if k in L})
print("top-level keys", list(lay.keys()))
