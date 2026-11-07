"""Which parameter opens the slit at a pose the stage can reach?

_hair_back_hole.py proved ParamHairBack is irrelevant (5174 px whatever it is),
but at a pose inside the stage's own envelope (AngleX -6, BodyAngleX -2.3,
hair -0.118, AngleY -3, Breath 1) the hole is 2488 px -- big enough to read as a
dark sliver against the panel background.  This zeroes each contributor in turn
to find which one matters, and saves a crop of the worst frame.

Run: python preview\\_diag\\_hole_culprit.py
"""
import asyncio, io, base64
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LOG = "preview/_evidence/gemini_hole_culprit.txt"
STAGE_POSE = {"ParamAngleX": -6, "ParamBodyAngleX": -2.3, "ParamHairFront": -0.118,
              "ParamAngleY": -3.0, "ParamBreath": 1.0}


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
    if not count:
        return im, holes, 0
    sizes = ndimage.sum(holes, labels, range(1, count + 1))
    return im, holes, int(sizes.max())


def save_crop(im, holes, name):
    arr = np.asarray(im).astype(np.float32)
    bg = np.array([255, 0, 255], dtype=np.float32)
    comp = (arr[..., :3] * arr[..., 3:4] / 255 + bg * (255 - arr[..., 3:4]) / 255).astype(np.uint8)
    canvas = Image.fromarray(comp)
    labels, count = ndimage.label(holes)
    sizes = ndimage.sum(holes, labels, range(1, count + 1))
    label = int(np.argmax(sizes)) + 1
    ys, xs = np.where(labels == label)
    box = (max(0, int(xs.min()) - 14), max(0, int(ys.min()) - 14),
           min(canvas.width, int(xs.max()) + 14), min(canvas.height, int(ys.max()) + 14))
    ImageDraw.Draw(canvas).rectangle(box, outline=(0, 255, 0), width=3)
    crop = canvas.crop(box)
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    crop.save(name)
    log(f"  saved {name} ({crop.width}x{crop.height})")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        base_im = None
        log(f"baseline stage pose {STAGE_POSE}")
        im, holes, big = await shot(pg, STAGE_POSE)
        log(f"  all set -> biggestHole={big} px")
        save_crop(im, holes, "preview/_evidence/gemini_slit_stage_pose.png")
        for key in STAGE_POSE:
            params = dict(STAGE_POSE)
            params[key] = 0.0
            _im, _holes, zero_big = await shot(pg, params)
            log(f"  {key}=0 -> biggestHole={zero_big:5d} px")
        await b.close()


asyncio.run(main())