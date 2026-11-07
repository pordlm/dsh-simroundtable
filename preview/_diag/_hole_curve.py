"""Hole-vs-ParamHairFront curve for Gemini: how far the hair channel can go.

The 2026-11-06 black patch was ParamHairFront sliding the side locks off the
scalp so the dark stage showed through.  The stages clamp the channel to
+-0.22; the live envelope audit (`_param_envelope.py`) measures Gemini's actual
range as [-0.118, +0.112].

This script renders the model alone (probe.html, transparent canvas) and counts
*enclosed* transparent pixels = background visible through the silhouette, for
hair values from 0 to the old buggy magnitude, at three head angles.  It proves
the clamp sits well inside the safe part of the curve.

Run: python preview\\_diag\\_hole_curve.py
Writes preview\\_evidence\\gemini_hair_hole_curve.png
"""
import asyncio, io, base64, os
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
HFS = [0.0, 0.11, 0.152, 0.22, 0.35, 0.5, 1.0]
ANGLES = [0, 6, -6]


async def shot(pg, hf, ang):
    u = (f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model={MODEL}"
         f"&p=ParamHairFront:{hf},ParamAngleX:{ang}")
    await pg.goto(u)
    await pg.wait_for_function("() => !!window.__app", timeout=45000)
    await pg.wait_for_timeout(320)
    b64 = await pg.evaluate(
        "async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    im = Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[1]))).convert("RGBA")
    al = np.asarray(im)[..., 3]
    fill = ndimage.binary_fill_holes(al > 40)
    holes = fill & (al < 40)
    return im, int(holes.sum()), int((al > 40).sum())


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        rows = {}
        keep = {}
        for ang in ANGLES:
            for hf in HFS:
                im, hole, body = await shot(pg, hf, ang)
                rows[(ang, hf)] = (hole, body)
                if ang == 0 and hf in (0.0, 0.22, 1.0):
                    keep[hf] = im
                print(f"ang={ang:+3d} hf={hf:+.3f} holePx={hole:6d} bodyPx={body:6d} "
                      f"hole%={100.0*hole/max(1,body):.2f}", flush=True)
        print("\nsweep table (hole px):")
        print("hf      " + "  ".join(f"ang{a:+d}".rjust(8) for a in ANGLES))
        for hf in HFS:
            print(f"{hf:+.3f}  " + "  ".join(f"{rows[(a,hf)][0]:8d}" for a in ANGLES))

        # evidence strip: hf 0 / 0.22 (clamped max) / 1.0 (old bug), on magenta
        if keep:
            tiles = []
            for hf in (0.0, 0.22, 1.0):
                im = keep[hf]
                arr = np.asarray(im).astype(np.float32)
                bg = np.array([255, 0, 255], dtype=np.float32)
                comp = (arr[..., :3] * arr[..., 3:4] / 255
                        + bg * (255 - arr[..., 3:4]) / 255).astype(np.uint8)
                crop = Image.fromarray(comp)
                bb = crop.convert("L").point(lambda v: 0 if v < 200 else 255).getbbox()
                if bb:
                    crop = crop.crop(bb)
                tiles.append(crop.resize((crop.width // 2, crop.height // 2), Image.LANCZOS))
            w = sum(t.width for t in tiles) + 24 * (len(tiles) - 1)
            h = max(t.height for t in tiles)
            strip = Image.new("RGB", (w, h), (20, 20, 24))
            x = 0
            for t in tiles:
                strip.paste(t, (x, h - t.height))
                x += t.width + 24
            os.makedirs("preview/_evidence", exist_ok=True)
            out = "preview/_evidence/gemini_hair_hole_curve.png"
            strip.save(out)
            print(f"\nstrip -> {out} ({strip.width}x{strip.height})")
        await b.close()


asyncio.run(main())