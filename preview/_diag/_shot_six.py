import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(r"D:\dsh_simroundtable\preview\_evidence")
URL = ("http://127.0.0.1:8848/preview/stage-760.html"
       "?n=6&names=Qwen,Dounai,MiniMax,Gemini,Claude,GPT&nogest=1&nogest=1&tpin=9000")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1560, "height": 1240}, device_scale_factor=2)
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_timeout(3500)
        await pg.screenshot(path=str(OUT / "stage_six_face_fix.png"))
        print("wrote", (OUT / "stage_six_face_fix.png"))
        await b.close()


asyncio.run(main())