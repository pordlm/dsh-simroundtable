"""母图上裁嘴部窗口（canvas→matte 用 common.matte_mapping）。"""
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, r"preview/_diag/_audit")
import common  # noqa: E402

OUT = "preview/_evidence/verify2"


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


def shot(name, win, scale=6):
    matte = Path(f"assets/build/{name}-parts/matte.png")
    mp = common.matte_mapping(matte)
    k, dx, dy = mp["scale"], mp["dx"], mp["dy"]
    im = Image.open(matte).convert("RGBA")
    x0, y0, x1, y1 = win
    box = (int((x0 - dx) / k), int((y0 - dy) / k), int((x1 - dx) / k), int((y1 - dy) / k))
    crop = im.crop(box)
    bg = Image.new("RGBA", crop.size, (0, 255, 0, 255))
    comp = Image.alpha_composite(bg, crop).convert("RGB")
    big = comp.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    d.rectangle([0, 0, big.width - 1, 22], fill=(16, 20, 30))
    d.text((6, 3), f"{name} matte · canvas {win} · {scale}x · k={k:.3f}", font=font(14), fill=(240, 245, 252))
    out = f"{OUT}/{name}_matte_mouth_{scale}x.png"
    big.save(out)
    print("wrote", out, big.size, "matte box", box, "mapping", {kk: round(mp[kk], 2) for kk in ("scale", "dx", "dy")})


shot("dounai", (940, 760, 1160, 900))
shot("minimax", (990, 620, 1120, 740))