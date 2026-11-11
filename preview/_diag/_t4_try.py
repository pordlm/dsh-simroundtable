# -*- coding: utf-8 -*-
"""t4: measure fill_boundary_edges for a candidate build dir (no PSD2Live).

    python preview/_diag/_t4_try.py assets/build/_t4-try
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C, metrics as M


def plate_of(build: Path) -> np.ndarray:
    man = json.loads(next(build.glob("*.layout.json")).read_text(encoding="utf-8"))
    for l in man["layers"]:
        if l["name"].strip().lower().replace("_", " ") == "head base":
            im = Image.open(build / l["image"]["path"]).convert("RGBA")
            ok = np.zeros((C.CANVAS, C.CANVAS, 4), np.uint8)
            arr = np.asarray(im)
            h, w = arr.shape[:2]
            ok[l["rect"]["top"]:l["rect"]["top"]+h, l["rect"]["left"]:l["rect"]["left"]+w] = arr
            return ok
    raise SystemExit("no head base")


build = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets/build/_t4-try"
new = plate_of(build)
ref = np.load(ROOT / ".tmp" / "t4_ref.npy")
rgba = np.load(ROOT / ".tmp" / "t4_plate.npy")
face = {"left": 839, "top": 510, "width": 372, "height": 300}
res = M.fill_boundary_edges(new, ref, rgba, face, source="plate")
print({k: v for k, v in res.items() if k != "components" and not hasattr(v, "shape")}); print(json.dumps({k: v for k, v in res.items() if k != "components" and not hasattr(v, "shape")},
                 ensure_ascii=False, indent=1)[:2000])
for c in res.get("components", [])[:8]:
    print("  comp", {k: c[k] for k in c if k not in ("rows", )})
# historical quantity: right edge of the rightmost long component, per-row dL
for c in res.get("components", []):
    if c.get("side") == "right" and c.get("rows", 0) >= 50:
        bx0, by0, bx1, by1 = c["bbox"]
        L = C.to_lstar(new[..., :3]).astype(np.float64)
        Lr = C.to_lstar(ref[..., :3]).astype(np.float64)
        print(f"right edge bbox={c['bbox']} x={bx1} rows={c['rows']} dL={c['dL']:.2f}")
        for y in range(by0, by1, 24):
            ins = L[y, bx1 - 6:bx1] if bx1 - 6 >= 0 else L[y, :bx1]
            out = Lr[y, bx1 + 4:bx1 + 10]
            print(f"   y={y} in={ins.mean():6.1f} out={out.mean():6.1f} d={ins.mean()-out.mean():+6.1f}"
                  f" newRGB={tuple(int(v) for v in new[y, bx1-2, :3])}")