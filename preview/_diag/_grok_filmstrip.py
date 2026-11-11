"""Filmstrip of the Grok head on the stage harness, one crop every 2 s.

Writes preview/_evidence/grok_filmstrip_<tag>.png (rows of head crops) so the
idle motion can be judged by eye as well as by parameter ranges.

Run: python preview\\_diag\\_grok_filmstrip.py [tag] [extraQuery]
"""
import asyncio
import io
import sys

from PIL import Image
from playwright.async_api import async_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else "baseline"
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ""
URL = ("http://127.0.0.1:8848/preview/stage-760.html?n=3&names=Grok,Claude,Gemini&active=1&nogest=1"
       "&seed=20261103" + EXTRA)
OUT = f"preview/_evidence/grok_filmstrip_{TAG}.png"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 900})
        await pg.goto(URL)
        await pg.wait_for_function(
            "() => window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=60000)
        await pg.wait_for_timeout(800)
        bounds = await pg.evaluate(
            "() => { const m=(window.__models||[]).find(x=>x&&x.__char&&x.__char.key==='grok');"
            "const b=m.getBounds(); return {x:b.x,y:b.y,w:b.width,h:b.height}; }")
        clip = {"x": max(0, bounds["x"] - 6), "y": max(0, bounds["y"]),
                "width": min(900, bounds["w"] + 12), "height": max(20, bounds["h"] * 0.40)}
        crops = []
        for i in range(10):
            png = await pg.screenshot(clip=clip)
            crops.append(Image.open(io.BytesIO(png)).convert("RGB"))
            await pg.wait_for_timeout(2000)
        w, h = crops[0].size
        sheet = Image.new("RGB", (w, h * len(crops)), (18, 25, 39))
        for i, c in enumerate(crops):
            sheet.paste(c, (0, i * h))
        sheet.save(OUT)
        print("wrote", OUT, sheet.size)
        await b.close()

asyncio.run(main())