from PIL import Image, ImageDraw, ImageFont

def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)

STAGE = r"preview/_diag/_t4_stage.png"
HEAD = r"preview/_diag/_t4_gem_head.png"
AB = r"preview/_evidence/t4/AB_stage_scale_stage_pose.png"
OUT = r"preview/_evidence/t4_delivery.png"

stage = Image.open(STAGE).convert("RGB")
stage = stage.resize((900, int(stage.height * 900 / stage.width)), Image.LANCZOS)

head = Image.open(HEAD).convert("RGB")
head = head.resize((420, int(head.height * 420 / head.width)), Image.LANCZOS)

ab = Image.open(AB).convert("RGB")
ab = ab.resize((900, int(ab.height * 900 / ab.width)), Image.LANCZOS)

W = 940
pad = 20
H = 66 + stage.height + 46 + head.height + 46 + ab.height + 30
sheet = Image.new("RGB", (W, H), (11, 15, 24))
d = ImageDraw.Draw(sheet)
f_t, f_b, f_s = font(30), font(21), font(17)

d.text((pad, 16), "Gemini 黑框修复（t4）· 圆桌舞台实测", font=f_t, fill=(230, 236, 245))
y = 66
sheet.paste(stage, ((W - stage.width) // 2, y))
y += stage.height + 10
d.text((pad, y), "真舞台 stage-760（五座，DPR3 截图缩至 900）", font=f_s, fill=(140, 158, 180))
y += 36

sheet.paste(head, ((W - head.width) // 2, y))
d.text((pad, y + 8), "Gemini 头部 6×（同一帧裁切）", font=f_s, fill=(140, 158, 180))
y += head.height + 46

d.text((pad, y), "修复前 / 修复后（t4 证据，舞台尺度 k=0.379，待机姿态）", font=f_b, fill=(170, 186, 205))
y += 34
sheet.paste(ab, ((W - ab.width) // 2, y))

sheet.save(OUT)
print(OUT, sheet.size)