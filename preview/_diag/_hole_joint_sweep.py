"""Where does the head+torso combination open a hole, and can the stage get there?

`_param_hole_sweep.py` found that one parameter at a time barely moves the
enclosed-background count, but head turn *together with* torso turn took the
biggest hole from 1262 px (pose baseline) to 5174 px.  That is the first
positive lead for the "Gemini shows a black chunk" report, so:

  1. sweep AngleX x BodyAngleX and print the biggest hole for each pair;
  2. save the worst frame with the hole outlined (magenta background);
  3. sample the real stage for 60 s and report the extreme (AngleX,
     BodyAngleX) pair it actually reached, so we know whether the stage can
     walk into the bad corner by itself.

Run: python preview\\_diag\\_hole_joint_sweep.py
"""
import asyncio, io, base64
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
LOG = "preview/_evidence/gemini_joint_hole.txt"


def log(message, **_ignored):
    print(message, flush=True)
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")
XS = [-10, -6, -3, 0, 3, 6, 10]
BS = [-5, -2.3, 0, 2.3, 5]


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


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        table = {}
        worst = (0, None, None)
        for bx in BS:
            for ax in XS:
                im, holes, big = await shot(pg, {"ParamAngleX": ax, "ParamBodyAngleX": bx})
                table[(ax, bx)] = big
                log(f"AngleX={ax:+3d} BodyAngleX={bx:+.1f} biggestHole={big:6d}", flush=True)
                if big > worst[0]:
                    worst = (big, ax, bx)
        log("\nbiggest hole px table (rows: BodyAngleX, cols: AngleX)")
        log("Body\\Ang " + "  ".join(f"{a:+6d}" for a in XS))
        for bx in BS:
            log(f"{bx:+6.1f}  " + "  ".join(f"{table[(a, bx)]:6d}" for a in XS))

        big, ax, bx = worst
        im, holes, _ = await shot(pg, {"ParamAngleX": ax, "ParamBodyAngleX": bx})
        arr = np.asarray(im).astype(np.float32)
        bg = np.array([255, 0, 255], dtype=np.float32)
        comp = (arr[..., :3] * arr[..., 3:4] / 255 + bg * (255 - arr[..., 3:4]) / 255).astype(np.uint8)
        canvas = Image.fromarray(comp)
        draw = ImageDraw.Draw(canvas)
        labels, count = ndimage.label(holes)
        sizes = ndimage.sum(holes, labels, range(1, count + 1))
        biggest_label = int(np.argmax(sizes)) + 1
        ys, xs_ = np.where(labels == biggest_label)
        box = (int(xs_.min()) - 12, int(ys.min()) - 12, int(xs_.max()) + 12, int(ys.max()) + 12)
        draw.rectangle(box, outline=(0, 255, 0), width=3)
        crop = canvas.crop(tuple(max(0, v) for v in box))
        crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
        out = "preview/_evidence/gemini_joint_hole.png"
        crop.save(out)
        log(f"\nworst {big} px at AngleX={ax:+d} BodyAngleX={bx:+.1f} -> {out} ({crop.width}x{crop.height})")

        # What corner does the real stage actually reach?
        await pg.goto("http://127.0.0.1:8848/preview/stage-760.html"
                      "?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek")
        await pg.wait_for_function("() => window.__seats && window.__seats.length", timeout=60000)
        pairs = await pg.evaluate("""async () => {
          const out = [];
          const seen = [];
          for (let i = 0; i < 240; i += 1) {
            const seat = window.__seats[2];
            if (seat) {
              const core = seat.internalModel.coreModel;
              seen.push([core.getParameterValueById('ParamAngleX'),
                         core.getParameterValueById('ParamBodyAngleX')]);
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          return seen;
        }""")
        xs_vals = [v[0] for v in pairs]
        bs_vals = [v[1] for v in pairs]
        log(f"\nstage (Gemini seat, 60 s): AngleX {min(xs_vals):+.2f}..{max(xs_vals):+.2f}, "
              f"BodyAngleX {min(bs_vals):+.2f}..{max(bs_vals):+.2f}")
        exhaust = sorted(pairs, key=lambda v: abs(v[0]) + 6 * abs(v[1]))[-3:]
        log("most extreme (AngleX, BodyAngleX) reached:",
              ", ".join(f"({a:+.2f}, {b:+.2f})" for a, b in exhaust))
        await b.close()


asyncio.run(main())