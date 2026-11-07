"""How much hair-front compensation closes the slit, for each character?

The slit at Gemini's stage-reachable pose sits between the front-hair mass and
the shoulder (see _evidence/gemini_slit_stage_pose.png): hair follows the head
while the torso turns the other way, so the two silhouettes stop overlapping and
the panel background shows through.  Zeroing ParamHairFront already closed it
(2488 -> 1274 px), so a turn-dependent forward bias on the hair is the cheap fix
-- same shape as the Grok fix (hf - 0.0185*turn).

This sweeps hf at each character's worst reachable pose to size that bias.

Run: python preview\\_diag\\_hf_comp_curve.py
"""
import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

LOG = "preview/_evidence/hf_comp_curve.txt"
CASES = [
    ("gemini", "../assets/build/gemini-v1/gemini.layout.model3.json",
     {"ParamAngleX": -6, "ParamBodyAngleX": -2.3, "ParamAngleY": -3.0, "ParamBreath": 1.0}, -0.118),
    ("grok", "../assets/build/grok-v1/grok.layout.model3.json",
     {"ParamAngleX": -6, "ParamBodyAngleX": -2.3, "ParamAngleY": -3.0, "ParamBreath": 1.0}, -0.146),
    ("claude", "../assets/build/claude-v1/claude.layout.model3.json",
     {"ParamAngleX": -6, "ParamBodyAngleX": -2.3, "ParamAngleY": -3.0, "ParamBreath": 1.0}, -0.110),
]


def log(message, **_ignored):
    print(message, flush=True)
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")


async def biggest_hole(pg, model, params):
    spec = ",".join(f"{k}:{v}" for k, v in params.items())
    u = f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model={model}&p={spec}"
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
        for name, model, base, hf_min in CASES:
            log(f"\n[{name}] base {base}, hf_min {hf_min}")
            for hf in (hf_min, hf_min * 0.75, hf_min * 0.5, hf_min * 0.25, 0.0):
                _ = await biggest_hole(pg, model, dict(base, ParamHairFront=round(hf, 4)))
                log(f"  hf={hf:+.3f} -> biggestHole={_:5d} px")
        await b.close()


asyncio.run(main())