"""把用户报错截图放大看清：359x371 → 4x，裁线附近。

输入: C:\\Users\\pordl\\.dsh\\attachments\\v1\\objects\\9c\\9cf5a06e...png
产出: preview/_evidence/user_report_gemini_4x.png（整张 4x）
      preview/_evidence/user_report_gemini_line.png（线附近 8x）
"""
from pathlib import Path

from PIL import Image

SRC = Path(r"C:\Users\pordl\.dsh\attachments\v1\objects\9c\9cf5a06e83850bdbe7fbefda6530ddee9235b7fe3e435a6be017b28726018ad7")
EVID = Path(r"D:\dsh_simroundtable\preview\_evidence")


def main():
    im = Image.open(SRC).convert("RGBA")
    print("size", im.size)
    big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
    big.save(EVID / "user_report_gemini_4x.png")
    # 找最暗的竖线：统计每列在头部区域内的平均亮度
    w, h = im.size
    px = im.load()
    best = []
    for x in range(w):
        tot = 0
        n = 0
        for y in range(int(h * 0.30), int(h * 0.85)):
            r, g, b, a = px[x, y]
            tot += 0.299 * r + 0.587 * g + 0.114 * b
            n += 1
        best.append((tot / n, x))
    best.sort()
    print("darkest columns", best[:6])
    x0 = best[0][1]
    line = im.crop((max(0, x0 - 22), 0, min(w, x0 + 22), h)).resize((44 * 8, h * 8), Image.NEAREST)
    line.save(EVID / "user_report_gemini_line.png")
    print("wrote", EVID / "user_report_gemini_line.png", line.size)


if __name__ == "__main__":
    main()