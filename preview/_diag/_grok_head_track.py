"""Tracked-vertex geometry for Grok's front hair (core units = 1/2048 canvas px).

Loads the rig in preview/probe.html, then for each sweep value drives
`internalModel.update()` with breath / physics / blink disabled, so the pose is
exactly the parameter we pinned.  Reads the deformed vertex buffer through
`coreModel.getDrawableVertexPositions`.

Tracked points (core units; face silhouette is ~0.21 wide, i.e. ~428 px):
  root   : front-hair vertex with max y (top of the scalp mass)
  hL/hR  : front-hair extremes left / right (outer ends of the side locks)
  bot    : front-hair vertex with min y (lowest tip)
  eyeL/R : centroid of ArtMeshEyewhiteL / R (face anchor that must follow the head)
  fL     : face silhouette left extreme

Run: python preview\\_diag\\_grok_head_track.py
"""
import asyncio

from playwright.async_api import async_playwright

URL = ("http://127.0.0.1:8848/preview/probe.html?model=../assets/build/grok-v1/"
       "grok.layout.model3.json&scale=0.6")

SETUP = r"""
() => {
  const m = window.__model, im = m.internalModel, cm = im.coreModel;
  im.breath = undefined; im.physics = undefined; im.eyeBlink = undefined;
  const ids = cm.getDrawableIds();
  const idx = {}; ids.forEach((s, i) => { idx[s] = i; });
  const read = (id) => {
    const v = cm.getDrawableVertexPositions(idx[id]);
    const pts = [];
    for (let k = 0; k < v.length; k += 2) pts.push([v[k], v[k + 1]]);
    return pts;
  };
  const cen = (id) => {
    const pts = read(id); let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  };
  window.__track = () => {
    const hair = read('ArtMeshFrontHair'), face = read('ArtMeshFace');
    let root = hair[0], L = hair[0], R = hair[0], bot = hair[0];
    for (const p of hair) {
      if (p[1] > root[1]) root = p;
      if (p[1] < bot[1]) bot = p;
      if (p[0] < L[0]) L = p;
      if (p[0] > R[0]) R = p;
    }
    let fL = face[0];
    for (const p of face) if (p[0] < fL[0]) fL = p;
    return {root, hL: L, hR: R, bot, eyeL: cen('ArtMeshEyewhiteL'),
            eyeR: cen('ArtMeshEyewhiteR'), fL, hairC: cen('ArtMeshFrontHair'),
            faceC: cen('ArtMeshFace')};
  };
  window.__set = (pins) => {
    for (const k of Object.keys(pins)) cm.setParameterValueById(k, pins[k]);
    im.update(16.6, performance.now());
    return window.__track();
  };
  return true;
}
"""

FIELDS = ("root", "hL", "hR", "bot", "eyeL", "eyeR", "fL", "hairC", "faceC")
SHORT = {"root": "root", "hL": "hL", "hR": "hR", "bot": "bot",
         "eyeL": "eyeL", "eyeR": "eyeR", "fL": "fL", "fC": "faceC"}


def diff(cur, base):
    return {f: (cur[f][0] - base[f][0], cur[f][1] - base[f][1]) for f in FIELDS}


def fmt(d):
    return "  ".join(f"{SHORT[f]}=({d[f][0]*1000:+6.2f},{d[f][1]*1000:+6.2f})"
                     for f in ("root", "hL", "hR", "bot", "eyeL", "fL"))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 1400})
        await pg.goto(URL)
        await pg.wait_for_function("() => !!window.__model", timeout=60000)
        await pg.evaluate(SETUP)
        base = await pg.evaluate("() => window.__set({ParamAngleX:0, ParamHairFront:0})")

        print("== A. ParamAngleX sweep, hf=0 (deltas x1000 core units) ==")
        res_a = {}
        for ax in (-7.5, -6, -3, 0, 3, 6, 7.5):
            cur = await pg.evaluate("([ax]) => window.__set({ParamAngleX:ax, ParamHairFront:0})", [ax])
            res_a[ax] = diff(cur, base)
            print(f"ax={ax:+5.1f} " + fmt(res_a[ax]))

        print("\n== B. ParamHairFront sweep, ax=0 ==")
        res_b = {}
        for hf in (-0.22, -0.11, 0.0, 0.11, 0.22):
            cur = await pg.evaluate("([hf]) => window.__set({ParamAngleX:0, ParamHairFront:hf})", [hf])
            res_b[hf] = diff(cur, base)
            print(f"hf={hf:+5.2f} " + fmt(res_b[hf]))

        print("\n== C. AngleX +-6 with hf = k*ax ==")
        for ax in (-6.0, 6.0):
            for k in (0.0, -0.0185, -0.0239, 0.0239):
                cur = await pg.evaluate(
                    "([ax,hf]) => window.__set({ParamAngleX:ax, ParamHairFront:hf})", [ax, ax * k])
                print(f"ax={ax:+4.1f} k={k:+.4f} hf={ax*k:+.3f} " + fmt(diff(cur, base)))

        # sensitivity (core units per degree / per hf unit)
        fx = (res_a[6.0]["fL"][0] - res_a[-6.0]["fL"][0]) / 12.0
        ex = (res_a[6.0]["eyeL"][0] - res_a[-6.0]["eyeL"][0]) / 12.0
        hx = (res_a[6.0]["hairC"][0] - res_a[-6.0]["hairC"][0]) / 12.0
        per_hf_fL = (res_b[0.22]["fL"][0] - res_b[-0.22]["fL"][0]) / 0.44
        per_hf_h = (res_b[0.22]["hairC"][0] - res_b[-0.22]["hairC"][0]) / 0.44
        print(f"\nsens core units/deg: faceLeft {fx:+.4f} eyeL {ex:+.4f} hairC {hx:+.4f}")
        print(f"sens core units/hf : faceLeft {per_hf_fL:+.4f} hairC {per_hf_h:+.4f}")
        if abs(per_hf_h) > 1e-9:
            print(f"k (hf per degree, keep hair on face): {(fx - hx) / per_hf_h:+.4f}")
        await b.close()

asyncio.run(main())