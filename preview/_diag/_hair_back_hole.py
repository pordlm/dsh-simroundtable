"""Does the ponytail (ParamHairBack) open the slit, and is that slit the "black patch"?

The joint sweep showed the enclosed-background hole at Gemini peaks where the
head and torso turn the same way.  The cropped evidence frame
(`_evidence/gemini_joint_hole.png`) shows a narrow vertical slit -- exactly what
a dark panel background looks like through a gap between the ponytail and the
back, not black hair.

This isolates ParamHairBack (the only thing Gemini's physics drives) at a fixed
extreme head/torso pose, then repeats at a pose the stage can actually reach.

Run: python preview\\_diag\\_hair_back_hole.py
"""
import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LOG = "preview/_evidence/gemini_hair_back_hole.txt"


def log(message, **_ignored):
    print(message, flush=True)
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")


async def shot(pg, params):
    spec = ",".join(f"{k}:{v}" for k, v in params.items())
    u = (f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model={MODEL}&p={spec}")
    await pg.goto(u)
    await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(240)
    b64 = await pg.evaluate(
        "async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    im = Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[1]))).convert("RGBA")
    al = np.asarray(im)[..., 3]
    holes = ndimage.binary_fill_holes(al > 40) & (al < 40)
    labels, count = ndimage.label(holes)
    biggest = 0
    if count:
        sizes = ndimage.sum(holes, labels, range(1, count + 1))
        biggest = int(sizes.max())
    return im, holes, biggest


FIXED_HARD = {"ParamAngleX": -10, "ParamBodyAngleX": -5, "ParamHairFront": -0.236,
              "ParamAngleY": -5.5, "ParamBreath": 1.0}
FIXED_STAGE = {"ParamAngleX": -6, "ParamBodyAngleX": -2.3, "ParamHairFront": -0.118,
               "ParamAngleY": -3.0, "ParamBreath": 1.0}


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        for label, base in (("hard", FIXED_HARD), ("stage", FIXED_STAGE)):
            log(f"\n[{label}] base pose {base}")
            for hb in (-0.10, -0.05, 0.0, 0.05, 0.10):
                params = dict(base, ParamHairBack=hb)
                _im, _holes, big = await shot(pg, params)
                log(f"  ParamHairBack={hb:+.2f} -> biggestHole={big:5d} px")
        await b.close()


asyncio.run(main())