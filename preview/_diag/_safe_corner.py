"""Where is the safe corner once the hair bias is applied?

At -6 deg the 0.012*|turn| hair bias closes Gemini's slit (2488 -> 1278 px), but
at -10 deg it is still 2376 px, so something else (head turn alone) opens a
second gap.  Grid head turn x torso turn with the bias applied to find the range
the stage should stay inside.

Run: python preview\\_diag\\_safe_corner.py
"""
import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LOG = "preview/_evidence/safe_corner.txt"
K = 0.012
HAIR_MIN = -0.118


def log(message, **_ignored):
    print(message, flush=True)
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")


async def biggest_hole(pg, params):
    spec = ",".join(f"{k}:{v}" for k, v in params.items())
    u = f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model={MODEL}&p={spec}"
    await pg.goto(u)
    await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(240)
    b64 = await pg.evaluate(
        "async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    im = Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[1]))).convert("RGBA")
    al = np.asarray(im)[..., 3]
    holes = ndimage.binary_fill_holes(al > 40) & (al < 40)
    labels, count = ndimage.label(holes)
    if not count:
        return 0
    sizes = ndimage.sum(holes, labels, range(1, count + 1))
    return int(sizes.max())


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        xs = [-6, -8, -10]
        bodies = [-2.3, -1.2, 0.0]
        log("biggest hole px with hair bias applied (rows: BodyAngleX, cols: AngleX)")
        log("Body\\Ang " + "  ".join(f"{x:+6d}" for x in xs))
        for body in bodies:
            row = []
            for turn in xs:
                hf = round(max(HAIR_MIN, min(0.22, HAIR_MIN + K * max(0.0, -turn))), 4)
                big = await biggest_hole(pg, {"ParamAngleX": turn, "ParamBodyAngleX": body,
                                              "ParamHairFront": hf, "ParamAngleY": -3.0,
                                              "ParamBreath": 1.0})
                row.append(big)
            log(f"{body:+6.1f}  " + "  ".join(f"{v:6d}" for v in row))
        await b.close()


asyncio.run(main())