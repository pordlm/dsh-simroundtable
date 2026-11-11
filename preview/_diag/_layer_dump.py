from pathlib import Path
from PIL import Image
lay = Path("assets/build/gemini-layout/parts")
for name in ("face","front_hair","back_hair","neck"):
    im = Image.open(lay / f"{name}.png").convert("RGBA")
    bg = Image.new("RGBA", im.size, (18, 25, 39, 255))
    bg.alpha_composite(im)
    bg.convert("RGB").save(f"preview/_diag/_layer_{name}.png")
    print(name, im.size)
