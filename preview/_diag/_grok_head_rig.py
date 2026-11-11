"""Grok front-hair rig geometry: does ParamHairFront translate the whole plate?

Loads the Grok rig once in preview/probe.html (single deterministic update, no
ticker) and measures, in core (model) units and stage px:

  * face centroid + head-anchor spread, front-hair centroid, back-hair centroid
  * front hair "root" (the end nearest the eye line) vs "tip" centroids

for two sweeps:
  A. ParamAngleX in {-7.5,-6,-3,0,+3,+6,+7.5} with ParamHairFront = 0
  B. ParamHairFront in {-0.22,-0.11,0,+0.11,+0.22} with ParamAngleX = 0

From those it derives px-per-degree (face vs hair) and px-per-unit-hf, which is
what the stage needs to keep the hair attached to the scalp while the head turns.

Run: python preview\\_diag\\_grok_head_rig.py
"""
import asyncio
import json

from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/probe.html?model=../assets/build/grok-v1/"
       "grok.layout.model3.json&scale=0.6")
STAGE_SCALE = 1.80  # lib/client.js STAGE_CHARACTERS.grok.scale

SETUP = r"""
() => {
  const m = window.__model;
  const cm = m.internalModel.coreModel;
  const ids = cm.getDrawableIds();
  window.__ids = ids;
  const idx = {};
  for (let i = 0; i < ids.length; i++) idx[ids[i]] = i;
  const centroid = (id, lo, hi) => {
    const i = idx[id];
    if (i === undefined) return null;
    const v = cm.getDrawableVertexPositions(i);
    const n = v.length / 2;
    let xs = [], ys = [];
    for (let k = 0; k < n; k++) { xs.push(v[k*2]); ys.push(v[k*2+1]); }
    const order = ys.map((y, k) => k).sort((a, b) => ys[a] - ys[b]);
    const take = (from, to) => {
      let sx = 0, sy = 0, c = 0;
      for (let k = from; k < to; k++) { const j = order[k]; sx += xs[j]; sy += ys[j]; c++; }
      return c ? [sx / c, sy / c] : null;
    };
    const all = take(0, n);
    const lowest = take(0, Math.max(1, Math.round(n * 0.18)));       // min y end
    const highest = take(n - Math.max(1, Math.round(n * 0.18)), n);  // max y end
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let k = 0; k < n; k++) {
      minx = Math.min(minx, xs[k]); maxx = Math.max(maxx, xs[k]);
      miny = Math.min(miny, ys[k]); maxy = Math.max(maxy, ys[k]);
    }
    return { n, all, lowest, highest, bbox: [minx, miny, maxx, maxy] };
  };
  const g = (id) => { try { return cm.getParameterValueById(id); } catch (e) { return null; } };
  window.__measure = (pins) => {
    for (const k of Object.keys(pins)) cm.setParameterValueById(k, pins[k]);
    m.update(16.6);
    window.__app.renderer.render(window.__app.stage);
    return {
      params: { ax: g('ParamAngleX'), ay: g('ParamAngleY'), hf: g('ParamHairFront'), hb: g('ParamHairBack') },
      face: centroid('ArtMeshFace'),
      hair: centroid('ArtMeshFrontHair'),
      backHair: centroid('ArtMeshBackHair'),
      head: centroid('ArtMeshHead'),
      eyeWhite: centroid('ArtMeshEyeWhite'),
    };
  };
  return ids;
}
"""


