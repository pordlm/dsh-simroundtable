# -*- coding: utf-8 -*-
"""t5: structural check of the shipped Gemini head_base plate (no browser needed).

Independently re-measures the t4 claim on the *current* build:
  * head_base alpha coverage inside the face rect (old vs new)
  * the 12 px halo ring around the face rect (the anti-shift margin)
  * dark pixels inside the filled area (a light plate must not read as a frame)
  * every file the model descriptor names must exist, in assets/ and deployed/

Writes preview/_evidence/t5/plate_check.json + plate_check.txt.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
OUT.mkdir(parents=True, exist_ok=True)
CANVAS = 2048


def load_plate(layout: Path):
    man = json.loads((layout / "gemini.layout.json").read_text(encoding="utf-8"))
    rects = {l["name"]: l["rect"] for l in man["layers"]}
    plate = np.asarray(Image.open(layout / "parts" / "head_base.png").convert("RGBA"))
    return man, rects, plate


def place(arr: np.ndarray, rect: dict) -> np.ndarray:
    out = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    out[rect["top"]:rect["top"] + arr.shape[0], rect["left"]:rect["left"] + arr.shape[1]] = arr
    return out


def mask_rect(rect: dict, pad: int = 0) -> np.ndarray:
    m = np.zeros((CANVAS, CANVAS), bool)
    m[rect["top"] - pad:rect["top"] + rect["height"] + pad,
      rect["left"] - pad:rect["left"] + rect["width"] + pad] = True
    return m


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def describe(tag: str, layout: Path, rects: dict, plate: np.ndarray) -> dict:
    full = place(plate, rects["head base"])
    a = full[..., 3]
    face = rects["face"]
    fr = mask_rect(face)
    ring = mask_rect(face, 12) & ~fr
    lum = full[..., :3].astype(np.float32).mean(axis=2)
    opaque = a >= 250
    opaque_in_face = fr & opaque
    res = {
        "layout": str(layout),
        "plate_png_bytes": int((layout / "parts" / "head_base.png").stat().st_size),
        "plate_md5": md5(layout / "parts" / "head_base.png"),
        "face_rect": face,
        "frac_opaque_in_face": round(float(opaque_in_face.sum()) / float(fr.sum()), 4),
        "frac_transparent_in_face": round(float((fr & (a < 8)).sum()) / float(fr.sum()), 4),
        "frac_opaque_in_12px_ring": round(float((ring & opaque).sum()) / float(ring.sum()), 4),
        "opaque_lum_min": int(lum[opaque].min()),
        "opaque_lum_p1": round(float(np.percentile(lum[opaque], 1)), 1),
        "opaque_lum_median": round(float(np.percentile(lum[opaque], 50)), 1),
        "opaque_dark_lt60_px": int((lum[opaque] < 60).sum()),
        "dark_in_face_opaque_px": int((fr & opaque & (lum < 60)).sum()),
    }
    print(f"== {tag} ==")
    for k, v in res.items():
        print(f"  {k}: {v}")
    return res


def descriptor_audit(build: Path) -> dict:
    desc = json.loads((build / "gemini.layout.model3.json").read_text(encoding="utf-8"))
    refs = desc.get("FileReferences") or {}
    wanted = [refs.get("Moc"), refs.get("Physics"), *((refs.get("Textures") or []))]
    files = {}
    for rel in wanted:
        if not rel:
            continue
        p = build / rel
        files[rel] = {"exists": p.is_file(), "bytes": int(p.stat().st_size) if p.is_file() else 0}
    return {"descriptor": str(build / "gemini.layout.model3.json"), "files": files,
            "groups": desc.get("Groups")}


def main() -> int:
    new_layout = ROOT / "assets" / "build" / "gemini-v1"
    old_layout = ROOT / "assets" / "build" / "gemini-v1.bak"
    dep_layout = ROOT / "deployed" / "dsh-roundtable" / "assets" / "build" / "gemini-v1"

    _, rects_new, plate_new = load_plate(new_layout)
    _, rects_old, plate_old = load_plate(old_layout)
    # The only intended manifest change is the head_base crop (it is re-derived
    # from the new forced mask).  Every other layer must keep its rect or the two
    # rigs are not A/B comparable.
    diff = {k: (rects_old.get(k), rects_new.get(k)) for k in set(rects_old) | set(rects_new)
            if rects_old.get(k) != rects_new.get(k)}
    assert set(diff) <= {"head base"}, f"unexpected layout change: {diff}"
    print(f"layout diff (expected only head base): {diff}")

    report = {
        "old": describe("old (gemini-v1.bak)", old_layout, rects_old, plate_old),
        "new": describe("new (gemini-v1)", new_layout, rects_new, plate_new),
        "deployed": describe("deployed", dep_layout, rects_new,
                             np.asarray(Image.open(dep_layout / "parts" / "head_base.png").convert("RGBA"))),
        "descriptor_new": descriptor_audit(new_layout),
        "descriptor_deployed": descriptor_audit(dep_layout),
    }

    # byte-for-byte sync between the working tree and the deployed copy
    sync = {}
    for p in sorted(new_layout.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(new_layout).as_posix()
        q = dep_layout / rel
        sync[rel] = {
            "bytes": int(p.stat().st_size),
            "same": bool(q.is_file()) and md5(p) == md5(q),
        }
    report["sync_with_deployed"] = sync
    bad = [k for k, v in sync.items() if not v["same"]]
    report["sync_all_same"] = not bad
    report["sync_mismatch"] = bad
    print(f"== sync: {len(sync)} files, mismatched={bad}")

    (OUT / "plate_check.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        "t5 / Gemini head_base plate check",
        f"  new  frac_opaque_in_face={report['new']['frac_opaque_in_face']}"
        f"  ring12={report['new']['frac_opaque_in_12px_ring']}"
        f"  dark<60={report['new']['opaque_dark_lt60_px']}px",
        f"  old  frac_opaque_in_face={report['old']['frac_opaque_in_face']}"
        f"  ring12={report['old']['frac_opaque_in_12px_ring']}",
        f"  deployed same bytes: {report['sync_all_same']} ({len(sync)} files)",
    ]
    (OUT / "plate_check.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())