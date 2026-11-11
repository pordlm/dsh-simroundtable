"""只渲染当前 build 的 minimax 嘴窗并按红像素计数（对齐映射与 _verify2b 相同）。"""
import asyncio
import io

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

NAME, DIR = "minimax", "minimax-v1"
WIN = (1010, 640, 1100, 730)
OUT = "preview/_evidence/verify2/minimax_now2_6x.png"


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1100, "height": 1100}, device_scale_factor=1)
        url = (f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23FF00FF&model="
               f"../assets/build/{DIR}/{NAME}.layout.model3.json&cb={np.random.randint(10**6)}")
        await pg.goto(url, wait_until="load")
        await pg.wait_for_function("() => window.__model && window.__model.internalModel", timeout=90000)
        await pg.wait_for_timeout(4000)
        meta = await pg.evaluate("""() => { const m = window.__model; const b = m.getLocalBounds();
            return {bx:b.x, by:b.y, px:m.position.x, py:m.position.y, s:m.scale.x}; }""")
        buf = await pg.screenshot()
        img = Image.open(io.BytesIO(buf)).convert("RGB")
        x0, y0, x1, y1 = WIN
        box = (int((x0 - meta["bx"]) * meta["s"] + meta["px"]), int((y0 - meta["by"]) * meta["s"] + meta["py"]),
               int((x1 - meta["bx"]) * meta["s"] + meta["px"]), int((y1 - meta["by"]) * meta["s"] + meta["py"]))
        crop = img.crop(box)
        a = np.asarray(crop).astype(int)
        r, g, bl = a[..., 0], a[..., 1], a[..., 2]
        magenta = (r > 240) & (bl > 240) & (g < 60)
        red = (~magenta) & (r - g > 55) & (r > 150) & (bl < 150)
        big = crop.resize((crop.width * 6, crop.height * 6), Image.LANCZOS)
        d = ImageDraw.Draw(big)
        d.rectangle([0, 0, big.width - 1, 24], fill=(16, 20, 30))
        d.text((8, 3), f"{NAME} 当前 build · 红像素 {int(red.sum())}", font=font(15), fill=(240, 246, 252))
        big.save(OUT)
        print("red", int(red.sum()), "->", OUT)
        await b.close()


asyncio.run(main())