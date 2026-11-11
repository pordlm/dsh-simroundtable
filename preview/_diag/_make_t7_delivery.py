from PIL import Image, ImageDraw, ImageFont
import numpy as np

def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)

def head_crop(path, cx, half=260, pad=12):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    bg = np.array([16, 21, 34])
    mask = np.abs(a - bg).sum(axis=2) > 30
    sub = mask[:, max(0, cx - half): cx + half]
    ys = np.where(sub.any(axis=1))[0]
    if len(ys) == 0:
        return im.crop((cx - half, 0, cx + half, im.height))
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + pad)
    x0, x1 = max(0, cx - half), min(im.width, cx + half)
    return im.crop((x0, y0, x1, y1))

STAGE = r"preview/_diag/_t7_stage.png"
NEW = r"preview/_diag/_t7_gem_head.png"
OLD = r"preview/_diag/_t4_gem_head.png"
OUT = r"preview/_evidence/t7_delivery.png"

full = Image.open(STAGE).convert("RGB")
stage = full.resize((900, int(full.height * 900 / full.width)), Image.LANCZOS)
scale = 900 / full.width
cx = int(380 * 3 * scale)

old = head_crop(OLD, int(380 * 3 * 0.0) + 1080)   # old file is already a 720-wide crop
new = head_crop(NEW, 1080)

def fit(im, h):
    return im.resize((int(im.width * h / im.height), h), Image.LANCZOS)

Hh = 560
old, new = fit(old, Hh), fit(new, Hh)

W = 960
pad = 24
H = 70 + stage.height + 40 + 40 + Hh + 70
sheet = Image.new("RGB", (W, H), (11, 15, 24))
d = ImageDraw.Draw(sheet)
f_t, f_s, f_b = font(30), font(17), font(20)

d.text((pad, 18), "Gemini 黑框终版（t7）· 圆桌舞台实测", font=f_t, fill=(232, 238, 246))
y = 70
sheet.paste(stage, ((W - stage.width) // 2, y))
y += stage.height + 6
d.text((pad, y), "真舞台 stage-760 五座（DPR3，tpin=7000 定格）", font=f_s, fill=(140, 158, 180))
y += 34

gap = 44
total = old.width + new.width + gap
x0 = (W - total) // 2
sheet.paste(old, (x0, y))
sheet.paste(new, (x0 + old.width + gap, y))
d.text((x0, y + Hh + 8), "t4：白亮带 + 硬边矩形平涂", font=f_b, fill=(248, 176, 176))
d.text((x0 + old.width + gap, y + Hh + 8), "t7：无光晕 / 无矩形 / 无黑线", font=f_b, fill=(160, 226, 182))

sheet.save(OUT)
print(OUT, sheet.size, old.size, new.size)