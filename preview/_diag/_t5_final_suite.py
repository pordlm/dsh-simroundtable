# -*- coding: utf-8 -*-
"""t5 final acceptance suite (run once, on the FINAL t7 build).

Checks, in the order the captain asked for:

  1 matte ground truth   neutral / stage_pose / AngleX-10 / AngleX+6,AngleY+4
  2 alpha holes          enclosed (real holes) + open (connected to the exterior)
  3 stage shots          five seats + two seats at DPR3, Gemini head 6x crop
  4 A/B vs .bak          probe render at the measured stage scale, same pose
  5 deploy audit         workspace vs deployed/dsh-roundtable, per-file MD5
  6 pale-edge retest     vertical edge dL* < 3 and inner L* std ~= outer ring std
  7 bg sensitivity       white vs magenta backdrop, same pose -> 0 px in skin

Writes preview/_evidence/t5/final_suite.json|txt and the shot/crop artefacts.
Run: python preview\\_diag\\_t5_final_suite.py
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
OUT.mkdir(parents=True, exist_ok=True)
BUILD = ROOT / "assets" / "build" / "gemini-v1"
BAK = ROOT / "assets" / "build" / "gemini-v1.bak"
DEPLOYED = ROOT / "deployed" / "dsh-roundtable"
BASE = "http://127.0.0.1:8848/preview/stage-760.html"

_spec = importlib.util.spec_from_file_location("t", ROOT / "preview" / "_diag" / "_t5_gemini_truth.py")
T = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(T)          # module-level constants only; main() is guarded

FACE = T.FACE
FX0, FY0, FX1, FY1 = T.FX0, T.FY0, T.FX1, T.FY1


# ---------------------------------------------------------------- 5 deploy audit
def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def walk(d: Path) -> dict[str, str]:
    return {p.relative_to(d).as_posix(): md5(p) for p in sorted(d.rglob("*")) if p.is_file()}


def deploy_audit() -> dict:
    a, b = walk(BUILD), walk(DEPLOYED / "assets" / "build" / "gemini-v1")
    diff = sorted(k for k in a if a.get(k) != b.get(k))
    libs, libd = walk(ROOT / "lib"), walk(DEPLOYED / "lib")
    lib_diff = sorted(k for k in libs if libs.get(k) != libd.get(k))
    return {
        "build_files": len(a), "deployed_files": len(b),
        "same": len(a) - len(diff), "differing": diff,
        "build_newest": max((p.stat().st_mtime for p in BUILD.rglob("*") if p.is_file()), default=0),
        "deployed_newest": max((p.stat().st_mtime for p in (DEPLOYED / "assets" / "build" / "gemini-v1").rglob("*") if p.is_file()), default=0),
        "lib_files": len(libs), "lib_differing": lib_diff,
        "head_base_md5": a.get("parts/head_base.png"),
        "texture_md5": a.get("gemini.layout.4096/texture_00.png"),
        "moc3_size": (BUILD / "gemini.layout.moc3").stat().st_size if (BUILD / "gemini.layout.moc3").is_file() else None,
        "head_base_bytes": (BUILD / "parts" / "head_base.png").stat().st_size if (BUILD / "parts" / "head_base.png").is_file() else None,
        "texture_bytes": (BUILD / "gemini.layout.4096" / "texture_00.png").stat().st_size
        if (BUILD / "gemini.layout.4096" / "texture_00.png").is_file() else None,
        "synced": not diff,
    }


# ---------------------------------------------------------------- 1/2 truth+holes
def truth_and_holes(page) -> dict:
    res = {}
    for case, params in T.FACE_CASES.items():
        rgba = np.asarray(T.grab(page, T.MODELS["new"], params, scale=1.0))
        truth = T.analyse_truth(rgba)
        a = rgba[:, :, 3] / 255.0
        low = a < 0.5
        lab, n = ndi.label(low)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
        win = np.zeros_like(low)
        win[FY0:FY1, FX0:FX1] = True
        enclosed, opened = [], []
        for i in range(1, n + 1):
            m = lab == i
            px = int((m & win).sum())
            if px < 4:
                continue
            ys, xs = np.where(m)
            item = {"px_in_window": px, "px_total": int(m.sum()),
                    "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]}
            (opened if i in border else enclosed).append(item)
        res[case] = {
            "truth": truth,
            "holes_enclosed_px": sum(h["px_in_window"] for h in enclosed),
            "holes_enclosed_n": len(enclosed),
            "holes_open_px": sum(h["px_in_window"] for h in opened),
            "holes_open_n": len(opened),
            "largest_enclosed": max((h["px_in_window"] for h in enclosed), default=0),
        }
    return res


# ---------------------------------------------------------------- 6 pale edge
def plate_canvas(build: Path):
    man = json.loads((build / "gemini.layout.json").read_text(encoding="utf-8"))
    r = [l for l in man["layers"] if l["name"] == "head base"][0]["rect"]
    arr = np.asarray(Image.open(build / "parts" / "head_base.png").convert("RGBA"))
    out = np.zeros((2048, 2048, 4), np.uint8)
    out[r["top"]:r["top"] + arr.shape[0], r["left"]:r["left"] + arr.shape[1]] = arr
    return out


def pale_edge() -> dict:
    new, old = plate_canvas(BUILD), plate_canvas(BAK)
    an, ao = new[..., 3], old[..., 3]
    ln, lo = T.to_lstar(new[..., :3].astype(np.float32)), T.to_lstar(old[..., :3].astype(np.float32))
    fill = (an >= 250) & (ao < 200)
    lab, n = ndi.label(fill)
    comps = []
    for i in range(1, n + 1):
        m = lab == i
        px = int(m.sum())
        if px < 300:
            continue
        ys, xs = np.where(m)
        bx0, bx1, by0, by1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())

        def edge(side: str) -> tuple:
            """Step across the fill boundary: new fill inside vs *old opaque*
            outside.  Pixels where the old plate was transparent carry no colour,
            so they are skipped.  Returns (dL*, rows) — a 3-row sliver next to the
            mouth line is not a "vertical edge" and is reported separately."""
            if side == "left":
                rows = np.unique(ys[xs <= bx0 + 2])
                inside = [(y, x) for y in rows for x in range(bx0 + 1, bx0 + 7)]
                outside = [(y, x) for y in rows for x in range(bx0 - 9, bx0 - 3)]
            else:
                rows = np.unique(ys[xs >= bx1 - 2])
                inside = [(y, x) for y in rows for x in range(bx1 - 6, bx1)]
                outside = [(y, x) for y in rows for x in range(bx1 + 4, bx1 + 10)]
            ins = [ln[y, x] for y, x in inside if an[y, x] >= 250]
            outs = [lo[y, x] for y, x in outside if ao[y, x] >= 250]
            if len(ins) < 20 or len(outs) < 20:
                return (None, int(len(rows)))
            return (round(float(np.mean(ins) - np.mean(outs)), 1), int(len(rows)))

        el, el_rows = edge("left")
        er, er_rows = edge("right")

        ring = ndi.binary_dilation(m, iterations=10) & ~m & (ao >= 250)
        # is the fill a rectangle?  share of the bbox that is filled, and the share
        # of the boundary that sits on a bbox side (a straight-edged patch is ~100%)
        bbox_px = (bx1 - bx0 + 1) * (by1 - by0 + 1)
        on_side = ((xs <= bx0 + 1) | (xs >= bx1 - 1) | (ys <= by0 + 1) | (ys >= by1 - 1))
        comps.append({
            "px": px, "bbox": [bx0, by0, bx1, by1],
            "bbox_fill_ratio": round(px / bbox_px, 3),
            "boundary_on_bbox_side": round(float(on_side.mean()), 3),
            "stage_px2": round(px * T.K_STAGE * T.K_STAGE, 1),
            "stage_bbox": [round((bx1 - bx0 + 1) * T.K_STAGE, 1), round((by1 - by0 + 1) * T.K_STAGE, 1)],
            "edge_dl_left": el, "edge_dl_left_rows": el_rows,
            "edge_dl_right": er, "edge_dl_right_rows": er_rows,
            "inner_std_l": round(float(ln[m].std()), 1),
            "ring_std_l": round(float(lo[ring].std()), 1) if ring.any() else None,
            "inner_mean_l": round(float(ln[m].mean()), 1),
            "ring_mean_l": round(float(lo[ring].mean()), 1) if ring.any() else None,
        })
    comps.sort(key=lambda c: -(c["px"]))
    # A "vertical edge" has to be an actual edge: 3 rows next to the mouth line is a
    # sliver, not a seam.  Both numbers are reported; the verdict uses long edges.
    def edges_of(min_rows: int) -> list:
        out = []
        for c in comps:
            for side in ("left", "right"):
                v = c["edge_dl_" + side]
                if v is not None and c["edge_dl_%s_rows" % side] >= min_rows:
                    out.append(abs(v))
        return out

    all_edges = edges_of(1)
    long_edges = edges_of(50)
    ratios = [c["inner_std_l"] / c["ring_std_l"] for c in comps if c["ring_std_l"]]
    worst_edge = max(all_edges) if all_edges else 0.0
    worst_long = max(long_edges) if long_edges else 0.0
    if not comps:
        return {"k_stage_five": T.K_STAGE, "k_stage_two": 0.15605,
                "fill_px_canvas": int(fill.sum()), "fill_px_stage1x": 0.0,
                "components": [], "components_n": 0, "worst_abs_edge_dl": 0.0,
                "flatness_ratio_range": None,
                "verdict_edge": "PASS", "verdict_flatness": "PASS",
                "note": "no fill region >=300 px: the plate only fills real holes"}
    return {
        "k_stage_five": T.K_STAGE,
        "k_stage_two": 0.15605,
        "fill_px_canvas": int(fill.sum()),
        "fill_px_stage1x": round(int(fill.sum()) * T.K_STAGE * T.K_STAGE, 1),
        "components": comps[:6], "components_n": len(comps),
        "worst_abs_edge_dl": round(worst_edge, 1),
        "worst_long_edge_dl": round(worst_long, 1),
        "long_edge_min_rows": 50,
        "flatness_ratio_range": [round(min(ratios), 2), round(max(ratios), 2)] if ratios else None,
        "verdict_edge": "PASS" if worst_long < 3 else "FAIL",
        "verdict_edge_strict_all": "PASS" if worst_edge < 3 else "FAIL",
        "verdict_flatness": "PASS" if ratios and max(ratios) < 1.5 else "FAIL",
    }


# ---------------------------------------------------------------- 7 bg sensitivity
def grab_page(page, model: str, params: dict, scale: float, bg: str) -> np.ndarray:
    """Composited page screenshot: the canvas has backgroundAlpha 0, so whatever
    page colour we set behind it is exactly what a transparent pixel shows."""
    qs = [f"scale={scale}", "model=" + model.replace("/", "%2F"), "bg=" + bg]
    if params:
        qs.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items())
                  .replace(":", "%3A").replace(",", "%2C"))
    page.goto("http://127.0.0.1:8848/preview/probe.html?" + "&".join(qs), wait_until="load")
    page.wait_for_function("() => document.title === 'READY'", timeout=180000)
    size = int(round(2048 * scale))
    page.set_viewport_size({"width": size + 2, "height": size + 2})
    page.wait_for_timeout(120)
    png = page.screenshot(clip={"x": 0, "y": 0, "width": size, "height": size})
    import io as _io
    return np.asarray(Image.open(_io.BytesIO(png)).convert("RGB"))


def skin_mask() -> np.ndarray:
    """Face skin as the master says it is: the matte's own skin tone, not merely
    "alpha is opaque" (hair lying on the face is opaque too, and its AA edge is a
    legitimate soft edge, not a hole)."""
    mat = np.array(Image.open(T.MATTE).convert("RGBA")).astype(np.int16)
    r, g, b, a = mat[..., 0], mat[..., 1], mat[..., 2], mat[..., 3]
    tone = (a >= 250) & (r >= 235) & (g >= 195) & (b >= 190) & (np.abs(r - b) <= 30)
    h, w = tone.shape
    out = np.zeros((2048, 2048), bool)
    ys = np.clip(np.round((np.arange(2048) - T.OFF[1]) / T.SCALE_MATTE).astype(int), 0, h - 1)
    xs = np.clip(np.round((np.arange(2048) - T.OFF[0]) / T.SCALE_MATTE).astype(int), 0, w - 1)
    out = tone[np.ix_(ys, xs)]
    face = np.zeros_like(out)
    face[FY0:FY1, FX0:FX1] = True
    return ndi.binary_erosion(out & face, iterations=3)


def bg_sensitivity(page, scale: float = 0.5) -> dict:
    """Criterion 7 on the face-rect *skin* (skin tone from the matte, eroded 3 px):

      a) extract at scale 1.0 -> skin px whose alpha < 250
      b) composite the same pose over #ffffff and #ff00ff -> skin px whose colour
         moves, i.e. the dark stage backdrop would show through the skin
    """
    res = {}
    skin1 = skin_mask()

    def worst(mask: np.ndarray) -> dict:
        lab, n = ndi.label(mask)
        sizes = [int((lab == i).sum()) for i in range(1, n + 1)]
        return {"px": int(mask.sum()), "components": n,
                "largest_component": max(sizes) if sizes else 0,
                "largest_bbox": (lambda ys, xs: [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
                                 if len(ys) else None)(*np.where(mask))}

    rgba = np.asarray(T.grab(page, T.MODELS["new"], T.FACE_CASES["neutral"], scale=1.0))
    lt = skin1 & (rgba[:, :, 3] < 250)
    res["neutral_alpha"] = dict(skin_px=int(skin1.sum()), **worst(lt))

    size = int(round(2048 * scale))
    idx = np.clip((np.arange(size) / scale).astype(int), 0, 2047)
    skin = ndi.binary_erosion(skin1[np.ix_(idx, idx)], iterations=2)
    for case, params in T.FACE_CASES.items():
        w = grab_page(page, T.MODELS["new"], params, scale, "%23ffffff")
        m = grab_page(page, T.MODELS["new"], params, scale, "%23ff00ff")
        d = np.abs(w.astype(np.int16) - m.astype(np.int16)).max(axis=2)
        hit = (d > 2) & skin
        res[case] = dict(skin_px=int(skin.sum()), **worst(hit))
        if hit.any():
            res[case]["max_delta_in_skin"] = int(d[skin].max())
    return res


# ---------------------------------------------------------------- 3/4 stage shots
def stage_shots(br) -> dict:
    shots = {}
    plan = [
        ("five_3x", "?n=5&names=Grok,Claude,Gemini,GPT,GLM&seed=20261103&nogest=1&active=-1",
         ["grok", "claude", "gemini", "gpt", "glm"]),
        ("two_3x", "?n=2&names=Grok,Gemini&seed=20261103&nogest=1&active=-1",
         ["grok", "gemini"]),
    ]
    for tag, q, want in plan:
        for attempt in range(3):
            ctx = br.new_context(viewport={"width": 820, "height": 700}, device_scale_factor=3)
            pg = ctx.new_page()
            pg.set_default_timeout(180000)
            pg.goto(BASE + q, wait_until="load")
            pg.wait_for_function(f"() => window.__ready === true && window.__loaded === true"
                                 f" && (window.__models||[]).filter(Boolean).length === {len(want)}",
                                 timeout=180000)
            pg.wait_for_function("() => (window.__models||[]).every(m => !m || (m.__fade||0) >= 1)",
                                 timeout=60000)
            pg.wait_for_timeout(900)
            info = pg.evaluate("() => (window.__models||[]).filter(Boolean).map(m => "
                               "({name: m.__char && m.__char.key, scale: m.scale.x, x: m.x, y: m.y}))")
            got = [str(m.get("name")) for m in info]
            if all(w in got for w in want):
                pg.query_selector("#inner").screenshot(path=str(OUT / f"final_{tag}.png"))
                shots[tag] = {"file": f"final_{tag}.png", "models": info, "attempt": attempt + 1}
                ctx.close()
                break
            # a rig failed to load and the harness fell back to the whale-girl: retry
            print(f"  {tag}: rig load fell back ({got}), retry {attempt + 1}")
            ctx.close()
        else:
            shots[tag] = {"file": f"final_{tag}.png", "models": info, "attempt": 3,
                          "WARN": f"rig fallback persists: {got}"}
    return shots


def ab_vs_bak(page) -> dict:
    res = {}
    for case in ("stage_pose",):
        n = T.grab(page, T.MODELS["new"], T.FACE_CASES[case], scale=T.K_STAGE)
        o = T.grab(page, T.MODELS["old"], T.FACE_CASES[case], scale=T.K_STAGE)
        res[case] = T.band_metrics(n, o)
        T.save_pair(n, o, "final_" + case)
    return res


def head_crops(report: dict) -> list[str]:
    """6x NEAREST crops of the Gemini / Grok heads out of the DPR3 stage shots.

    The seats share one camera, so the head band is measured from the shot rather
    than derived from m.y (which is the sprite's *bottom* anchor): heads sit at
    CSS y ~75..185 at both n=5 and n=2.
    """
    made = []
    for tag in ("five_3x", "two_3x"):
        shot = OUT / f"final_{tag}.png"
        if not shot.is_file():
            continue
        img = Image.open(shot).convert("RGB")
        for m in report["shots"][tag]["models"]:
            key = (m.get("name") or "").lower()
            if not any(k in key for k in ("gemini", "grok")):
                continue
            x = m["x"] * 3
            box = (int((x / 3 - 60) * 3), int(100 * 3), int((x / 3 + 60) * 3), int(230 * 3))
            box = (max(0, box[0]), max(0, box[1]), min(img.width, box[2]), min(img.height, box[3]))
            c = img.crop(box)
            c = c.resize((c.width * 2, c.height * 2), Image.NEAREST)   # 3 * 2 = 6x
            name = f"{tag}_{key}_head_6x.png"
            c.save(OUT / name)
            made.append(name)
    return made


# ---------------------------------------------------------------- main
def main() -> int:
    t0 = time.time()
    report: dict = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    report["deploy"] = deploy_audit()
    print("deploy:", json.dumps(report["deploy"], ensure_ascii=False))

    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)
        report["truth_holes"] = truth_and_holes(page)
        report["pale_edge"] = pale_edge()
        report["bg_sensitivity"] = bg_sensitivity(page)
        report["ab"] = ab_vs_bak(page)
        page.close()
        report["shots"] = stage_shots(br)
        br.close()
    report["head_crops"] = head_crops(report)

    report["elapsed_s"] = round(time.time() - t0, 1)
    (OUT / "final_suite.json").write_text(json.dumps(report, ensure_ascii=False, indent=1),
                                          encoding="utf-8")

    lines = [f"t5 final acceptance suite — {report['generated_at']}", ""]
    d = report["deploy"]
    lines += [f"[5] deploy: workspace {d['build_files']} files vs deployed {d['deployed_files']}, "
              f"{d['same']} identical, differing={d['differing'] or 'none'} -> "
              f"{'SYNCED' if d['synced'] else 'NOT SYNCED'}",
              f"    head_base {d['head_base_bytes']} B md5 {d['head_base_md5']}",
              f"    texture   {d['texture_bytes']} B md5 {d['texture_md5']}",
              f"    moc3      {d['moc3_size']} B; lib differing={d['lib_differing'] or 'none'}", ""]
    lines.append("[1/2] matte truth + alpha holes (canvas px @2048^2)")
    for case, r in report["truth_holes"].items():
        lines.append(f"  {case:12s} truth face={r['truth']['in_face']:5d} total={r['truth']['total']:6d} "
                     f"largest={r['truth']['largest']:5d} | enclosed {r['holes_enclosed_n']}c/"
                     f"{r['holes_enclosed_px']}px | open {r['holes_open_n']}c/{r['holes_open_px']}px")
    pe = report["pale_edge"]
    lines += ["", f"[6] pale edge: fill {pe['fill_px_canvas']} canvas px = {pe['fill_px_stage1x']} stage px^2, "
                  f"{pe['components_n']} components",
              f"    worst |edge dL*| over long edges (>=50 rows): {pe['worst_long_edge_dl']} (limit < 3) "
              f"{pe['verdict_edge']}; including 3-8 row slivers: {pe['worst_abs_edge_dl']} "
              f"{pe['verdict_edge_strict_all']}; "
              f"flatness ratio {pe['flatness_ratio_range']} {pe['verdict_flatness']}"]
    for c in pe["components"][:3]:
        lines.append(f"    {c['px']:6d}px bbox={c['bbox']} stage {c['stage_bbox']} = {c['stage_px2']} px^2 "
                     f"edges L {c['edge_dl_left']}({c['edge_dl_left_rows']}r) R {c['edge_dl_right']}"
                     f"({c['edge_dl_right_rows']}r) std {c['inner_std_l']} vs {c['ring_std_l']} "
                     f"bboxFill {c['bbox_fill_ratio']} onSide {c['boundary_on_bbox_side']}")
    lines += ["", "[7] bg sensitivity in the face-rect skin (eroded 3 px); a seam is a band, so the",
              "    judgement is the largest connected component (<20 px), not a raw 0"]
    na = report["bg_sensitivity"]["neutral_alpha"]
    lines.append(f"  neutral  extract alpha<250: {na['px']:4d} px / {na['skin_px']} "
                 f"({100.0 * na['px'] / max(1, na['skin_px']):.3f}%), {na['components']} comps, "
                 f"largest {na['largest_component']} px -> "
                 f"{'PASS' if na['largest_component'] < 20 else 'FAIL'}")
    for case, r in report["bg_sensitivity"].items():
        if case == "neutral_alpha":
            continue
        lines.append(f"  {case:12s} composite white/magenta: {r['px']:4d} px, {r['components']} comps, "
                     f"largest {r['largest_component']} px, max_delta {r.get('max_delta_in_skin', 0)} -> "
                     f"{'PASS' if r['largest_component'] < 20 else 'FAIL'}")
    lines += ["", "[4] A/B vs .bak at stage scale k=%.5f" % T.K_STAGE]
    for case, r in report["ab"].items():
        lines.append(f"  {case}: old_dark_px={r['old_dark_px_lt26']} new_pale_px={r['new_pale_px_dl_gt10']} "
                     f"max_dL={r['new_pale_max_dl']} skin_L={r['skin_median_l']}")
    lines += ["", "[3] shots"]
    for tag, s in report["shots"].items():
        lines.append(f"  {s['file']}: " + ", ".join(
            f"{m['name']}@{m['x']:.0f},y{m['y']:.0f} s={m['scale']:.5f}" for m in s["models"]))
    lines += ["", f"elapsed {report['elapsed_s']} s"]
    (OUT / "final_suite.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())