"""按「面部地标锚定」重出对齐的 1:1 / 6× 证据（不依赖 model bounds）。

锚点 = 鼻子高光（全图最亮的大团块，皮肤区域内），旧/新 build 都以它为原点裁切，
因此两版必然对齐，不会出现上一版 _visual_review3.py 的错位。
"""
import asyncio
import io
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

CASES = [
    ("minimax", "minimax-v1.bak3", "minimax-v1", "..\\assets\\build\\{}\\minimax.layout.model3.json"),
    ("dounai", "dounai-v1.bak3", "dounai-v1", "..\\assets\\build\\{}\\dounai.layout.model3.json"),
]
OUT_DIR = r"preview/_evidence/verify2"


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


def anchor_nose(img: Image.Image, w: int, h: int):
    """皮肤区域里最亮的大团块（鼻高光）。返回 canvas 坐标。"""
    a = np.asarray(img.convert("RGBA"))
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    alpha = a[..., 3]
    lum = (r + g + b) / 3.0
    skin = (alpha > 200) & (r > 150) & (r - b > 8) & (g > 90)
    bright = skin & (lum > 235)
    ys, xs = np.nonzero(bright)
    if len(xs) == 0:
        return None
    # 取最靠近画面水平中心、且靠上的亮块
    cx = np.median(xs)
    sel = np.abs(xs - cx) < 260
    ys, xs = ys[sel], xs[sel]
    if len(xs) == 0:
        return None
    return float(np.median(xs)), float(np.median(ys))


async def shoot(page, url, path):
    await page.goto(url, wait_until="load")
    await page.wait_for_function("() => window.__model && window.__model.internalModel", timeout=90000)
    await page.wait_for_timeout(3500)
    buf = await page.screenshot()
    img = Image.open(io.BytesIO(buf)).convert("RGBA")
    img.save(path)
    return img


async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="msedge", headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = await browser.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=1)
        for name, old_dir, new_dir, tpl in CASES:
            row = {"name": name}
            for tag, d in (("old", old_dir), ("new", new_dir)):
                url = ("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23FF00FF&model="
                       + tpl.format(d))
                img = await shoot(page, url, f"{OUT_DIR}/{name}_{tag}_1x.png")
                a = anchor_nose(img, img.width, img.height)
                row[tag] = (img, a)
            results.append(row)
        await browser.close()

    for row in results:
        name = row["name"]
        (old_img, old_a), (new_img, new_a) = row["old"], row["new"]
        if not old_a or not new_a:
            print(f"{name}: anchor failed old={old_a} new={new_a}")
            continue
        half = 90
        panels = []
        for tag, (img, a) in (("旧", row["old"]), ("新", row["new"])):
            ax, ay = a
            box = (int(ax - half), int(ay - half * 0.55), int(ax + half), int(ay + half * 1.45))
            crop = img.convert("RGB").crop(box).resize(((box[2] - box[0]) * 6, (box[3] - box[1]) * 6), Image.LANCZOS)
            d = ImageDraw.Draw(crop)
            d.rectangle([0, 0, crop.width - 1, 26], fill=(16, 20, 30))
            d.text((8, 4), f"{name} {tag}", font=font(16), fill=(235, 240, 248))
            panels.append(crop)
        W = sum(p.width for p in panels) + 24
        H = max(p.height for p in panels) + 56
        sheet = Image.new("RGB", (W, H), (10, 14, 22))
        x = 0
        for p in panels:
            sheet.paste(p, (x, 40))
            x += p.width + 24
        d = ImageDraw.Draw(sheet)
        d.text((8, 8), f"{name}: 以鼻子高光为锚，旧(左) vs 新(右) 6×，背景品红=透明", font=font(20), fill=(226, 232, 240))
        out = f"{OUT_DIR}/{name}_aligned_6x.png"
        sheet.save(out)
        print("wrote", out, "anchors", row["old"][1], row["new"][1])


asyncio.run(main())