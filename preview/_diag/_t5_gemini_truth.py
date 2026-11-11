# -*- coding: utf-8 -*-
"""t5: independent Gemini re-measure + the "pale band" acceptance risk.

Three independent measurements, all on the *shipped* build:

1. matte ground truth (same method as t3/t4): px the matte says are opaque but
   the render shows transparent -> the user-visible "hole/seam" metric, in
   canvas px @2048^2.  Re-run on the current build to check t4's numbers.
2. alpha-only "enclosed hole" metric: low-alpha px inside the face rect that are
   NOT connected to the canvas exterior (a real hole, not the silhouette).
3. stage-scale composite (k measured from the live stage = 0.14111 canvas px per
   stage CSS px, five seats) of new vs old build on the stage's dark backdrop,
   to size the pale band t4 recorded as residual and compare it against the
   pre-fix dark seam *at the same pixels*.

Writes preview/_evidence/t5/gemini_*.json|txt|png
"""
from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
OUT.mkdir(parents=True, exist_ok=True)
LAYOUT = ROOT / "assets" / "build" / "gemini-v1" / "gemini.layout.json"
MATTE = ROOT / "assets" / "build" / "gemini-parts" / "matte.png"
SCALE_MATTE = 1.2599
OFF = (380.4, 68.5)
MODELS = {
    "new": "../assets/build/gemini-v1/gemini.layout.model3.json",
    "old": "../assets/build/gemini-v1.bak/gemini.layout.model3.json",
}
K_STAGE = 0.14111          # measured: window.__models[2].scale.x, n=5 @760 css
BG = (18, 24, 38)          # stage radial gradient around a seated head
FACE_CASES = {
    "neutral": {},
    "stage_pose": dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0),
    "anglex_m10": dict(AngleX=-10, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5),
    "anglexy_p6p4": dict(AngleX=6, AngleY=4, BodyAngleX=0, HairFront=0, Breath=0.5),
}
LAY = json.loads(LAYOUT.read_text(encoding="utf-8"))
RECTS = {l["name"]: l["rect"] for l in LAY["layers"]}
FACE = RECTS["face"]


def matte_ref() -> np.ndarray:
    mat = np.array(Image.open(MATTE).convert("RGBA")).astype(np.float32)
    h, w = mat.shape[:2]
    out = np.zeros((2048, 2048, 4), np.float32)
    ys = (np.arange(2048, dtype=np.float32) - OFF[1]) / SCALE_MATTE
    xs = (np.arange(2048, dtype=np.float32) - OFF[0]) / SCALE_MATTE
    yi = np.clip(np.round(ys).astype(np.int32), 0, h - 1)
    xi = np.clip(np.round(xs).astype(np.int32), 0, w - 1)
    ok_y = (ys >= -0.5) & (ys <= h - 0.5)
    ok_x = (xs >= -0.5) & (xs <= w - 0.5)
    sub = mat[np.ix_(yi, xi)]
    sub[~ok_y, :, :] = 0
    sub[:, ~ok_x, :] = 0
    return sub


REF_A = matte_ref()[:, :, 3] / 255.0
FX0, FY0 = FACE["left"] - 30, FACE["top"] - 30
FX1, FY1 = FX0 + FACE["width"] + 60, FY0 + FACE["height"] + 60


def grab(page, model: str, params: dict, scale: float = 1.0, mip: bool = False) -> Image.Image:
    qs = [f"scale={scale}", "model=" + model.replace("/", "%2F")]
    if params:
        qs.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items())
                  .replace(":", "%3A").replace(",", "%2C"))
    if mip:
        qs.append("mip=1")
    page.goto("http://127.0.0.1:8848/preview/probe.html?" + "&".join(qs), wait_until="load")
    page.wait_for_function("() => document.title === 'READY'", timeout=180000)
    b64 = page.evaluate(
        "async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    return Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA")


def analyse_truth(rgba: np.ndarray) -> dict:
    a = rgba[:, :, 3] / 255.0
    defect = (REF_A > 0.85) & (a < 0.60)
    in_face = int(defect[FY0:FY1, FX0:FX1].sum())
    lab, n = ndi.label(defect)
    sizes = ndi.sum(defect, lab, range(1, n + 1)) if n else []
    big = [int(s) for s in sizes if s >= 12]
    return {"total": int(defect.sum()), "in_face": in_face,
            "components_ge12px": len(big), "largest": max(big) if big else 0}


