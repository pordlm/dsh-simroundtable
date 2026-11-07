"""How far can Gemini's head turn before the shoulder seam reopens?

The gesture sample pushed the summed head turn to -15.5 deg (BodyAngleX stays 0
on this stage - the rigs' breath module never drives it), and at that angle the
largest enclosed hole is 2411 px again, i.e. the slit is back.  The earlier
"safe corner" grid only went to -10 deg, so measure the real boundary: sweep the
head turn at a square torso, with the hair bias the stage applies, and find the
largest |turn| whose hole stays near the 1228 px pose baseline.

Run: python preview\\_diag\\_head_cap_curve.py
"""
import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LOG = "preview/_evidence/head_cap_curve.txt"
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
        log("biggest hole px, square torso, hair bias 0.012*|turn| applied")
        log("AngleX   hf      hole")
        for turn in [-8, -10, -12, -13, -14, -15, -16]:
            hf = round(max(HAIR_MIN, min(0.22, HAIR_MIN + K * max(0.0, -turn))), 4)
            big = await biggest_hole(pg, {"ParamAngleX": turn, "ParamBodyAngleX": 0.0,
                                          "ParamHairFront": hf, "ParamAngleY": -3.0,
                                          "ParamBreath": 1.0})
            log(f"{turn:+6d}  {hf:+.3f}  {big:6d}")
        # Without the bias, to see how much of the range the bias is buying.
        log("same grid, hair bias NOT applied (hf = stage minimum)")
        for turn in [-8, -10, -12, -14]:
            big = await biggest_hole(pg, {"ParamAngleX": turn, "ParamBodyAngleX": 0.0,
                                          "ParamHairFront": HAIR_MIN, "ParamAngleY": -3.0,
                                          "ParamBreath": 1.0})
            log(f"{turn:+6d}  {HAIR_MIN:+.3f}  {big:6d}")
        await b.close()


asyncio.run(main())