def sub(a, b):
    return [round(a[0] - b[0], 3), round(a[1] - b[1], 3)]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        await pg.goto(URL)
        await pg.wait_for_function("() => !!window.__model", timeout=60000)
        ids = await pg.evaluate(SETUP)
        print("drawables:", len(ids))
        print("hair/face/head ids present:",
              [i for i in ids if any(k.lower() in i.lower() for k in ("hair", "face", "head"))])

        base = await pg.evaluate("() => window.__measure({})")
        print("\nrest:", json.dumps(base, ensure_ascii=False))
        hb0 = base["hair"]["bbox"]

        rows = []
        for ax in (-7.5, -6, -3, 0, 3, 6, 7.5):
            r = await pg.evaluate("([ax]) => window.__measure({ParamAngleX:ax, ParamHairFront:0})", [ax])
            rows.append((ax, 0.0, r))
        print("\n== A. ParamAngleX sweep, hf=0 ==")
        f0 = rows[3][2]["face"]["all"]
        h0 = rows[3][2]["hair"]["all"]
        for ax, hf, r in rows:
            dface = sub(r["face"]["all"], f0)
            dhair = sub(r["hair"]["all"], h0)
            droot = sub(r["hair"]["highest"], rows[3][2]["hair"]["highest"])
            dtip = sub(r["hair"]["lowest"], rows[3][2]["hair"]["lowest"])
            dback = sub(r["backHair"]["all"], rows[3][2]["backHair"]["all"])
            print(f"ax={ax:+5.1f} face=({dface[0]:+7.2f},{dface[1]:+7.2f}) "
                  f"hair=({dhair[0]:+7.2f},{dhair[1]:+7.2f}) "
                  f"hairHi=({droot[0]:+7.2f},{droot[1]:+7.2f}) "
                  f"hairLo=({dtip[0]:+7.2f},{dtip[1]:+7.2f}) "
                  f"back=({dback[0]:+7.2f},{dback[1]:+7.2f})")

        print("\n== B. ParamHairFront sweep, ax=0 ==")
        brows = []
        for hf in (-0.22, -0.11, 0.0, 0.11, 0.22):
            r = await pg.evaluate("([hf]) => window.__measure({ParamAngleX:0, ParamHairFront:hf})", [hf])
            brows.append((hf, r))
        hb1 = brows[2][1]["hair"]["all"]
        for hf, r in brows:
            dhair = sub(r["hair"]["all"], hb1)
            droot = sub(r["hair"]["highest"], brows[2][1]["hair"]["highest"])
            dtip = sub(r["hair"]["lowest"], brows[2][1]["hair"]["lowest"])
            dface = sub(r["face"]["all"], brows[2][1]["face"]["all"])
            print(f"hf={hf:+5.2f} hair=({dhair[0]:+7.2f},{dhair[1]:+7.2f}) "
                  f"hairHi=({droot[0]:+7.2f},{droot[1]:+7.2f}) "
                  f"hairLo=({dtip[0]:+7.2f},{dtip[1]:+7.2f}) face=({dface[0]:+7.2f},{dface[1]:+7.2f})")

        # sensitivity px per degree / px per hf unit (core units, then stage px)
        d2 = rows[5][2]  # ax=+6
        d1 = rows[1][2]  # ax=-6
        fx = (d2["face"]["all"][0] - d1["face"]["all"][0]) / 12.0
        hx = (d2["hair"]["all"][0] - d1["hair"]["all"][0]) / 12.0
        hf2 = brows[4][1]["hair"]["all"][0]
        hf0x = brows[0][1]["hair"]["all"][0]
        per_hf = (hf2 - hf0x) / 0.44
        print(f"\nsensitivity core units: face {fx:+.2f}/deg, hair {hx:+.2f}/deg, hair {per_hf:+.1f}/hf-unit")
        print(f"sensitivity stage px:   face {fx*STAGE_SCALE:+.2f}px/deg, hair {hx*STAGE_SCALE:+.2f}px/deg, "
              f"hair {per_hf*STAGE_SCALE:+.1f}px/hf-unit")
        if abs(per_hf) > 1e-6:
            k = (fx - hx) / per_hf
            print(f"hf per degree that pins hair to the face: k = {k:+.4f}  (current stage comp -0.0185)")
            print(f"  -> at ax=+6 hf would be {k*6:+.3f}, at ax=-6 {k*-6:+.3f}")
        print("hair bbox rest:", hb0)
        await b.close()


asyncio.run(main())