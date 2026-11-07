"""Can the stage actually open a hole? Sweep every parameter it writes.

The black-patch report (Gemini's hair "turning black / showing a black chunk")
has survived four否定 checks (NaN, hair clamp, atlas bleed, GPU backend).  What
was still unproven is the converse: that *no* value the stage can reach produces
an enclosed hole big enough to read as a black patch.

This script renders Gemini alone on a transparent canvas and, for each
parameter the stage writes, jumps to the extremes the stage can reach (measured
envelope, and 2x that as a safety margin) and counts enclosed transparent pixels
= document background visible through the silhouette.

Run: python preview\\_diag\\_param_hole_sweep.py
"""
import asyncio, io, base64
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"

# param -> values to try.  Envelopes come from _param_envelope.py (stage-760,
# 200 ms sampling): hair -0.118..+0.112, AngleX 0..3.48, body angles +-3.5,
# breath 0..1, eye ball +-0.18.  2x margins on top.
SWEEP = {
    "ParamHairFront": [-0.236, -0.118, 0.0, 0.112, 0.236],
    "ParamHairBack": [-0.10, 0.0, 0.10],
    "ParamAngleX": [-10, -6, 0, 6, 10],
    "ParamAngleY": [-5.5, 0, 5.5],
    "ParamAngleZ": [-5, 0, 5],
    "ParamBodyAngleX": [-5, 0, 5],
    "ParamBreath": [0.0, 0.5, 1.0],
}

# Everything at once, at both ends of its range: the stage can reach these
# together, so the silhouette has to survive the combination, not each alone.
BOTH = [
    {"ParamAngleX": -10, "ParamBodyAngleX": -5, "ParamHairFront": -0.236,
     "ParamHairBack": -0.10, "ParamBreath": 1.0, "ParamAngleY": -5.5},
    {"ParamAngleX": 10, "ParamBodyAngleX": 5, "ParamHairFront": 0.236,
     "ParamHairBack": 0.10, "ParamBreath": 1.0, "ParamAngleY": 5.5},
]


async def shot(pg, params):
    spec = ",".join(f"{k}:{v}" for k, v in params.items())
    u = (f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model={MODEL}"
         f"&p={spec}")
    await pg.goto(u)
    await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(260)
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
    return int(holes.sum()), int((al > 40).sum()), biggest


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        worst = (0, None)
        print(f"{'param':18s} {'value':>8s} {'holePx':>7s} {'bodyPx':>7s} {'biggest':>7s}  hole%")
        for param, values in SWEEP.items():
            for value in values:
                hole, body, big = await shot(pg, {param: value})
                pct = 100.0 * hole / max(1, body)
                flag = "  <-- " if big > 1500 else ""
                print(f"{param:18s} {value:8.3f} {hole:7d} {body:7d} {big:7d}  {pct:5.2f}%{flag}", flush=True)
                if big > worst[0]:
                    worst = (big, f"{param}={value}")
        for index, params in enumerate(BOTH):
            hole, body, big = await shot(pg, params)
            pct = 100.0 * hole / max(1, body)
            print(f"{'ALL-' + str(index):18s} {'':>8s} {hole:7d} {body:7d} {big:7d}  {pct:5.2f}%")
            if big > worst[0]:
                worst = (big, f"ALL-{index}")
        print(f"\nworst single hole: {worst[0]} px ({worst[1]})")
        print("threshold for 'reads as a black chunk': ~1500 px at this scale "
              "(a 40x40 block); the earlier hf=1.0 bug measured 6092.")
        await b.close()


asyncio.run(main())