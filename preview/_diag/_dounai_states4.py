# 豆包 MouthOpenY 四态渲染 + 按嘴部内容自动裁切（不依赖 bounds 居中）
import io, sys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

MODEL = "../assets/build/dounai-v1/dounai.layout.model3.json"
STATES = [("0", 0.0), ("0.3", 0.3), ("0.5", 0.5), ("1.0", 1.0)]
OUT = r"preview/_evidence/t10/dounai_states_4.png"
raw_dir = r"preview/_evidence/t10"

def mouth_bbox(img):
    px = img.convert("RGB").load()
    w, h = img.size
    xs, ys = [], []
    for y in range(150, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if r > 90 and g < 120 and (b < 120) and (r - g) > 80:
                xs.append(x); ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)

tiles = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True,
                          args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for label, v in STATES:
        pg = b.new_page(viewport={"width": 700, "height": 700}, device_scale_factor=2)
        url = ("http://127.0.0.1:8848/preview/probe.html?model=" + MODEL +
               "&scale=1.0&raw=1&p=ParamMouthOpenY:" + str(v))
        pg.goto(url)
        pg.wait_for_timeout(3500)
        buf = pg.screenshot()
        img = Image.open(io.BytesIO(buf)).convert("RGB")
        bb = mouth_bbox(img)
        print(label, "mouth bbox(2x):", bb)
        if bb:
            x0, y0, x1, y1 = bb
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            half_x, half_y = 110, 85
            box = (int(cx - half_x), int(cy - half_y), int(cx + half_x), int(cy + half_y))
            crop = img.crop(box).resize((440, 340), Image.LANCZOS)
        else:
            crop = img.resize((440, 340), Image.LANCZOS)
        tiles.append((label, crop))
        pg.close()
    b.close()

f = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 22)
title = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 26)
W = 440 * len(tiles) + 20 * (len(tiles) + 1)
H = 340 + 90
sheet = Image.new("RGB", (W, H), (12, 16, 26))
d = ImageDraw.Draw(sheet)
d.text((20, 12), "豆包 张口四态（当前 build，1:1 渲染 ×2dpr，按嘴部自动裁切）", font=title, fill=(232, 238, 246))
x = 20
for label, crop in tiles:
    sheet.paste(crop, (x, 66))
    d.text((x, 66 + 340 + 4), "MouthOpenY = " + label, font=f, fill=(170, 186, 205))
    x += 440 + 20
sheet.save(OUT)
print("wrote", OUT, sheet.size)

