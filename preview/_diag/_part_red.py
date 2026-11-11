"""定位 minimax 嘴上方红短线 / dounai 张口件上沿的来源：在部件 PNG 上量，不靠渲染。"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

sys.path.insert(0, r"preview/_diag/_audit")
import common  # noqa: E402


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


def comps(mask, min_px=4):
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        sel = lab == i
        if sel.sum() < min_px:
            continue
        ys, xs = np.nonzero(sel)
        out.append(dict(px=int(sel.sum()), x0=int(xs.min()), y0=int(ys.min()),
                        x1=int(xs.max()), y1=int(ys.max())))
    return sorted(out, key=lambda c: -c["px"])


def report(name, win):
    d = json.load(open(f"assets/build/{name}-layout/{name}.layout.json", encoding="utf-8"))
    layers = {L["name"]: L for L in d["layers"] if L.get("name")}
    x0, y0, x1, y1 = win
    print(f"\n=== {name} window {win}")
    for lname in ("face", "mouth close", "mouth open", "head_base", "neck"):
        if lname not in layers:
            continue
        r = layers[lname]["rect"]
        path = f"assets/build/{name}-v1/parts/{lname}.png"
        im = Image.open(path).convert("RGBA")
        a = np.asarray(im).astype(int)
        # 该层在 canvas 里的区域
        sub = a[max(0, y0 - r["top"]):max(0, y1 - r["top"]),
                max(0, x0 - r["left"]):max(0, x1 - r["left"])]
        if sub.size == 0:
            continue
        rgb = sub[..., :3]
        alpha = sub[..., 3]
        r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        red = (alpha > 120) & (r_ - g_ > 45) & (r_ > 120) & (b_ < 160)
        cs = comps(red, 4)
        print(f"  {lname:12s} rect=({r['left']},{r['top']},{r['width']}x{r['height']}) "
              f"alpha>0={int((alpha>0).sum())} redish={int(red.sum())} top3={cs[:3]}")


MIN_WIN = (985, 600, 1130, 760)
DON_WIN = (940, 760, 1160, 900)
report("minimax", MIN_WIN)
report("dounai", DON_WIN)

# ---- 部件放大图：minimax mouth open / dounai mouth open 的上沿 ----
def zoom_part(name, lname, win, out, scale=8):
    d = json.load(open(f"assets/build/{name}-layout/{name}.layout.json", encoding="utf-8"))
    layers = {L["name"]: L for L in d["layers"] if L.get("name")}
    r = layers[lname]["rect"]
    im = Image.open(f"assets/build/{name}-v1/parts/{lname}.png").convert("RGBA")
    x0, y0, x1, y1 = win
    box = (x0 - r["left"], y0 - r["top"], x1 - r["left"], y1 - r["top"])
    crop = im.crop(box)
    bg = Image.new("RGBA", crop.size, (0, 255, 0, 255))
    comp = Image.alpha_composite(bg, crop).convert("RGB")
    big = comp.resize((crop.width * scale, crop.height * scale), Image.NEAREST)
    dr = ImageDraw.Draw(big)
    dr.rectangle([0, 0, big.width - 1, 22], fill=(16, 20, 30))
    dr.text((6, 3), f"{name} · {lname}.png · canvas {win} · {scale}x · 绿=透明", font=font(14), fill=(240, 245, 252))
    big.save(out)
    print("wrote", out, big.size)


zoom_part("minimax", "mouth open", (1000, 630, 1100, 730), "preview/_evidence/verify2/minimax_mouthopen_part_8x.png")
zoom_part("minimax", "face", (1000, 630, 1100, 730), "preview/_evidence/verify2/minimax_face_part_8x.png")
zoom_part("dounai", "mouth open", (960, 780, 1150, 890), "preview/_evidence/verify2/dounai_mouthopen_part_8x.png")
zoom_part("dounai", "face", (960, 780, 1150, 890), "preview/_evidence/verify2/dounai_face_part_8x.png")