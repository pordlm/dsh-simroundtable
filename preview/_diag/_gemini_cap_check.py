"""Does the real stage stay out of Gemini's bad corner now?

Samples the live stage (five seats, 60 s) for Gemini's parameters, then replays
the worst sample through the probe and measures the enclosed hole.  Expected:
AngleX never goes past +-8 (the cap) and the worst reachable hole stays near the
pose baseline (~1228 px), instead of the 2488 px slit measured before the fix.

Run: python preview\\_diag\\_gemini_cap_check.py
"""
import asyncio, io, base64, json
from PIL import Image
import numpy as np
from scipy import ndimage
from playwright.async_api import async_playwright

LOG = "preview/_evidence/gemini_cap_check.txt"
STAGE = ("http://127.0.0.1:8848/preview/stage-760.html"
         "?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1")
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"


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
        await pg.goto(STAGE)
        await pg.wait_for_function("() => window.__ready === true", timeout=60000)
        samples = await pg.evaluate("""async () => {
          const out = [];
          for (let i = 0; i < 240; i += 1) {
            const seat = window.__models[2];
            if (seat) {
              const core = seat.internalModel.coreModel;
              out.push([core.getParameterValueById('ParamAngleX'),
                        core.getParameterValueById('ParamBodyAngleX'),
                        core.getParameterValueById('ParamHairFront'),
                        core.getParameterValueById('ParamAngleY'),
                        core.getParameterValueById('ParamBreath')]);
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          return out;
        }""")
        xs = [s[0] for s in samples]
        bs = [s[1] for s in samples]
        hs = [s[2] for s in samples]
        log(f"samples={len(samples)} over {len(samples) * 0.25:.0f}s")
        log(f"AngleX    {min(xs):+.2f}..{max(xs):+.2f}  (cap should hold at +-8)")
        log(f"BodyAngleX {min(bs):+.2f}..{max(bs):+.2f}")
        log(f"HairFront  {min(hs):+.3f}..{max(hs):+.3f}")
        over = [x for x in xs if abs(x) > 8.001]
        log(f"samples past the cap: {len(over)}")
        worst = min(samples, key=lambda s: s[0])
        log(f"most negative AngleX sample: {['%.3f' % v for v in worst]}")
        params = {"ParamAngleX": round(worst[0], 3), "ParamBodyAngleX": round(worst[1], 3),
                  "ParamHairFront": round(worst[2], 3), "ParamAngleY": round(worst[3], 3),
                  "ParamBreath": round(worst[4], 3)}
        hole = await biggest_hole(pg, params)
        log(f"hole at that sample: {hole} px (baseline 1228, pre-fix slit 2488)")
        await b.close()


asyncio.run(main())