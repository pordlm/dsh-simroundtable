# 给 gpt-6.1-sol 做视觉审核用的分类拼图：
# 01 头部 6x / 02 座位 1x / 03 洞与缝 6x / 04 Gemini 颚线 A/B
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"D:\dsh_simroundtable\preview\_evidence")
OUT = ROOT / "visual_review"
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 22)
TITLE = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 30)


def sheet(items, out, height=320, cols=5, title=""):
    tiles = []
    for label, path in items:
        p = Path(path)
        if not p.exists():
            print("MISS", p)
            continue
        im = Image.open(p).convert("RGB")
        k = height / im.height
        im = im.resize((max(1, int(im.width * k)), height), Image.LANCZOS)
        tiles.append((label, im))
    if not tiles:
        return None
    pad, label_h = 10, 30
    rows = (len(tiles) + cols - 1) // cols
    cw = max(t[1].width for t in tiles)
    W = cols * (cw + pad) + pad
    H = (label_h + height + pad) * rows + (60 if title else pad)
    canvas = Image.new("RGB", (W, H), (18, 22, 30))
    d = ImageDraw.Draw(canvas)
    y0 = 0
    if title:
        d.text((pad, 12), title, font=TITLE, fill=(230, 236, 245))
        y0 = 58
    for i, (label, im) in enumerate(tiles):
        r, c = divmod(i, cols)
        x = pad + c * (cw + pad)
        y = y0 + r * (label_h + height + pad)
        canvas.paste(im, (x + (cw - im.width) // 2, y + label_h))
        d.text((x, y + 4), label, font=FONT, fill=(150, 200, 255))
    canvas.save(out, optimize=True)
    print("wrote", out.name, canvas.size)
    return out


heads = [("GLM", ROOT / "final2/longtable_head6x_GLM.png"),
         ("Qwen", ROOT / "final2/longtable_head6x_Qwen.png"),
         ("Kimi", ROOT / "final2/longtable_head6x_Kimi.png"),
         ("MiMo", ROOT / "final2/longtable_head6x_MiMo.png"),
         ("MiniMax", ROOT / "final2/longtable_head6x_MiniMax.png"),
         ("Gemini", ROOT / "final2/longtable_head6x_Gemini.png"),
         ("GPT", ROOT / "final2/longtable_head6x_GPT.png"),
         ("Claude", ROOT / "final2/longtable_head6x_Claude.png"),
         ("Dounai 豆包", ROOT / "final2/stage760_dounai_seat6x.png")]

seats = [("GLM", ROOT / "final2/longtable_seat_1_GLM.png"),
         ("Qwen", ROOT / "final2/longtable_seat_2_Qwen.png"),
         ("Kimi", ROOT / "final2/longtable_seat_3_Kimi.png"),
         ("MiMo", ROOT / "final2/longtable_seat_4_MiMo.png"),
         ("MiniMax", ROOT / "final2/longtable_seat_5_MiniMax.png"),
         ("Gemini", ROOT / "final2/longtable_seat_6_Gemini.png"),
         ("GPT", ROOT / "final2/longtable_seat_7_GPT.png"),
         ("Claude", ROOT / "final2/longtable_seat_8_Claude.png"),
         ("Dounai 豆包", ROOT / "final2/stage760_dounai_dpr2.png")]

holes = [("GLM 6x", ROOT / "audit/glm_zoom6x.png"),
         ("Qwen 6x", ROOT / "audit/qwen_zoom6x.png"),
         ("Kimi 6x", ROOT / "audit/kimi_zoom6x.png"),
         ("MiMo 6x", ROOT / "audit/mimo_zoom6x.png"),
         ("MiniMax 6x", ROOT / "audit/minimax_zoom6x.png"),
         ("豆包 6x", ROOT / "audit/dounai_zoom6x.png"),
         ("MiMo 摆头洞", ROOT / "final2/mimo_stage_pose_hole6x.png"),
         ("MiMo-prop 摆头洞", ROOT / "final2/mimo-prop_stage_pose_hole6x.png")]

jaws = [("Gemini 右颚 旧/新", ROOT / "final2/gemini_jaw_right_AB_6x.png"),
        ("Gemini 左颚 旧/新", ROOT / "final2/gemini_jaw_left_AB_6x.png"),
        ("Gemini 右颚 差分", ROOT / "final2/gemini_jaw_right_diff6x.png"),
        ("Gemini 右颚 新", ROOT / "final2/gemini_jaw_right_cur_6x.png")]

sheet(heads, OUT / "01_heads_6x.png", height=340, cols=5, title="A 头部 6× 放大（看发际线/颚线/眼周是否有黑框、黑缝、错位）")
sheet(seats, OUT / "02_seats_1x.png", height=420, cols=5, title="B 座位全景 1×（看整体轮廓是否有黑边、缺口、件缺失）")
sheet(holes, OUT / "03_holes_6x.png", height=360, cols=4, title="C 洞与缝 6×（前 6 张=各角色最大封闭洞放大；后 2 张=MiMo 摆头洞）")
sheet(jaws, OUT / "04_gemini_jaw_AB.png", height=380, cols=2, title="D Gemini 颚线 6×（左旧右新 / 差分）")