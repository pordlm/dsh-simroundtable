import asyncio, io
from playwright.async_api import async_playwright
from PIL import Image

URL = "http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=0&nolook=0"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
              args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":800,"height":640}, device_scale_factor=2)
        await pg.goto(URL, wait_until="load")
        try:
            await pg.wait_for_function("window.__stageReady === true", timeout=45000)
        except Exception as e:
            print("ready timeout", e)
        await pg.wait_for_timeout(2600)
        buf = await pg.screenshot()
        img = Image.open(io.BytesIO(buf)).convert("RGB")
        img.save(r"preview/_diag/_t2_stage.png")
        print("full", img.size)
        xs = [94, 237, 380, 523, 666]
        names = ["grok", "claude", "gemini", "gpt", "deepseek"]
        for i, (x, n) in enumerate(zip(xs, names)):
            cx = x * 2
            img.crop((max(0, cx - 150), 150, cx + 150, 560)).resize((600, 820), Image.LANCZOS).save(f"preview/_diag/_t2_{n}.png")
        # side-by-side of grok + gemini heads
        g = Image.open(r"preview/_diag/_t2_grok.png")
        m = Image.open(r"preview/_diag/_t2_gemini.png")
        sheet = Image.new("RGB", (g.width + m.width, max(g.height, m.height)), (16, 21, 34))
        sheet.paste(g, (0, 0)); sheet.paste(m, (g.width, 0))
        sheet.save(r"preview/_diag/_t2_heads.png")
        print("sheet", sheet.size)
        await b.close()

asyncio.run(main())