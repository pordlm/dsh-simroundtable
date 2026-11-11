from PIL import Image, ImageDraw, ImageFont

STAGE = r"preview/_diag/_t2_stage.png"
HEADS = r"preview/_diag/_t2_heads.png"
OUT = r"preview/_evidence/t2_delivery.png"

font_path = r"C:\Windows\Fonts\msyh.ttc"
f_title = ImageFont.truetype(font_path, 34)
f_body = ImageFont.truetype(font_path, 24)

stage = Image.open(STAGE).convert("RGB")
stage = stage.resize((stage.width // 2, stage.height // 2), Image.LANCZOS)  # 800x640

heads = Image.open(HEADS).convert("RGB")
heads = heads.resize((720, int(heads.height * 720 / heads.width)), Image.LANCZOS)

W = 800
H = 60 + stage.height + 20 + 40 + heads.height + 20
sheet = Image.new("RGB", (W, H), (12, 16, 26))
d = ImageDraw.Draw(sheet)
d.text((24, 16), "圆桌舞台 · t2 修复后（Grok 不再点头 / 头发跟随头皮）", font=f_title, fill=(226, 232, 240))

stage_x = (W - stage.width) // 2
sheet.paste(stage, (stage_x, 60))

y = 60 + stage.height + 20
d.text((24, y), "左：Grok（本次修复）　右：Gemini（黑框修复中，见 t4 结果）", font=f_body, fill=(148, 163, 184))
sheet.paste(heads, ((W - heads.width) // 2, y + 40))

sheet.save(OUT)
print(OUT, sheet.size)