"""Long audit of "background showing through the character" (the black patches).

The 2026-11-06 report was "Gemini: part of the hair turns black / hair shifts and
a black patch shows". The cause found back then was ParamHairFront being pushed
far past the art's tolerance (probe: closed hole 912 px² at hf=0 -> 6092 px² at
hf=1), so all three stages now clamp the hair channel to +-0.22.

This script proves the clamp actually holds on the live stage and that no
hole appears in the hair band: it samples the running 5-seat stage for ~90 s,
reads the params we care about and counts *enclosed* transparent pixels inside
the head band (top 42% of each model's bounds). Enclosed = background visible
through the silhouette, i.e. exactly what reads as a black patch on the dark
stage.

Run:  python preview\\_diag\\_hole_audit.py
Writes preview\\_evidence\\gemini_hole_worst.png (worst Gemini frame).
"""
import asyncio, io, base64, os
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/stage-760.html"
       "?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1")
SAMPLES = int(os.environ.get("HOLE_SAMPLES", "60"))
STEP_MS = int(os.environ.get("HOLE_STEP_MS", "200"))
HEAD_BAND = 0.42

JS = """async () => {
  const app = window.__app;
  const m = window.__models.map(x => {
    const cm = x.internalModel.coreModel;
    const g = id => { try { return cm.getParameterValueById(id); } catch (e) { return null; } };
    const r = x.getBounds();
    return { name: x.internalModel.settings.name,
             hf: g('ParamHairFront'), ax: g('ParamAngleX'), ay: g('ParamAngleY'),
             bz: g('ParamBodyAngleZ'), hb: g('ParamHairBack'),
             b: [r.x, r.y, r.width, r.height] };
  });
  return { m, url: await app.renderer.extract.base64(app.stage, 'image/png') };
}"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 800})
        await pg.goto(URL)
        await pg.wait_for_function("window.__ready===true", timeout=60000)
        await pg.wait_for_timeout(2000)

        n = 5
        hf = [[] for _ in range(n)]
        hole = [[] for _ in range(n)]      # head-band enclosed px
        hole_all = [[] for _ in range(n)]
        worst = [(-1, None, None) for _ in range(n)]   # (px, rgb bytes, seat index)

        for k in range(SAMPLES):
            d = await pg.evaluate(JS)
            im = Image.open(io.BytesIO(base64.b64decode(d["url"].split(",", 1)[1]))).convert("RGBA")
            al = np.asarray(im)[..., 3]
            fill = ndimage.binary_fill_holes(al > 40)
            holes = fill & (al < 40)
            for i, s in enumerate(d["m"][:n]):
                if s["hf"] is not None:
                    hf[i].append(s["hf"])
                x, y, w, h = s["b"]
                X0, Y0 = max(0, int(x)), max(0, int(y))
                X1, Y1 = min(al.shape[1], int(x + w)), min(al.shape[0], int(y + h))
                band = holes[Y0:Y1, X0:X1]
                total = int(band.sum())
                head = int(band[: max(1, int((Y1 - Y0) * HEAD_BAND))].sum())
                hole[i].append(head)
                hole_all[i].append(total)
                if head > worst[i][0]:
                    worst[i] = (head, im, i)
            await pg.wait_for_timeout(STEP_MS)

        os.makedirs("preview/_evidence", exist_ok=True)
        print(f"samples={SAMPLES} step={STEP_MS}ms")
        for i in range(n):
            v = hf[i]
            hh = hole[i]
            print(f"seat{i} hf=[{min(v):+.3f},{max(v):+.3f}] headHole max={max(hh)} "
                  f"med={int(np.median(hh))} allHoleMax={max(hole_all[i])}")

        # save the worst frame composited on the stage background
        worst_idx = int(np.argmax([w[0] for w in worst]))
        px, img, idx = worst[worst_idx]
        arr = np.asarray(img).astype(np.float32)
        bg = np.array([18, 25, 39], dtype=np.float32)
        comp = (arr[..., :3] * arr[..., 3:4] / 255 + bg * (255 - arr[..., 3:4]) / 255).astype(np.uint8)
        out = f"preview/_evidence/seat{idx}_hole_worst.png"
        Image.fromarray(comp).save(out)
        print(f"worst seat{idx} headHole={px}px -> {out}")
        await b.close()


asyncio.run(main())