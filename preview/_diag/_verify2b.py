"""用 model.getLocalBounds()/position 把 canvas 坐标精确映射到像素，再裁嘴部窗口。

上一版失败原因：直接拿 canvas 坐标当像素用（probe 会按 bounds 左上角对齐，且 bak3 与
当前 build 的 bounds 不同），所以新旧两版裁到的不是同一块区域。
"""
import asyncio
import io

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

# canvas 窗口：minimax 人中小红斑 + 嘴；dounai 笑线与上唇弧
CASES = [
    ("minimax", "minimax-v1.bak3", "minimax-v1",
     "..\\assets\\build\\{}\\minimax.layout.model3.json", (985, 555, 1125, 715)),
    ("dounai", "dounai-v1.bak3", "dounai-v1",
     "..\\assets\\build\\{}\\dounai.layout.model3.json", (940, 745, 1170, 895)),
]
OUT_DIR = r"preview/_evidence/verify2"


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


async def grab(page, tpl, d, out):
    url = ("http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23FF00FF&model=" + tpl.format(d))
    await page.goto(url, wait_until="load")
    await page.wait_for_function("() => window.__model && window.__model.internalModel", timeout=90000)
    await page.wait_for_timeout(3500)
    meta = await page.evaluate("""() => {
        const m = window.__model;
        const b = m.getLocalBounds();
        return { bx: b.x, by: b.y, bw: b.width, bh: b.height,
                 px: m.position.x, py: m.position.y, s: m.scale.x,
                 w: m.width, h: m.height };
    }""")
    buf = await page.screenshot()
    img = Image.open(io.BytesIO(buf)).convert("RGB")
    img.save(out)
    return meta, img


async def main():
    rows = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True,
                                          args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = await browser.new_page(viewport={"width": 1100, "height": 1100}, device_scale_factor=1)
        for name, old_d, new_d, tpl, win in CASES:
            entry = {"name": name, "win": win}
            for tag, d in (("old", old_d), ("new", new_d)):
                meta, img = await grab(page, tpl, d, f"{OUT_DIR}/{name}_{tag}_1x.png")
                entry[tag] = (meta, img)
            rows.append(entry)
        await browser.close()

    for e in rows:
        name, (x0, y0, x1, y1) = e["name"], e["win"]
        panels = []
        stats = {}
        for tag, label in (("old", "旧 bak3"), ("new", "新 当前")):
            meta, img = e[tag]
            px0 = (x0 - meta["bx"]) * meta["s"] + meta["px"]
            py0 = (y0 - meta["by"]) * meta["s"] + meta["py"]
            px1 = (x1 - meta["bx"]) * meta["s"] + meta["px"]
            py1 = (y1 - meta["by"]) * meta["s"] + meta["py"]
            box = (int(px0), int(py0), int(px1), int(py1))
            crop = img.crop(box)
            arr = np.asarray(crop).astype(int)
            r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
            # 品红底排除
            magenta = (r > 240) & (b > 240) & (g < 60)
            redish = (~magenta) & (r - g > 55) & (r > 150) & (b < 150)
            stats[label] = int(redish.sum())
            big = crop.resize((crop.width * 6, crop.height * 6), Image.LANCZOS)
            d = ImageDraw.Draw(big)
            d.rectangle([0, 0, big.width - 1, 24], fill=(16, 20, 30))
            d.text((8, 3), f"{name} · {label} · 可疑红像素 {stats[label]}", font=font(15), fill=(240, 245, 252))
            panels.append(big)
        W = sum(p.width for p in panels) + 20
        H = max(p.height for p in panels) + 46
        sheet = Image.new("RGB", (W, H), (10, 14, 22))
        x = 0
        for p in panels:
            sheet.paste(p, (x, 36))
            x += p.width + 20
        d = ImageDraw.Draw(sheet)
        d.text((8, 8), f"{name} 嘴部窗口 canvas {e['win']} · 6× · 旧(左) / 新(右)", font=font(19), fill=(226, 232, 240))
        out = f"{OUT_DIR}/{name}_mouthwin_6x.png"
        sheet.save(out)
        print("wrote", out, stats)


asyncio.run(main())