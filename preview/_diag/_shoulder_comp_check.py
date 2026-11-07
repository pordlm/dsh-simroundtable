"""Validate the turn-dependent hair bias before wiring it into the stages.

The Gemini slit needs four things at once: head turn, torso turn, negative hair
front, breath.  With hf -0.118 at (AngleX -6, BodyAngleX -2.3) the hole is
2488 px; hf -0.059 already closes it to ~1284.  So bias the hair forward in
proportion to a negative turn:

    hf' = clamp(hairFront + 0.012 * max(0, -turn), -0.22, 0.22)

This checks that formula at -6 and -10 degrees and that a neutral pose keeps its
baseline hole.

Run: python preview\\_diag\\_shoulder_comp_check.py
"""
import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LOG = "preview/_evidence/shoulder_comp_check.txt"
K = 0.012
POSES = [
    ("turn -6 uncompensated", -6, -0.118),
    ("turn -6 compensated", -6, round(-0.118 + K * 6, 4)),
    ("turn -10 uncompensated", -10, -0.118),
    ("turn -10 compensated", -10, round(-0.118 + K * 10, 4)),
    ("neutral uncompensated", 0, -0.118),
    ("neutral compensated", 0, -0.118),
]


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
        for label, turn, hf in POSES:
            params = {"ParamAngleX": turn, "ParamBodyAngleX": -2.3,
                      "ParamHairFront": hf, "ParamAngleY": -3.0, "ParamBreath": 1.0}
            big = await biggest_hole(pg, params)
            log(f"{label:26s} turn={turn:+3d} hf={hf:+.3f} -> biggestHole={big:5d} px")
        await b.close()


asyncio.run(main())