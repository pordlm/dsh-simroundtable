import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

lay = Path("assets/build/gemini-layout")
m = json.loads((lay / "gemini.layout.json").read_text(encoding="utf-8"))

def clean_face(im, ring_px=7, dark=150):
    a = np.asarray(im).copy()
    solid = a[..., 3] > 0
    filled = ndimage.binary_fill_holes(solid)
    ring = filled & ~ndimage.binary_erosion(filled, ndimage.generate_binary_structure(2,2), iterations=ring_px)
    lum = a[..., :3].astype(int).mean(axis=2)
    kill = ring & solid & (lum < dark)
    a[kill, 3] = 0
    return Image.fromarray(a, "RGBA"), int(kill.sum())

canvas = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
killed = 0
for l in m["layers"]:
    im = Image.open(lay / l["image"]["path"]).convert("RGBA")
    if l["name"] == "face":
        im, killed = clean_face(im)
    canvas.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
bg = Image.new("RGBA", canvas.size, (18, 25, 39, 255))
bg.alpha_composite(canvas)
bg.convert("RGB").crop((900, 560, 1350, 1120)).save("preview/_diag/_face_clean.png")
print("killed px", killed)
