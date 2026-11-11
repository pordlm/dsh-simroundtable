"""Round-2 correction pass for the audit table (captain m00768 / advisor m00772).

Three things change versus the first pass:

1. head_base is judged from the CURRENT layout
   (`assets/build/<name>-layout/<name>.layout.json`), not from the stale
   manifest embedded in the build.  It exists for dounai / kimi / kimi-prop /
   mimo / mimo-prop / minimax / minimax-prop, and genuinely does not for
   glm / qwen.
2. The straight-edge dL* metric needs a *reference* plate (pale_edge compares
   the new fill against the pre-fix plate).  No new rig has a pre-fix build, so
   the metric is not computable -- it stays n/a with that reason instead of
   being read as a pass.  Two self-contained substitutes were tried on the
   gemini anchor (where the answer is 8.1) and both return 0, so they are not
   promoted to gates.
3. "Solid hole" gets a mother-art alpha exemption: a transparent gap where the
   mother art is itself transparent (alpha < 128, i.e. hair<->body negative
   space) is not a defect.  Raw and exempted numbers are both kept.

Writes `out/recheck.json`; `_make_report.py` merges it into README_audit.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_diag"))

import numpy as np
from playwright.sync_api import sync_playwright

from _audit import common as C
from _audit import metrics as M

CHARS = ["dounai", "glm", "kimi", "kimi-prop", "mimo", "mimo-prop",
         "minimax", "minimax-prop", "qwen"]
POSES = ["neutral", "stage_pose"]
EXEMPT_BELOW = 128.0 / 255.0  # ref alpha is 0..1 (t5 scale), 128/255 = 0.502
OUT = HERE.parents[1] / "_diag" / "_audit" / "out" / "recheck.json"


def head_base_state(rig) -> dict:
    """Does the CURRENT layout declare a head base, and does its image exist?"""
    lay = rig.layout
    info = {"layout": str(lay.relative_to(C.ROOT)) if lay else None,
            "declared": False, "image": None, "exists": False}
    if lay is None or not lay.exists():
        return info
    man = json.loads(lay.read_text(encoding="utf-8"))
    for layer in man.get("layers", []):
        name = str(layer.get("name", "")).strip().lower()
        if name in M.PLATE_HINTS:
            info["declared"] = True
            rel = layer["image"]["path"]
            info["image"] = rel
            for base in (lay.parent, rig.build):
                if (base / rel).exists():
                    info["exists"] = True
                    break
    return info


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chars", default=",".join(CHARS),
                    help="comma list (default: the 9 t2 rigs)")
    ap.add_argument("--poses", default=",".join(POSES),
                    help="comma list of poses to recompute")
    ap.add_argument("--merge", action="store_true",
                    help="keep rigs/poses already in recheck.json")
    args = ap.parse_args()
    chars = [c.strip() for c in args.chars.split(",") if c.strip()]
    poses = [p.strip() for p in args.poses.split(",") if p.strip()]
    rigs = C.discover_rigs()
    out = {"exempt_below": EXEMPT_BELOW,
           "generated_at": __import__("datetime").datetime.now()
           .isoformat(timespec="seconds"), "chars": {}}
    if args.merge and OUT.exists():
        out["chars"] = json.loads(OUT.read_text(encoding="utf-8")).get("chars", {})
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="msedge", args=["--use-gl=swiftshader", "--disable-gpu"])
        page = browser.new_page()
        for ch in chars:
            rig = rigs[ch]
            win = rig.window()
            ref = C.ref_alpha(rig) if rig.has_truth else None
            st = {}
            for f in (rig.layout, rig.model3):
                if f is not None and f.exists():
                    stat = f.stat()
                    st[f.name] = {"mtime": __import__("datetime").datetime
                                  .fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
                                  "size": stat.st_size}
            entry = {"pose": {}, "head_base": head_base_state(rig),
                     "truth": bool(rig.has_truth),
                     "window": list(win), "build_state": st}
            prev = dict(entry["pose"]) if args.merge else {}
            for pose in poses:
                img = C.grab(page, rig, C.pose_params(pose, rig.params))
                rgba = np.asarray(img.convert("RGBA"))
                raw = M.holes(rgba, win)
                ex = M.holes(rgba, win, ref_a=ref, exempt_below=EXEMPT_BELOW) \
                    if ref is not None else None
                dark = M.dark_seam(rgba, win)
                # matte-truth defect on the SAME frame/build as the holes: the
                # builds are being rewritten while we audit, so a truth number
                # from outro run would not belong to this row.
                tr = (M.truth_defect(rgba, ref, win)
                      if ref is not None else None)
                entry["pose"][pose] = {
                    "holes_raw": {k: raw[k] for k in
                                  ("enclosed_n", "enclosed_px", "largest_enclosed_px")},
                    "holes_exempt": ({k: ex[k] for k in
                                      ("enclosed_n", "enclosed_px", "largest_enclosed_px")}
                                     if ex else None),
                    "components": ex["components"][:5] if ex else raw["components"][:5],
                    "open_px": raw["open_px"], "open_n": raw["open_n"],
                    "window_solid": raw["window_solid"],
                    "truth_in_window": (tr or {}).get("in_window"),
                    "seam_px": dark["stage_px"], "seam_largest": dark["largest"],
                    "seam_dark_stage": dark["dark_px_stage"],
                }
                print(f"{ch:12s} {pose:11s} raw={raw['enclosed_px']:5d}/"
                      f"{raw['largest_enclosed_px']:4d}  exempt="
                      f"{(ex['enclosed_px'] if ex else -1):5d}/"
                      f"{(ex['largest_enclosed_px'] if ex else -1):4d}  "
                      f"seam={dark['stage_px']}", flush=True)
            # dL* is only computable when a pre-fix plate exists
            plate = M.plate_layer(rig)
            refp = M.reference_plate(rig)
            if plate is None:
                entry["dlstar"] = {"status": "n/a",
                                   "reason": "当前 layout 无 head base 层，判据（填色↔发际 dL*）无载体"}
            elif refp is not None and refp[0] is not None:
                entry["dlstar"] = {"status": "measurable",
                                   "reference": refp[1]}
            else:
                entry["dlstar"] = {
                    "status": "n/a",
                    "reason": "有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），"
                              "新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据",
                    "plate": plate[1].name}
            entry["pose"] = {**prev, **entry["pose"]}
            out["chars"][ch] = entry
        browser.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())