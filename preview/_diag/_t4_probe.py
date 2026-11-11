# -*- coding: utf-8 -*-
"""t4 probe: locate the Gemini fill components and read the colour/alpha at the
right-jaw boundary.  Read-only."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import common as C
from _audit import metrics as M

rigs = C.discover_rigs()
rig = rigs["gemini"]
print("build", rig.build)
print("layout", rig.layout)
print("matte", rig.matte, "face", rig.face)
plate = M.plate_canvas(rig)
ref, label = M.reference_plate(rig)
print("plate", plate.shape if plate is not None else None, "ref", label)
an, ao = plate[..., 3], ref[..., 3]
fill = (an >= 250) & (ao < 200)
lab, n = ndi.label(fill)
print("fill px", fill.sum(), "components", n)
sizes = ndi.sum(fill, lab, range(1, n + 1))
order = np.argsort(sizes)[::-1]
for k in order[:6]:
    i = k + 1
    m = lab == i
    ys, xs = np.where(m)
    print(f"comp {i}: px={int(sizes[k])} bbox=({xs.min()},{ys.min()})-({xs.max()},{ys.max()})")

res = M.fill_boundary_edges(plate, ref, np.zeros((2048, 2048, 4), np.uint8), rig.window(), "plate")
print("worst long", res["worst_long"], "long edges:", json.dumps(res["long_edges"], indent=1))
print("any edges:", json.dumps(res["any_edges"], indent=1))
# also print all components >=300 px
for c in res["components"]:
    print("C", c["px"], c["bbox"], "L", c["edge_dl_left"], c["edge_dl_left_rows"],
          "R", c["edge_dl_right"], c["edge_dl_right_rows"], "ratio", c["bbox_fill_ratio"])

np.save(ROOT / ".tmp" / "t4_fill.npy", fill)
np.save(ROOT / ".tmp" / "t4_plate.npy", plate)
np.save(ROOT / ".tmp" / "t4_ref.npy", ref)
print("saved .tmp/t4_fill.npy etc")