def analyse_holes(rgba: np.ndarray) -> dict:
    """alpha-only: enclosed low-alpha regions inside the face window."""
    a = rgba[:, :, 3] / 255.0
    low = a < 0.5
    win = np.zeros_like(low)
    win[FY0:FY1, FX0:FX1] = True
    lab, n = ndi.label(low)                       # label on the whole canvas
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    win_lab = lab * win
    ids = [i for i in np.unique(win_lab) if i and i not in border]
    holes = []
    for i in ids:
        m = lab == i
        px = int(m.sum())
        if px < 4:
            continue
        ys, xs = np.where(m)
        holes.append({"px": px, "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                      "touches_face_edge": bool(xs.min() <= FX0 + 14 or xs.max() >= FX1 - 14
                                                or ys.min() <= FY0 + 14 or ys.max() >= FY1 - 14)})
    holes.sort(key=lambda h: -h["px"])
    within = sum(h["px"] for h in holes if not h["touches_face_edge"])
    return {"enclosed_components": len(holes),
            "enclosed_px": int(within),
            "largest_enclosed_px": holes[0]["px"] if holes else 0,
            "components": holes[:6]}


def composite(img: Image.Image, bg=BG) -> np.ndarray:
    base = Image.new("RGBA", img.size, tuple(bg) + (255,))
    base.alpha_composite(img)
    return np.asarray(base.convert("RGB")).astype(np.float32)


def to_lstar(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    return np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)


def band_metrics(new_rgba: Image.Image, old_rgba: Image.Image) -> dict:
    n = composite(new_rgba)
    o = composite(old_rgba)
    assert n.shape == o.shape
    h, w = n.shape[:2]
    k = w / 2048.0
    # window around the face, in this render's pixels
    x0, x1 = int(FX0 * k), int(FX1 * k)
    y0, y1 = int(FY0 * k), int(FY1 * k)
    ln, lo = to_lstar(n), to_lstar(o)
    dn = ln - lo
    # the dark seam that the old build showed: near-backdrop luminance in-window
    dark = (lo < 26)
    # the pale band: pixels this build lifts well above the old one
    pale = dn > 10
    pale_px = int(pale[y0:y1, x0:x1].sum())
    dark_px = int(dark[y0:y1, x0:x1].sum())
    skin = ln[y0:y1, x0:x1][(ln[y0:y1, x0:x1] > 55) & (ln[y0:y1, x0:x1] < 95) & ~pale[y0:y1, x0:x1]]
    res = {
        "k": round(k, 5),
        "window": [x0, y0, x1, y1],
        "old_dark_px_lt26": dark_px,
        "old_dark_min_l": round(float(lo[y0:y1, x0:x1].min()), 1),
        "new_pale_px_dl_gt10": pale_px,
        "new_pale_max_dl": round(float(dn[y0:y1, x0:x1].max()), 1),
        "pale_mean_dl": round(float(dn[y0:y1, x0:x1][pale[y0:y1, x0:x1]].mean()), 1) if pale_px else 0.0,
        "skin_median_l": round(float(np.median(skin)), 1) if skin.size else None,
    }
    if pale_px:
        lab, ncomp = ndi.label(pale)
        sizes = ndi.sum(pale, lab, range(1, ncomp + 1))
        order = np.argsort(sizes)[::-1]
        top = []
        for i in order[:3]:
            if sizes[i] < 6:
                break
            m = lab == int(i) + 1
            ys, xs = np.where(m)
            l = ln[m]
            top.append({"px": int(sizes[i]),
                        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                        "in_stage_px": round(float(sizes[i]) / (k * k), 1),
                        "max_l": round(float(l.max()), 1),
                        "mean_dl": round(float(dn[m].mean()), 1)})
        res["pale_components"] = top
    return res


