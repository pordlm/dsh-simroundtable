# 权威 A/B：用当前 build 与 t11 备份，各渲染一次 1:1，裁颚区拼图（带缓存破坏）
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
import io, random, time

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview/_evidence/t13"
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 26)

MODELS = {
    "旧 t11-backup": "gemini-v1.t11-backup/gemini.layout.model3.json",
    "新 当前 build": "gemini-v1/gemini.layout.model3.json",
}
BASE = "http://127.0.0.1:8848/preview/probe.html?raw=1&scale=1.0&bg=%2314121a&model=../assets/build/"

shots = {}
with sync_playwright() as p:
    for tag, rel in MODELS.items():
        profile = ROOT / ".edge-tmp" / f"t13_{int(time.time())}"
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(profile), channel="msedge", headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-application-cache"])
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        url = BASE + rel.replace("/", "%2F") + f"&cb={random.random()}"
        pg.set_viewport_size({"width": 2100, "height": 2100})
        pg.goto(url, wait_until="load")
        pg.wait_for_timeout(4000)
        buf = pg.screenshot()
        shots[tag] = Image.open(io.BytesIO(buf)).convert("RGB")
        ctx.close()
        print("rendered", tag, shots[tag].size)

BOX = (800, 470, 1260, 880)  # 颚区（2048 画布坐标）
tiles = [(t, im.crop(BOX)) for t, im in shots.items()]
w, h = tiles[0][1].size
K = 2
canvas = Image.new("RGB", (w * K * len(tiles) + 20 * (len(tiles) + 1), h * K + 60), (18, 22, 30))
d = ImageDraw.Draw(canvas)
for i, (tag, im) in enumerate(tiles):
    im = im.resize((w * K, h * K), Image.LANCZOS)
    x = 20 + i * (w * K + 20)
    canvas.paste(im, (x, 50))
    d.text((x, 12), tag, font=FONT, fill=(230, 236, 245))
canvas.save(OUT / "authoritative_jaw_AB_2x.png", optimize=True)
print("wrote", (OUT / "authoritative_jaw_AB_2x.png"), canvas.size)