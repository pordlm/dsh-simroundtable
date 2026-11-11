from pathlib import Path
from PIL import Image
lay = Path("assets/build/gemini-layout/parts")
for name in ("face","front hair","back hair","neck","headwear","eyewhite-l"):
    p = lay / f"{name}.png"
    if not p.exists():
        print("missing", name); continue
    im = Image.open(p).convert("RGBA")
    bg = Image.new("RGBA", im.size, (18, 25, 39, 255))
    bg.alpha_composite(im)
    bg.convert("RGB").save(f"preview/_diag/_layer_{name.replace(' ','_')}.png")
    print(name, im.size)
