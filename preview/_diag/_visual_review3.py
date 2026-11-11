# 第 4 轮交付图：三处修复的 1× 与 6× 裁图（当前 build vs .bak3）
# 只写文件，不读图。几何：probe ?raw=1&scale=1.0 时画布原点=模型画布原点。
import asyncio, io, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "visual_review3"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0"

# 画布坐标（2048）裁切窗：嘴周 / 人中
WINDOWS = {
    "qwen":    (940, 640, 1170, 830),
    "dounai":  (930, 700, 1190, 900),
    "minimax": (990, 560, 1130, 720),
}
CUR = {"qwen": "qwen-v1", "dounai": "dounai-v1", "minimax": "minimax-v1"}
OLD = {k: v + ".bak3" for k, v in CUR.items()}
FONT = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 22)
TITLE = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 28)


async def shot(pg, build, name):
    model = f"../assets/build/{build}/{name}.layout.model3.json"
    url = f"{BASE}&bg=%23FF00FF&model={model}"
    await pg.goto(url, wait_until="load")
    await pg.wait_for_timeout(900)
    buf = await pg.screenshot()
    im = Image.open(io.BytesIO(buf)).convert("RGB")
    # 画布在页面里的位置：probe 把 canvas 居中；用元素 bbox 换算更稳
    box = await pg.evaluate(
        "() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();"
        " return {x:r.x, y:r.y, w:r.width, h:r.height, cw:c.width, ch:c.height}; }"
    )
    return im, box


def crop(im, box, win, zoom=6):
    sx = box["w"] / box["cw"]
    sy = box["h"] / box["ch"]
    x0, y0, x1, y1 = win
    px = (box["x"] + x0 * sx, box["y"] + y0 * sy, box["x"] + x1 * sx, box["y"] + y1 * sy)
    c = im.crop(tuple(int(round(v)) for v in px))
    return c.resize((c.width * zoom, c.height * zoom), Image.LANCZOS)


def sheet(rows, out, title):
    pad, th, lw = 12, 30, 260
    cw = max(r[1].width for r in rows)
    chh = max(r[1].height for r in rows)
    W = lw + cw * 2 + pad * 3
    H = 60 + len(rows) * (th + chh + pad) + pad
    canvas = Image.new("RGB", (W, H), (18, 22, 30))
    d = ImageDraw.Draw(canvas)
    d.text((pad, 14), title, font=TITLE, fill=(230, 236, 245))
    d.text((lw + pad, 40), "旧 (.bak3)", font=FONT, fill=(255, 180, 160))
    d.text((lw + pad * 2 + cw, 40), "新 (当前)", font=FONT, fill=(160, 255, 190))
    y = 66
    for label, img in rows:
        d.text((pad, y + chh // 2 - 12), label, font=FONT, fill=(150, 200, 255))
        canvas.paste(img, (lw + pad, y))
        y += chh + th + pad
    canvas.save(out, optimize=True)
    print("wrote", out.name, canvas.size)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 2300, "height": 2300}, device_scale_factor=1)
        for name in ("qwen", "dounai", "minimax"):
            im_new, box_new = await shot(pg, CUR[name], name)
            im_old, box_old = await shot(pg, OLD[name], name)
            win = WINDOWS[name]
            c_new = crop(im_new, box_new, win)
            c_old = crop(im_old, box_old, win)
            # 新旧并排
            W = c_old.width + c_new.width + 36
            H = max(c_old.height, c_new.height) + 40
            canvas = Image.new("RGB", (W, H), (18, 22, 30))
            d = ImageDraw.Draw(canvas)
            canvas.paste(c_old, (12, 34))
            canvas.paste(c_new, (24 + c_old.width, 34))
            d.text((12, 6), "旧 .bak3", font=FONT, fill=(255, 180, 160))
            d.text((24 + c_old.width, 6), "新 当前", font=FONT, fill=(160, 255, 190))
            canvas.save(OUT / f"{name}_AB_6x.png", optimize=True)
            print("wrote", f"{name}_AB_6x.png", canvas.size)
        await b.close()


asyncio.run(main())