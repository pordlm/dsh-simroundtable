# -*- coding: utf-8 -*-
"""Run the seam / black-frame audit over one or more Live2D builds.

    C:\\dev\\python 3.12.0\\python.exe preview\\_diag\\_audit\\run_audit.py --chars all
    C:\\dev\\python 3.12.0\\python.exe preview\\_diag\\_audit\\run_audit.py \
        --chars gemini --poses neutral,stage_pose,anglex_m10 --bg neutral

Every number comes from a 1:1 (scale=1.0, 2048x2048) render with alpha; see
README.md for the thresholds and their provenance.  Exit code 1 means at least
one criterion failed, so this can be used as a gate in a build script.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _audit import common as C          # noqa: E402
from _audit import metrics as M         # noqa: E402

DEFAULT_OUT = C.AUDIT_DIR / "out"


def check_server(url: str) -> None:
    try:
        urllib.request.urlopen(url + "/preview/probe.html", timeout=5).read(200)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            f"probe.html is not reachable at {url} ({exc}).\n"
            "Start the static server first, e.g.\n"
            "  C:\\dev\\python 3.12.0\\python.exe -m http.server 8848 --bind 127.0.0.1") from exc


def defect_overlay(rgba: np.ndarray, truth_mask: np.ndarray, seam: dict | None,
                   edges: list[dict], hole_mask: np.ndarray | None = None) -> np.ndarray:
    """Composite the frame over the stage colour and mark what failed."""
    rgb = C.composite(rgba).astype(np.uint8)
    out = np.dstack([rgb, np.full(rgb.shape[:2], 255, np.uint8)])
    out[truth_mask] = [255, 0, 0, 255]        # matte says opaque, render is not
    if hole_mask is not None and hole_mask.any():
        m = ndi.binary_dilation(hole_mask, iterations=1)
        out[m] = [255, 235, 0, 255]           # enclosed hole (alpha < 0.5)
    if seam is not None and seam["stage_px"]:
        m = seam["mask_stage"]
        ys, xs = np.where(m)
        s = seam["scale"]
        out[(ys * s).astype(int), (xs * s).astype(int)] = [0, 255, 255, 255]
    for e in edges:
        if e["rows"] >= M.EDGE_LONG_ROWS:
            bx = e["bbox"]
            x = bx[0] if e["side"] == "left" else bx[2]
            out[bx[1]:bx[3] + 1, max(0, x - 1):x + 2] = [255, 0, 255, 255]
    return out


def audit_rig(page, rig, poses, bg_poses, out_dir: Path, mip: bool) -> dict:
    win = rig.window()
    # If the mapped matte does not agree with the layout's part union on some
    # side, the matte is not the same artwork at the same scale (glm/qwen are
    # 141-172 px wide of their build).  A truth number from it would report
    # "missing pixels" that are really a mapping error, so it is disabled.
    truth_off = None
    if rig.map_residual and max(abs(v) for v in rig.map_residual) > 8:
        truth_off = ("matte/layout bbox mismatch %+d/%+d/%+d/%+d px"
                     % rig.map_residual)
    ref = C.ref_alpha(rig) if (rig.has_truth and truth_off is None) else None
    skin, skin_kind = (M.skin_mask(rig, ref, win) if ref is not None else (None, "n/a"))
    plate = M.plate_canvas(rig)
    ref_plate, ref_label = (M.reference_plate(rig) if plate is not None else (None, "no plate"))
    res: dict = {
        "key": rig.key,
        "build": rig.build.relative_to(C.ROOT).as_posix(),
        "model3": rig.model3.relative_to(C.ROOT).as_posix(),
        "layout": rig.layout.relative_to(C.ROOT).as_posix() if rig.layout else None,
        "matte": rig.matte.relative_to(C.ROOT).as_posix() if rig.matte else None,
        "face_rect": rig.face, "window": list(win),
        "mapping": rig.mapping, "union_bbox": list(rig.union_bbox) if rig.union_bbox else None,
        "notes": rig.notes + ([f"truth disabled: {truth_off}"] if truth_off else []),
        "has_truth": rig.has_truth,
        "truth_disabled": truth_off,
        "has_plate": plate is not None, "plate_reference": ref_label,
        "skin_mask_px": int(skin.sum()) if skin is not None else None,
        "skin_mask_kind": skin_kind,
        "poses": {},
    }
    # neutral is measured first: posed frames are judged as "aligned residual
    # vs the neutral frame +10%", so the baseline has to exist before them
    order = ["neutral"] + [p for p in poses if p != "neutral"]
    neutral_truth = None
    for pose in order:
        params = C.pose_params(pose, rig.params)
        rgba_img = C.grab(page, rig, params, scale=1.0, mip=mip)
        rgba = np.asarray(rgba_img)
        if ref is None:
            truth = {"in_window": None, "total": None, "components_ge12px": None,
                     "largest": None, "limit": None,
                     "mask": np.zeros((C.CANVAS, C.CANVAS), bool)}
        elif pose == "neutral":
            truth = M.truth_defect(rgba, ref, win)
            truth["raw_in_window"] = truth["in_window"]
            truth["shift"] = [0, 0]
            truth["limit"] = M.TRUTH_LIMIT[pose]
            neutral_truth = truth["in_window"]
        else:
            al = M.aligned_truth(rgba, ref, win, max_shift=16)
            truth = M.truth_defect(rgba, ref, win)      # mask for the overlay
            truth["raw_in_window"] = al["raw"]
            truth["in_window"] = al["in_window"]
            truth["shift"] = al["shift"]
            base = neutral_truth if neutral_truth is not None else 0
            truth["limit"] = max(M.TRUTH_LIMIT[pose], int(round(1.10 * base)))
        hole = (M.holes(rgba, win, ref_a=ref, exempt_below=128)
                if ref is not None else M.holes(rgba, win))
        dark = M.dark_seam(rgba, win)
        # Bleed is a TEXTURE property (which colour got painted where), so it is
        # measured on the neutral frame only.  The ring comes from the layout's
        # static face part; in a posed frame the head deforms tens of px away from
        # it, so the ring lands on hair/face indiscriminately and reports
        # thousands of false positives (t11: 2592 px on stage_pose, largest 621).
        bleed = M.bleed_mask(rig, rgba) if pose == "neutral" else None
        edge = (M.fill_boundary_edges(plate, ref_plate, rgba, win, "plate")
                if plate is not None and ref_plate is not None else None)
        edge_render = (M.fill_boundary_edges(plate, ref_plate, rgba, win, "render")
                       if plate is not None and ref_plate is not None else None)
        steps = M.straight_steps(rgba, win)
        flat = M.flatness(rgba, rig.face) if rig.face else None

        bg = None
        if pose in bg_poses and skin is not None:
            size = int(round(C.CANVAS * 0.5))
            idx = np.clip((np.arange(size) / 0.5).astype(int), 0, C.CANVAS - 1)
            skin_half = M.ndi.binary_erosion(skin[np.ix_(idx, idx)], iterations=2)
            white = C.grab_composite(page, rig, params, 0.5, "%23ffffff")
            magenta = C.grab_composite(page, rig, params, 0.5, "%23ff00ff")
            d = np.abs(white.astype(np.int16) - magenta.astype(np.int16)).max(axis=2)
            hit = (d > 2) & skin_half
            bg = M.group_stats(hit)
            bg["skin_px_half"] = int(skin_half.sum())
            bg["max_delta"] = int(d[skin_half].max()) if skin_half.any() else 0
            alpha_bad = skin & (rgba[:, :, 3] < 250)
            bg["alpha_below_250"] = M.group_stats(alpha_bad)

        v = M.verdicts(pose, truth, hole, dark, edge, bg, bleed)
        entry = {
            "params": params,
            "truth": {k: truth[k] for k in
                      ("in_window", "total", "components_ge12px", "largest")}
            | {k: truth.get(k) for k in ("raw_in_window", "shift", "limit")},
            "holes": {k: hole[k] for k in
                      ("enclosed_n", "enclosed_px", "largest_enclosed_px",
                       "open_n", "open_px", "window_solid", "enclosed_px_raw",
                       "exempt_below")},
            "dark": {k: dark[k] for k in
                     ("stage_px", "components", "largest", "dark_px_stage",
                      "dark_px_fullres")},
            "edge": (None if edge is None else
                     {k: edge[k] for k in ("fill_px", "edges_n", "long_edges_n",
                                           "worst_long", "worst_any",
                                           "long_edge_min_rows")}),
            "edge_components": None if edge is None else edge["components"][:6],
            "edge_long_edges": None if edge is None else edge["long_edges"],
            "edge_render": (None if edge_render is None else
                            {k: edge_render[k] for k in
                             ("worst_long", "worst_any", "long_edges_n")}),
            "advisory_steps": steps["steps"][:6],
            "flatness": flat,
            "bleed": None if bleed is None else
                     {k: bleed[k] for k in ("px", "components", "largest", "bbox",
                                            "ring_px", "pass")},
            "bg": bg,
            "verdict": v,
            "pass": v["pass"],
        }
        res["poses"][pose] = entry
        bad = [k for k, s in v.items() if s == "FAIL"]
        overlay = defect_overlay(rgba, truth["mask"], dark,
                                 edge["long_edges"] if edge else [],
                                 hole["mask"] if "holes" in bad else None) if bad else None
        if overlay is not None:
            p = out_dir / f"{rig.key}_{pose}_defects.png"
            C.save_png(p, overlay)
            entry["defect_png"] = p.name
        dl = f"{entry['edge']['worst_long']:.2f}" if entry["edge"] else "  n/a"
        tval = entry["truth"]["in_window"]
        tl = f"{tval}/{M.TRUTH_LIMIT[pose]}" if tval is not None else "n/a"
        print(f"  {rig.key:10s} {pose:11s} truth={tl:>9s}"
              f" holes={entry['holes']['enclosed_px']:>4d}px"
              f" open={entry['holes']['open_px']:>3d}px"
              f" seam={entry['dark']['stage_px']:>3d}px/{entry['dark']['largest']:<3d}"
              f" dL*={dl:>5s}"
              f" bleed={(entry['bleed']['px'] if entry['bleed'] else -1):>4d}px/"
              f"{(entry['bleed']['largest'] if entry['bleed'] else -1):<3d}"
              f" -> {'PASS' if entry['pass'] else 'FAIL:' + ','.join(bad)}", flush=True)
    fails = [p for p, e in res["poses"].items() if not e["pass"]]
    res["pass"] = not fails
    res["failed_poses"] = fails
    return res


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chars", default="all", help="comma list, or 'all'")
    ap.add_argument("--poses", default="all", help="comma list from: " + ",".join(C.POSES))
    ap.add_argument("--bg", default="neutral,stage_pose",
                    help="poses for the white/magenta backdrop check ('none' to skip)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--mip", action="store_true", help="enable mipmapping (atlas minify)")
    ap.add_argument("--no-gate", action="store_true", help="always exit 0")
    args = ap.parse_args()

    check_server(C.BASE_URL)
    rigs = C.discover_rigs()
    if args.chars == "all":
        # Round-2 scope (captain, t2): the newly built rigs only.  The rest were
        # accepted in earlier rounds and are not re-measured here; they are still
        # listed in the report so the table reads as complete.
        verified = ("claude", "claude-book", "claude-nomouthopen", "gpt",
                    "grok", "deepseek", "whale-girl", "gemini")
        want, skipped, verify_out = [], {}, {}
        for k, r in rigs.items():
            if k in verified or k.split("-")[0] in verified:
                verify_out[k] = "已验收，本轮不复测"
            elif r.layout is None:
                skipped[k] = "no layout/face json"
            else:
                want.append(k)
        for k, why in verify_out.items():
            print(f"skip {k}: {why}", flush=True)
        for k, why in skipped.items():
            print(f"skip {k}: {why}", flush=True)
    else:
        verify_out, skipped = {}, {}
        want = [c.strip() for c in args.chars.split(",")]
    missing = [c for c in want if c not in rigs]
    if missing:
        raise SystemExit(f"unknown character(s) {missing}; known: {sorted(rigs)}")
    poses = list(C.POSES) if args.poses == "all" else [p.strip() for p in args.poses.split(",")]
    bad = [p for p in poses if p not in C.POSES]
    if bad:
        raise SystemExit(f"unknown pose(s) {bad}; known: {list(C.POSES)}")
    bg_poses = [] if args.bg.lower() in ("none", "") else \
        [p.strip() for p in args.bg.split(",")]

    out_dir = Path(args.out)
    if args.out == str(DEFAULT_OUT) and args.chars != "all":
        # A partial run must not clobber the batch table: keep `out/audit.*`
        # for `--chars all` and drop ad-hoc runs into `out/runs/<slug>/`.
        slug = args.chars.replace(",", "+").replace("*", "x")
        out_dir = out_dir / "runs" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    report = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
              "protocol": {"scale": 1.0, "canvas": C.CANVAS,
                           "extract": "renderer.extract.base64(app.stage,'image/png')",
                           "thresholds": {
                               "truth": M.TRUTH_LIMIT,
                               "hole_total": M.HOLE_TOTAL_LIMIT,
                               "hole_largest": M.HOLE_LARGEST_LIMIT,
                               "hole_open": M.HOLE_OPEN_LIMIT,
                               "dark_seam_px": M.DARK_SEAM_LIMIT,
                               "dark_seam_component": M.DARK_SEAM_COMPONENT,
                               "dark_seam_gap": M.DARK_SEAM_GAP,
                               "edge_dl": M.EDGE_DL_LIMIT,
                               "edge_long_rows": M.EDGE_LONG_ROWS,
                               "bg_component": M.BG_COMPONENT_LIMIT}},
              "rigs": {},
              "not_rerun": verify_out, "skipped": skipped}

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="msedge", headless=True,
                                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)
        for key in want:
            print(f"[{key}] {rigs[key].model3.relative_to(C.ROOT)}", flush=True)
            report["rigs"][key] = audit_rig(page, rigs[key], poses, bg_poses,
                                           out_dir, args.mip)
        br.close()

    report["elapsed_s"] = round(time.time() - t0, 1)
    all_pass = all(r["pass"] for r in report["rigs"].values())
    (out_dir / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=1),
                                        encoding="utf-8")

    lines = [f"# seam / black-frame audit -- {report['generated_at']}", ""]
    if not report["not_rerun"]:
        pass
    else:
        lines.append("已验收、本轮不复测："
                     + "、".join(f"`{k}`" for k in report["not_rerun"]))
        if report.get("skipped"):
            lines.append("无 layout/face、不适用本套判据："
                         + "、".join(f"`{k}`" for k in report["skipped"]))
        lines.append("")
    for key, r in report["rigs"].items():
        lines.append(f"## {key}  ({'PASS' if r['pass'] else 'FAIL'})")
        lines.append(f"- build `{r['build']}`  layout `{r['layout']}`  "
                     f"matte `{r['matte']}`")
        if r["mapping"]:
            mp = r["mapping"]
            lines.append(f"- matte map k={mp['scale']:.4f} dx={mp['dx']:.2f} dy={mp['dy']:.2f}")
        lines.append(f"- plate: {'yes' if r['has_plate'] else 'no'}  "
                     f"fill reference: {r['plate_reference']}")
        for note in r["notes"]:
            lines.append(f"- note: {note}")
        lines.append("")
        lines.append("| pose | truth px (limit) | holes px/n/open | seam px/max | "
                     "bleed px/max | fill dL* | advisory step max | verdict |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for pose, e in r["poses"].items():
            t = e["truth"]["in_window"]
            h = e["holes"]
            tv = f"{t} ({M.TRUTH_LIMIT[pose]})" if t is not None else "n/a"
            dl = f"{e['edge']['worst_long']} ({e['edge']['long_edges_n']} long)" \
                if e["edge"] else "n/a"
            bl = (f"{e['bleed']['px']}/{e['bleed']['largest']}"
                  if e.get("bleed") else "n/a")
            adv = max((abs(s["dl_median"]) for s in e["advisory_steps"]), default=0.0)
            lines.append(
                f"| {pose} | {tv} | "
                f"{h['enclosed_px']}/{h['enclosed_n']}/{h['open_px']} | "
                f"{e['dark']['stage_px']}/{e['dark']['largest']} | "
                f"{bl} | "
                f"{dl} | {adv:.2f} | "
                f"{'PASS' if e['pass'] else 'FAIL'} |")
        lines.append("")
    (out_dir / "audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print()
    print("\n".join(lines))
    print(f"elapsed {report['elapsed_s']} s -> {out_dir/'audit.json'}")
    if not all_pass and not args.no_gate:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

