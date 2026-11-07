"""Live proof that the hair channel never leaves the range the art tolerates.

Black-patch root cause (2026-11-06): ParamHairFront was driven to +-0.42, which
slides Gemini's side locks off the scalp and lets the dark stage show through
(probe: closed hole 912 px2 at hf=0 -> 6092 px2 at hf=1).  All three stages now
clamp the channel to +-0.22.

This reads the parameters straight out of the running stage (no image capture,
so it is cheap enough to sample hundreds of frames) and reports the envelope of
every channel that can move the hair: ParamHairFront, ParamAngleX/Y,
ParamBodyAngleZ and the physics output ParamHairBack.

Run: python preview\\_diag\\_param_envelope.py
"""
import asyncio, os, json
from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/stage-760.html"
       "?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1")
SAMPLES = int(os.environ.get("ENV_SAMPLES", "300"))
STEP_MS = int(os.environ.get("ENV_STEP_MS", "200"))

JS = """() => window.__models.map(x => {
  const cm = x.internalModel.coreModel;
  const g = id => { try { return cm.getParameterValueById(id); } catch (e) { return null; } };
  return { name: x.internalModel.settings.name,
           hf: g('ParamHairFront'), ax: g('ParamAngleX'), ay: g('ParamAngleY'),
           bz: g('ParamBodyAngleZ'), hb: g('ParamHairBack') };
})"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 800})
        await pg.goto(URL)
        await pg.wait_for_function("window.__ready===true", timeout=60000)
        await pg.wait_for_timeout(1500)
        acc = None
        for _ in range(SAMPLES):
            rows = await pg.evaluate(JS)
            if acc is None:
                acc = [{"name": r["name"], "hf": [], "ax": [], "ay": [], "bz": [], "hb": []} for r in rows]
            for a, r in zip(acc, rows):
                for k in ("hf", "ax", "ay", "bz", "hb"):
                    if r[k] is not None:
                        a[k].append(r[k])
            await pg.wait_for_timeout(STEP_MS)
        print(f"samples={SAMPLES} step={STEP_MS}ms")
        out = []
        for a in acc:
            s = {}
            for k in ("hf", "ax", "ay", "bz", "hb"):
                v = a[k]
                s[k] = [round(min(v), 3), round(max(v), 3)] if v else None
            out.append({"name": a["name"], **s})
            print(f"{a['name'][:28]:28s} hf={s['hf']} ax={s['ax']} ay={s['ay']} bz={s['bz']} hb={s['hb']}")
        print(json.dumps(out))
        await b.close()


asyncio.run(main())