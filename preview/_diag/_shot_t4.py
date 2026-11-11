import asyncio, io
from playwright.async_api import async_playwright
from PIL import Image

URL = "http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1&tpin=7000"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
              args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":800,"height":640}, device_scale_factor=3)
        await pg.goto(URL, wait_until="load")
        try:
            await pg.wait_for_function("window.__stageReady === true", timeout=60000)
        except Exception as e:
            print("ready timeout", e)
        await pg.wait_for_timeout(3200)
        buf = await pg.screenshot()
        img = Image.open(io.BytesIO(buf)).convert("RGB")
        img.save(r"preview/_diag/_t4_stage.png")
        print("full", img.size)
        # 5 seats at 760 wide -> xs; screenshot is 3x
        xs = [94, 237, 380, 523, 666]
        cx = xs[2] * 3
        img.crop((max(0, cx - 150), 210, cx + 150, 690)).resize((720, 1152), Image.LANCZOS).save(r"preview/_diag/_t4_gem_head.png")
        await b.close()

asyncio.run(main())