# 用 t9 已对齐的 6× 嘴部渲染拼交付图：行=四种状态，列=旧(bak4) / 新
import json, os
from PIL import Image, ImageDraw, ImageFont

D = r"preview/_evidence/t9"
OUT = r"preview/_evidence/t10/dounai_AB_states.png"
STATES = [("idle", "闭嘴 (idle)"), ("open03", "MouthOpenY 0.3"),
          ("open05", "MouthOpenY 0.5"), ("open10", "MouthOpenY 1.0")]

def load(name):
    p = os.path.join(D, name)
    return Image.open(p).convert("RGB") if os.path.exists(p) else None

pairs = []
for key, label in STATES:
    old = load(f"old_{key}_6x_mouth.png")
    new = load(f"new_{key}_6x_mouth.png")
    pairs.append((label, old, new))

H = max(im.height for _, o, n in pairs for im in (o, n) if im)
Wc = max(im.width for _, o, n in pairs for im in (o, n) if im)
pairs = [(l, o.resize((Wc, H)) if o else None, n.resize((Wc, H)) if n else None) for l, o, n in pairs]

pad, top, label_h = 16, 64, 30
W = pad * 3 + Wc * 2
Ht = top + len(pairs) * (H + label_h + pad)
sheet = Image.new("RGB", (W, Ht), (11, 15, 24))
d = ImageDraw.Draw(sheet)
f_t = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 26)
f_l = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 19)
f_c = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 18)

d.text((pad, 16), "豆包嘴部 A/B（6× 对齐裁切）· 左=旧 bak4，右=t9 新件", font=f_t, fill=(232, 238, 246))
d.text((pad + Wc + pad, 40), "旧（线性 1−v，嘴线烘在脸上）", font=f_c, fill=(235, 170, 170))
d.text((pad, 40), "", font=f_c)
y = top
for label, old, new in pairs:
    d.text((pad, y), label, font=f_l, fill=(160, 176, 196))
    yy = y + label_h
    if old:
        sheet.paste(old, (pad, yy))
        d.text((pad + 6, yy + 6), "OLD", font=f_c, fill=(255, 200, 200))
    if new:
        sheet.paste(new, (pad * 2 + Wc, yy))
        d.text((pad * 2 + Wc + 6, yy + 6), "NEW", font=f_c, fill=(190, 245, 200))
    y = yy + H + pad

sheet.save(OUT)
print("wrote", OUT, sheet.size)
m = json.load(open(os.path.join(D, "measure_t9.json"), encoding="utf-8"))
print(json.dumps(m, ensure_ascii=False)[:1200])