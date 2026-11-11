"""Track how far the front-hair plate slides against the face plate on the stage.

For every sample it reads the vertex centroid of the ArtMeshFace and the
ArtMeshFrontHair drawables (canvas units) plus the model scale, so the relative
plate motion can be reported in stage pixels. That is the number the user sees as
"the hair slides off the scalp"; a parameter range alone does not show it.

Run: python preview\\_diag\\_grok_plate_track.py [tag]
"""
import asyncio
import sys

from playwright.async_api import async_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else "fixed"
URL = ("http://127.0.0.1:8848/preview/stage-760.html?n=3&names=Grok,Claude,Gemini"
       "&active=1&nogest=1&seed=20261103")

SETUP = """
() => {
  const m = (window.__models || []).find((x) => x && x.__char && x.__char.key === 'grok');
  if (!m) return { error: 'no grok seat' };
  const im = m.internalModel;
  const core = im.coreModel;
  const ids = core.getDrawableIds();
  const idx = (want) => ids.findIndex((id) => String(id).indexOf(want) >= 0);
  const faceIdx = idx('ArtMeshFace');
  const hairIdx = idx('ArtMeshFrontHair');
  if (faceIdx < 0 || hairIdx < 0) return { error: 'drawables not found', ids: ids.map(String) };
  const centroid = (i) => {
    const v = core.getDrawableVertexPositions(i);
    let sx = 0, sy = 0, n = 0;
    for (let k = 0; k + 1 < v.length; k += 2) { sx += v[k]; sy += v[k + 1]; n += 1; }
    return { x: sx / n, y: sy / n, n };
  };
  window.__track = [];
  im.on('beforeModelUpdate', () => {});
  window.__trackTimer = setInterval(() => {
    const f = centroid(faceIdx);
    const h = centroid(hairIdx);
    window.__track.push({ x: (h.x - f.x) * 2048, y: (h.y - f.y) * 2048 });
  }, 100);
  return {
    ok: true,
    scale: m.scale.x,
    width: m.width,
    pxPerCanvas: m.scale.x,
    faceIdx, hairIdx,
    faceVerts: core.getDrawableVertexPositions(faceIdx).length / 2,
    hairVerts: core.getDrawableVertexPositions(hairIdx).length / 2,
  };
}
"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 900})
        await pg.goto(URL)
        await pg.wait_for_function(
            "() => window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=60000)
        await pg.wait_for_timeout(400)
        info = await pg.evaluate(SETUP)
        print("setup:", info)
        await pg.wait_for_timeout(20000)
        track = await pg.evaluate("() => window.__track")
        px = info["pxPerCanvas"]
        xs = [t["x"] for t in track]
        ys = [t["y"] for t in track]
        print(f"tag={TAG} samples={len(track)} scale={px:.4f} (1 canvas px = {px:.3f} stage px)")
        import math
        # A centroid offset is dominated by where each plate sits relative to the
        # rotation pivot, so raw dx swings with any head turn. What matters is
        # whether the two plates rotate *together*: |r| is rotation-invariant, and
        # the angle of r must follow the head angle one-to-one.
        dist = [math.hypot(t["x"], t["y"]) for t in track]
        ang = [math.degrees(math.atan2(t["y"], t["x"])) for t in track]
        print(f"  |hair-face|     {min(dist):8.2f} .. {max(dist):8.2f} canvas px"
              f"  p-p {max(dist) - min(dist):6.2f} canvas px = {(max(dist) - min(dist)) * px:5.2f} stage px")
        print(f"  angle(hair-face) {min(ang):+8.2f} .. {max(ang):+8.2f} deg  p-p {max(ang) - min(ang):6.2f}")
        print(f"  hair-vs-face dx  {min(xs):+8.2f} .. {max(xs):+8.2f} canvas px"
              f"  p-p {max(xs) - min(xs):7.2f} canvas px = {(max(xs) - min(xs)) * px:6.2f} stage px")
        print(f"  hair-vs-face dy  {min(ys):+8.2f} .. {max(ys):+8.2f} canvas px"
              f"  p-p {max(ys) - min(ys):7.2f} canvas px = {(max(ys) - min(ys)) * px:6.2f} stage px")
        await b.close()

asyncio.run(main())