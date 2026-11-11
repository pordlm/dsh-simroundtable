# 八席长桌合影（longtable，1400×920）
from playwright.sync_api import sync_playwright

NAMES = "GLM,Qwen,Kimi,Mimo,MiniMax,Dounai,Gemini,Claude"
URL = "http://127.0.0.1:8848/preview/longtable.html?n=8&names=" + NAMES + "&nogest=1&nolook=1&tpin=6000"
OUT = r"preview\_evidence\stage_eight_new.png"

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True,
                          args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(URL)
    try:
        pg.wait_for_function("window.__stageReady === true", timeout=120000)
    except Exception as exc:
        print("ready timeout:", exc)
    pg.wait_for_timeout(7000)
    pg.screenshot(path=OUT)
    print("errors:", errs[:4])
    b.close()
print("wrote", OUT)