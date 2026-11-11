import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

lay = Path("assets/build/gemini-layout")
m = json.loads((lay / "gemini.layout.json").read_text(encoding="utf-8"))

def trim(im, px):
    a = np.asarray(im).copy()
    solid = a[..., 3] > 0
    eroded = ndimage.binary_erosion(solid, ndimage.generate_binary_structure(2, 2), iterations=px)
    a[..., 3] = np.where(eroded, a[..., 3], 0)
    return Image.fromarray(a, "RGBA")

for variant, trim_px in (("now", 0), ("trim", 2)):
    canvas = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    for l in m["layers"]:
        im = Image.open(lay / l["image"]["path"]).convert("RGBA")
        if variant == "trim" and l["name"] == "face":
            im = trim(im, trim_px)
        canvas.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
    bg = Image.new("RGBA", canvas.size, (18, 25, 39, 255))
    bg.alpha_composite(canvas)
    bg.convert("RGB").crop((900, 560, 1350, 1120)).save(f"preview/_diag/_face_{variant}.png")
print("ok")
