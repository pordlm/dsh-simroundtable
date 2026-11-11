"""豆包张口三态（0 / 0.5 / 1.0）1:1 渲染 + 6× 裁切，用于目视复核切边是否消失。"""
import asyncio
import io

from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

NAME, DIR = "dounai", "dounai-v1"
WIN = (950, 780, 1150, 890)
STATES = [("0", "0"), ("0.5", "0.5"), ("1", "1.0")]
OUT = "preview/_evidence/verify2/dounai_states_6x.png"


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


async def main():
    panels = []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1100, "height": 1100}, device_scale_factor=1)
        for val, label in STATES:
            url = (f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%23FF00FF"
                   f"&p=ParamMouthOpenY:{val}&model=../assets/build/{DIR}/{NAME}.layout.model3.json")
            await pg.goto(url, wait_until="load")
            await pg.wait_for_function("() => window.__model && window.__model.internalModel", timeout=90000)
            await pg.wait_for_timeout(3000)
            meta = await pg.evaluate("""() => { const m = window.__model; const b = m.getLocalBounds();
                return {bx:b.x, by:b.y, px:m.position.x, py:m.position.y, s:m.scale.x}; }""")
            buf = await pg.screenshot()
            img = Image.open(io.BytesIO(buf)).convert("RGB")
            x0, y0, x1, y1 = WIN
            box = (int((x0 - meta["bx"]) * meta["s"] + meta["px"]), int((y0 - meta["by"]) * meta["s"] + meta["py"]),
                   int((x1 - meta["bx"]) * meta["s"] + meta["px"]), int((y1 - meta["by"]) * meta["s"] + meta["py"]))
            crop = img.crop(box).resize(((x1 - x0) * 6, (y1 - y0) * 6), Image.LANCZOS)
            d = ImageDraw.Draw(crop)
            d.rectangle([0, 0, crop.width - 1, 24], fill=(16, 20, 30))
            d.text((8, 3), f"豆包 MouthOpenY={label}", font=font(15), fill=(240, 246, 252))
            panels.append(crop)
        await b.close()

    W = sum(p.width for p in panels) + 20 * (len(panels) - 1)
    H = max(p.height for p in panels) + 40
    sheet = Image.new("RGB", (W, H), (10, 14, 22))
    x = 0
    for p in panels:
        sheet.paste(p, (x, 32))
        x += p.width + 20
    d = ImageDraw.Draw(sheet)
    d.text((8, 6), "豆包 张口三态（当前 build，上沿已做 5px alpha 渐入）", font=font(19), fill=(226, 232, 240))
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)


asyncio.run(main())