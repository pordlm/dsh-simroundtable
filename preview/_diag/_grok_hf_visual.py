"""Visual A/B of Grok's front-hair parameter vs head turn.

Renders the Grok rig in preview/probe.html with pinned parameters and writes a
side-by-side sheet:

  row 1: ParamHairFront -0.22 / 0 / +0.22   (head straight)
  row 2: ParamAngleX -7.5 / 0 / +7.5        (hair param 0)

so the deformation each channel produces can be compared by eye at 1:1 rig size.

Run: python preview\\_diag\\_grok_hf_visual.py
"""
import asyncio
import base64
import io

from PIL import Image
from playwright.async_api import async_playwright

MODEL = "../assets/build/grok-v1/grok.layout.model3.json"
BASE = ("http://127.0.0.1:8848/preview/probe.html?scale=0.6&model=" + MODEL)
OUT = "preview/_evidence/grok_hf_vs_angle.png"
CASES = [
    [("ParamHairFront", -0.22), ("ParamHairFront", 0.0), ("ParamHairFront", 0.22)],
    [("ParamAngleX", -7.5), ("ParamAngleX", 0.0), ("ParamAngleX", 7.5)],
]


async def shot(pg, pins):
    spec = ",".join(f"{k}:{v}" for k, v in [pins])
    await pg.goto(f"{BASE}&p={spec}")
    await pg.wait_for_function("() => !!window.__app", timeout=60000)
    await pg.wait_for_timeout(150)
    b64 = await pg.evaluate(
        "async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    im = Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[1]))).convert("RGBA")
    bbox = im.split()[3].getbbox()
    head = im.crop(bbox)
    return head.crop((0, 0, head.width, int(head.height * 0.34)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        rows = []
        for row in CASES:
            rows.append([await shot(pg, c) for c in row])
        w = max(c.width for r in rows for c in r)
        h = max(c.height for r in rows for c in r)
        sheet = Image.new("RGBA", (w * 3, h * 2), (18, 25, 39, 255))
        for j, r in enumerate(rows):
            for i, c in enumerate(r):
                sheet.paste(c, (i * w, j * h), c)
                c.save(f"preview/_evidence/grok_hf_case_{j}_{i}.png")
        sheet.convert("RGB").save(OUT)
        print("wrote", OUT, sheet.size)
        await b.close()

asyncio.run(main())