def save_pair(new_rgba: Image.Image, old_rgba: Image.Image, tag: str) -> None:
    n, o = composite(new_rgba), composite(old_rgba)
    h, w = n.shape[:2]
    k = w / 2048.0
    pad = int(26 * k)
    box = (max(0, int(FX0 * k) - pad), max(0, int(FY0 * k) - pad),
           min(w, int(FX1 * k) + pad), min(h, int(FY1 * k) + pad))
    cn = Image.fromarray(n.astype(np.uint8)).crop(box)
    co = Image.fromarray(o.astype(np.uint8)).crop(box)
    zoom = max(1, int(round(8 / max(k, 1e-6) / 10)))
    zoom = max(4, min(12, zoom))
    cn = cn.resize((cn.width * zoom, cn.height * zoom), Image.NEAREST)
    co = co.resize((co.width * zoom, co.height * zoom), Image.NEAREST)
    sheet = Image.new("RGB", (cn.width * 2 + 18, cn.height), (8, 10, 16))
    sheet.paste(co, (0, 0))
    sheet.paste(cn, (cn.width + 18, 0))
    d = ImageDraw.Draw(sheet)
    d.text((6, 4), "old (pre-fix)", fill=(255, 220, 120))
    d.text((cn.width + 24, 4), "new (shipped)", fill=(120, 240, 200))
    sheet.save(OUT / f"AB_{tag}_{zoom}x.png")
    # raw 1x crops too, so the reader can see the true size
    Image.fromarray(o.astype(np.uint8)).crop(box).save(OUT / f"old_{tag}_1x.png")
    Image.fromarray(n.astype(np.uint8)).crop(box).save(OUT / f"new_{tag}_1x.png")


def main() -> int:
    report = {"matte_truth": {}, "enclosed_holes": {}, "band": {}}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)

        stage_cache: dict[str, dict[str, Image.Image]] = {}
        for tag in ("new", "old"):
            stage_cache[tag] = {}
            for case, params in FACE_CASES.items():
                rgba = grab(page, MODELS[tag], params, scale=1.0)
                if tag == "new":
                    report["matte_truth"][case] = analyse_truth(np.asarray(rgba))
                    report["enclosed_holes"][case] = analyse_holes(np.asarray(rgba))
                if case in ("neutral", "stage_pose"):
                    stage_cache[tag][case] = grab(page, MODELS[tag], params, scale=K_STAGE)
                print(f"{tag:3s} {case:14s} truth={report['matte_truth'].get(case, '')}")

        # stage-scale A/B
        for case in ("neutral", "stage_pose"):
            nimg = stage_cache["new"][case]
            oimg = stage_cache["old"][case]
            report["band"][case] = band_metrics(nimg, oimg)
            save_pair(nimg, oimg, case)
            print(f"band {case}: {report['band'][case]}")
        br.close()

    (OUT / "gemini_check.json").write_text(json.dumps(report, ensure_ascii=False, indent=1),
                                           encoding="utf-8")
    lines = ["t5 / Gemini independent re-measure (shipped build)",
             "", "matte ground truth (defect px, alpha<0.60 where matte alpha>0.85):"]
    for case, r in report["matte_truth"].items():
        lines.append(f"  {case:14s} total={r['total']:6d} face={r['in_face']:5d} "
                     f"comps>=12px={r['components_ge12px']} largest={r['largest']}")
    lines += ["", "alpha-only enclosed holes (face window, low alpha not touching the exterior):"]
    for case, r in report["enclosed_holes"].items():
        lines.append(f"  {case:14s} comps={r['enclosed_components']:3d} px={r['enclosed_px']:5d} "
                     f"largest={r['largest_enclosed_px']}")
    lines += ["", "stage-scale (k=%.5f) pale-band vs pre-fix dark seam:" % K_STAGE]
    for case, r in report["band"].items():
        lines.append(f"  {case:14s} old_dark_px(L<26)={r['old_dark_px_lt26']:4d} "
                     f"min_L={r['old_dark_min_l']:.1f} | new_pale_px(dL>10)={r['new_pale_px_dl_gt10']:4d} "
                     f"max_dL={r['new_pale_max_dl']:.1f} mean_dL={r['pale_mean_dl']:.1f} "
                     f"skin_L={r['skin_median_l']}")
        for c in r.get("pale_components", []):
            lines.append(f"      {c['px']:4d}px bbox={c['bbox']} = {c['in_stage_px']:.1f} stage px^2 "
                         f"mean_dL={c['mean_dl']}")
    (OUT / "gemini_check.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())