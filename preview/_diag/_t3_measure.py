# -*- coding: utf-8 -*-
"""t3: reproduce + quantify the Gemini "black frame / dark seam" on the face.

Renders single frames at 1:1 (scale=1.0, 2048 canvas) from preview/probe.html,
extracts the stage with true alpha (renderer.extract -> PNG with alpha), and
reports:
  * per-drawable screen bboxes (so a hole can be attributed to a piece)
  * inside-holes  : binary_fill_holes(mask) & ~mask          (fully enclosed)
  * seam gaps     : binary_closing(mask, r) & ~mask          (also open slits)
  * dark layer    : A>200 and RGBmax<70 inside the model      (baked dark ink)
  * see-through   : A<128 with dark-ish RGB                   (background bleed)
and saves evidence PNGs (extract, white/magenta composites, 4x crops).

Usage: python preview/_diag/_t3_measure.py [scale]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
EVI = ROOT / "preview" / "_evidence" / "t3"
EVI.mkdir(parents=True, exist_ok=True)
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0

# stage pose taken from lib/client.js (idle breath peak + shoulder/hair comp)
STAGE = dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0)

CASES = [
    dict(name="neutral", p={}),
    dict(name="stage_pose", p=STAGE),
    dict(name="stage_pose_noface", p=STAGE, part={"PartFace": 0}),
    dict(name="stage_pose_nohairfront", p=STAGE, part={"PartHairFront": 0}),
    dict(name="stage_pose_nohead", p=STAGE, part={"PartHead": 0}),
    dict(name="stage_pose_noacc", p=STAGE, part={"PartHeadAccessories": 0}),
    dict(name="stage_pose_nobody", p=STAGE, part={"PartBody": 0}),
    dict(name="stage_pose_white", p=STAGE, bg="#ffffff"),
    dict(name="stage_pose_magenta", p=STAGE, bg="#ff00ff"),
]

JS_INFO = r"""
() => {
  const app = window.__app, m = window.__model, core = m.internalModel.coreModel;
  const n = core.getDrawableCount();
  const ids = [], boxes = {}, orders = [], blend = [], opa = [];
  for (let i = 0; i < n; i++) {
    const id = core.getDrawableId(i);
    ids.push(id);
    orders.push(core.getDrawableRenderOrders()[i]);
    blend.push(core.getDrawableBlendMode(i));
    opa.push(core.getDrawableOpacity(i));
    const vc = core.getDrawableVertexCount(i);
    const v = core.getDrawableVertexPositions(i);   // Float32Array length vc*2
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < vc; k++) {
      const x = v[k * 2], y = v[k * 2 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    boxes[id] = [x0, y0, x1, y1];
  }
  // vertex positions are normalised (canvas px / 2048); fit the pixel mapping
  // from the model's global bounds so the boxes become screen pixels.
  let ux0 = 1e9, uy0 = 1e9, ux1 = -1e9, uy1 = -1e9;
  for (const k in boxes) { const b = boxes[k];
    if (b[0] < ux0) ux0 = b[0]; if (b[2] > ux1) ux1 = b[2];
    if (b[1] < uy0) uy0 = b[1]; if (b[3] > uy1) uy1 = b[3]; }
  const g = m.getBounds();
  const sx = g.width / (ux1 - ux0), sy = g.height / (uy1 - uy0);
  const s = (sx + sy) / 2;
  const ox = g.x - ux0 * s, oy = g.y - uy0 * s;
  for (const k in boxes) { const b = boxes[k];
    boxes[k] = [b[0] * s + ox, b[1] * s + oy, b[2] * s + ox, b[3] * s + oy]; }
  return { ids, boxes, orders, blend, opa,
           pos: [m.position.x, m.position.y], scale: m.scale.x,
           fit: [s, ox, oy, sx, sy], gbounds: [g.x, g.y, g.width, g.height],
           size: [app.renderer.width, app.renderer.height] };
}
"""


def extract(pg):
    b64 = pg.evaluate("async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    raw = __import__("base64").b64decode(b64.split(",", 1)[-1])
    import io
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    return np.array(im)


def region(arr, box, pad=0):
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    m = np.zeros(arr.shape, bool)
    m[max(0, y0 - pad):, max(0, x0 - pad):] = False
    m[max(0, y0 - pad):max(0, y1 + pad), max(0, x0 - pad):max(0, x1 + pad)] = True
    return m


def metrics(rgba, boxes):
    A = rgba[:, :, 3]
    rgb = rgba[:, :, :3].astype(np.int16)
    mask = A > 8
    filled = ndi.binary_fill_holes(mask)
    holes = filled & ~mask
    seald = ndi.binary_closing(mask, structure=np.ones((9, 9)))
    gaps = seald & ~mask
    dark = mask & (A > 200) & (rgb.max(axis=2) < 70)
    dark_lo = mask & (A <= 200) & (rgb.max(axis=2) < 70)
    out = {
        "alpha_px": int(mask.sum()),
        "hole_px": int(holes.sum()),
        "gap_px": int(gaps.sum()),
        "dark_opaque_px": int(dark.sum()),
        "dark_faint_px": int(dark_lo.sum()),
    }
    regions = {}
    if "ArtMeshFace" in boxes:
        regions["face"] = region(mask, boxes["ArtMeshFace"], 26)
    if "ArtMeshFace2" in boxes:
        regions["head"] = region(mask, boxes["ArtMeshFace2"], 10)
    ey = [boxes[k] for k in ("ArtMeshEyeCloseL", "ArtMeshEyeCloseR", "ArtMeshEyewhiteL",
                             "ArtMeshEyewhiteR", "ArtMeshIridesL", "ArtMeshIridesR") if k in boxes]
    if ey:
        regions["eyes"] = region(mask, [min(b[0] for b in ey), min(b[1] for b in ey),
                                        max(b[2] for b in ey), max(b[3] for b in ey)], 14)
    for rk, rm in regions.items():
        out[rk] = {k: int(v[rm].sum()) for k, v in
                   (("hole", holes), ("gap", gaps), ("dark", dark), ("darkfaint", dark_lo))}

    def blobstat(key, arr):
        lab, n = ndi.label(arr)
        if not n:
            return {}, []
        sizes = ndi.sum(arr, lab, range(1, n + 1))
        order = np.argsort(sizes)[::-1]
        comps = []
        for k in order[:6]:
            if sizes[k] < 20:
                continue
            ys, xs = np.where(lab == int(k) + 1)
            cx, cy = float(xs.mean()), float(ys.mean())
            owners = [nm for nm, b in boxes.items() if b[0] - 6 <= cx <= b[2] + 6 and b[1] - 6 <= cy <= b[3] + 6]
            comps.append(dict(px=int(sizes[k]), bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                              c=[round(cx, 1), round(cy, 1)], owners=owners))
        return comps, [int(s) for s in sizes]

    out["holes"] = blobstat("holes", holes)[0]
    out["gaps"] = blobstat("gaps", gaps)[0]
    out["dark"] = blobstat("dark", dark)[0]
    return out, holes, gaps, dark


def comp_over(rgba, color):
    A = (rgba[:, :, 3:4].astype(np.float32) / 255.0)
    return (rgba[:, :, :3].astype(np.float32) * A + np.array(color, np.float32) * (1 - A)).astype(np.uint8)


def crop4(img, box, path, pad=8):
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.shape[1], x1 + pad); y1 = min(img.shape[0], y1 + pad)
    if x1 <= x0 or y1 <= y0:
        return None
    sub = img[y0:y1, x0:x1]
    Image.fromarray(sub).resize((sub.shape[1] * 4, sub.shape[0] * 4), Image.NEAREST).save(path)
    return (x0, y0, x1, y1)


def main():
    report = {}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 300, "height": 300}, device_scale_factor=1)
        pg.set_default_timeout(120000)
        for case in CASES:
            qs = ["scale=%s" % SCALE, "model=" + MODEL.replace("/", "%2F")]
            if case.get("p"):
                spec = ",".join("%s:%s" % (k, v) for k, v in case["p"].items())
                qs.append("p=" + spec.replace(":", "%3A").replace(",", "%2C"))
            if case.get("part"):
                spec = ",".join("%s:%s" % (k, v) for k, v in case["part"].items())
                qs.append("part=" + spec.replace(":", "%3A").replace(",", "%2C"))
            if case.get("bg"):
                qs.append("bg=" + case["bg"].replace("#", "%23"))
            url = "http://127.0.0.1:8848/preview/probe.html?" + "&".join(qs)
            pg.goto(url, wait_until="load")
            pg.wait_for_function("() => document.title === 'READY'", timeout=120000)
            info = pg.evaluate(JS_INFO)
            rgba = extract(pg)
            met, holes, gaps, dark = metrics(rgba, info["boxes"])
            name = case["name"]
            Image.fromarray(rgba).save(EVI / ("%s_rgba.png" % name))
            Image.fromarray(comp_over(rgba, (20, 18, 26))).save(EVI / ("%s_on_dark.png" % name))
            if name.endswith("white"):
                Image.fromarray(comp_over(rgba, (255, 255, 255))).save(EVI / ("%s_w.png" % name))
            if name.endswith("magenta"):
                pass
            # head crop: the union of every drawable so the whole head shows
            fb = info["boxes"]
            head = None
            for k in ("ArtMeshFace2", "ArtMeshFrontHair", "ArtMeshFace", "ArtMeshHeadwear",
                      "ArtMeshEars", "ArtMeshEyeCloseL", "ArtMeshEyeCloseR"):
                if k in fb:
                    b = fb[k]
                    head = b if head is None else [min(head[0], b[0]), min(head[1], b[1]),
                                                   max(head[2], b[2]), max(head[3], b[3])]
            if head:
                crop4(rgba, head, EVI / ("%s_head4x.png" % name))
                crop4(comp_over(rgba, (20, 18, 26)), head, EVI / ("%s_head4x_dark.png" % name))
            if "ArtMeshFace" in fb:
                crop4(rgba, fb["ArtMeshFace"], EVI / ("%s_face4x.png" % name), pad=26)
                crop4(comp_over(rgba, (20, 18, 26)), fb["ArtMeshFace"], EVI / ("%s_face4x_dark.png" % name), pad=26)
            report[name] = dict(url=url, metrics=met, fit=info["fit"], gbounds=info["gbounds"],
                                drawables={k: [round(v, 1) for v in b] for k, b in info["boxes"].items()})
            print("%-24s holes=%6d gaps=%6d dark=%6d faint=%6d | %s"
                  % (name, met["hole_px"], met["gap_px"], met["dark_opaque_px"], met["dark_faint_px"],
                     {k: v for k, v in met.items() if k in ("face", "head", "eyes")}), flush=True)
            for h in met["holes"][:3]:
                print("     hole %5d px bbox=%s owners=%s" % (h["px"], h["bbox"], h["owners"][:6]), flush=True)
            for h in met["gaps"][:3]:
                print("     gap  %5d px bbox=%s owners=%s" % (h["px"], h["bbox"], h["owners"][:6]), flush=True)
            for h in met["dark"][:2]:
                print("     dark %5d px bbox=%s owners=%s" % (h["px"], h["bbox"], h["owners"][:6]), flush=True)
        br.close()
    (EVI / "t3_metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()