"""Verify the Grok idle fix on the real stage harness (preview/stage-760.html).

Samples the Grok seat's core parameters from a `beforeModelUpdate` listener
registered *after* the stage's own acting hook, so the numbers are exactly what
the single core.update() of that frame consumes. Then reports the acceptance
numbers:

  - non-speaking seat ParamAngleY peak-to-peak over 20 s  (< 1.5 deg)
  - ParamHairFront vs ParamAngleX correlation            (same direction, > 0)
  - no hair sample sitting on the +/-0.22 clamp rail

Run: python preview\\_diag\\_grok_stage_verify.py
"""
import asyncio
import io
import json
import math

from PIL import Image
from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/stage-760.html?n=3&names=Grok,Claude,Gemini"
       "&active=1&nogest=1&seed=20261103")
OUT_PNG = "preview/_evidence/grok_head_fixed.png"

COLLECT = """
() => {
  const models = window.__models || [];
  const m = models.find((x) => x && x.__char && x.__char.key === 'grok');
  if (!m) return { error: 'no grok seat' };
  const im = m.internalModel;
  const core = im.coreModel;
  const read = (id) => { try { return Number(core.getParameterValueById(id)) || 0; } catch (e) { return 0; } };
  const rows = [];
  const state = { idleGroup: null, playing: null, motionStarts: 0 };
  const mm = im.motionManager;
  if (mm && mm.groups) state.idleGroup = mm.groups.idle === undefined ? 'undefined' : String(mm.groups.idle && mm.groups.idle.constructor && 'set');
  if (mm) {
    state.playing = typeof mm.isFinished === 'function' ? !mm.isFinished() : null;
    const orig = mm.startRandomMotion && mm.startRandomMotion.bind(mm);
    if (orig) mm.startRandomMotion = function (...args) { state.motionStarts += 1; return orig(...args); };
  }
  im.on('beforeModelUpdate', () => {
    rows.push({
      t: performance.now(),
      ax: read('ParamAngleX'),
      ay: read('ParamAngleY'),
      az: read('ParamAngleZ'),
      hf: read('ParamHairFront'),
      hb: read('ParamHairBack'),
      bz: read('ParamBodyAngleZ'),
    });
  });
  window.__verify = { rows, state, m };
  return { ok: true };
}
"""


def corr(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 900})
        await pg.goto(URL)
        await pg.wait_for_function(
            "() => window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=60000)
        await pg.wait_for_timeout(500)
        info = await pg.evaluate(COLLECT)
        print("collect:", info)
        # 20 s of frames; the stage runs at ~48 Hz in headless swiftshader.
        await pg.wait_for_timeout(20000)
        data = await pg.evaluate("() => ({ rows: window.__verify.rows, state: window.__verify.state })")
        rows = data["rows"]
        if len(rows) < 50:
            print("not enough samples:", len(rows))
        ax = [r["ax"] for r in rows]
        ay = [r["ay"] for r in rows]
        az = [r["az"] for r in rows]
        hf = [r["hf"] for r in rows]
        hb = [r["hb"] for r in rows]
        bz = [r["bz"] for r in rows]
        span = (rows[-1]["t"] - rows[0]["t"]) / 1000 if rows else 0
        print(f"frames={len(rows)} over {span:.1f}s -> {len(rows)/max(span,1e-9):.1f} hook calls/s")
        for name, vals in (("AngleX", ax), ("AngleY", ay), ("AngleZ", az),
                           ("HairFront", hf), ("HairBack", hb), ("BodyZ", bz)):
            print(f"  {name:9s} {min(vals):+7.3f} .. {max(vals):+7.3f}  p-p {max(vals)-min(vals):6.3f}")
        c_hf = corr(ax, hf)
        c_ay = corr(ax, ay)
        print(f"  corr(AngleX,HairFront)={c_hf if c_hf is None else round(c_hf,3)}"
              f"  corr(AngleX,AngleY)={c_ay if c_ay is None else round(c_ay,3)}")
        print("  motion:", json.dumps(data["state"]))
        rail = sum(1 for v in hf if abs(abs(v) - 0.22) < 1e-6)
        print(f"  hair samples on the clamp rail: {rail}/{len(hf)}")
        ay_pp = max(ay) - min(ay)
        ok_nod = ay_pp < 1.5
        ok_hair = (c_hf is not None and c_hf > 0.2)
        print(f"RESULT nod  (AngleY p-p {ay_pp:.3f} < 1.5): {'PASS' if ok_nod else 'FAIL'}")
        print(f"RESULT hair (corr(AngleX,HairFront) {c_hf} > 0.2): {'PASS' if ok_hair else 'FAIL'}")
        # Head crop for the eye check.
        bounds = await pg.evaluate(
            "() => { const m=window.__verify.m; const b=m.getBounds();"
            "return {x:b.x,y:b.y,w:b.width,h:b.height}; }")
        clip = {"x": max(0, bounds["x"] - 8), "y": max(0, bounds["y"]),
                "width": min(900, bounds["w"] + 16), "height": max(20, bounds["h"] * 0.42)}
        png = await pg.screenshot(clip=clip)
        Image.open(io.BytesIO(png)).save(OUT_PNG)
        print("wrote", OUT_PNG)
        await b.close()

asyncio.run(main())