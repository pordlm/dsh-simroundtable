import json
from pathlib import Path
from PIL import Image

lay = Path("assets/build/gemini-layout")
m = json.loads((lay / "gemini.layout.json").read_text(encoding="utf-8"))
canvas = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
for l in m["layers"]:
    im = Image.open(lay / l["image"]["path"]).convert("RGBA")
    canvas.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
bg = Image.new("RGBA", canvas.size, (18, 25, 39, 255))
bg.alpha_composite(canvas)
c = bg.convert("RGB").crop((900, 560, 1350, 1120))
c.save("preview/_diag/_parts_composite_face.png")
print("parts composite saved", c.size)
