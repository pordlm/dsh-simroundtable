"""渲染当前 minimax / dounai 的嘴部窗口（1:1 + 6x），用于目视复核。"""
import asyncio
import io
import sys

from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

CASES = [
    ("minimax", "minimax-v1", (1010, 640, 1100, 730)),
    ("dounai", "dounai-v1", (950, 780, 1150, 890)),
]
OUT = "preview/_evidence/verify2"


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=1)
        for name, d, win in CASES:
            url = (f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23FF00FF&model="
                   f"../assets/build/{d}/{name}.layout.model3.json")
            await pg.goto(url, wait_until="load")
            await pg.wait_for_function("() => window.__model && window.__model.internalModel", timeout=90000)
            await pg.wait_for_timeout(3500)
            meta = await pg.evaluate("""() => { const m = window.__model; const b = m.getLocalBounds();
                return {bx:b.x, by:b.y, px:m.position.x, py:m.position.y, s:m.scale.x}; }""")
            buf = await pg.screenshot()
            img = Image.open(io.BytesIO(buf)).convert("RGB")
            x0, y0, x1, y1 = win
            box = (int((x0 - meta["bx"]) * meta["s"] + meta["px"]), int((y0 - meta["by"]) * meta["s"] + meta["py"]),
                   int((x1 - meta["bx"]) * meta["s"] + meta["px"]), int((y1 - meta["by"]) * meta["s"] + meta["py"]))
            crop = img.crop(box)
            big = crop.resize((crop.width * 6, crop.height * 6), Image.LANCZOS)
            dr = ImageDraw.Draw(big)
            dr.rectangle([0, 0, big.width - 1, 24], fill=(16, 20, 30))
            dr.text((8, 3), f"{name} 当前 build · canvas {win} · 6x", font=font(15), fill=(240, 246, 252))
            out = f"{OUT}/{name}_now_6x.png"
            big.save(out)
            print("wrote", out, big.size)
        await b.close()


asyncio.run(main())