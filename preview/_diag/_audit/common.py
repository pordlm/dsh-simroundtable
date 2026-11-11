# -*- coding: utf-8 -*-
"""Shared plumbing for the seam / black-frame audit (t1, rig-seam-audit-2).

Hard rules enforced here -- see README.md for the thresholds:

  * every verdict comes from a **1:1 render with alpha**:
    ``preview/probe.html?scale=1.0`` + ``window.__app.renderer.extract.base64``.
    A scaled-down screenshot is never allowed to produce a verdict (the stage
    draws models at k=0.14111 CSS px per canvas px; a 2 px seam is 0.28 CSS px
    there -- invisible, yet fatal on the shipped sprite).
  * the mother art's ``matte.png`` is **alpha ground truth only**.  Its colour
    is 0.55-0.78x the shipped build's colour, so it must never be compared
    against rendered RGB.
  * one matte->canvas mapping per character, derived from that character's own
    matte (the build used TARGET_H=1836, TOP=106):

        k  = 1836 / (matte alpha bbox height)      (alpha > 64)
        dx = 1024 - k * (x0 + x1) / 2
        dy = 106  - k * y0

    Validated against the historical Gemini constants (k=1.2599, off=(380.4,
    68.5)): this formula gives k=1.2601, dx=378.8, dy=68.2 -- <=1.6 px apart,
    i.e. the reference alpha inside the face window is unaffected (it is fully
    opaque there; the 1.6 px only matters on the outer silhouette, which the
    matte-truth metric does not judge).
"""
from __future__ import annotations

import base64
import io
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "assets" / "build"
AUDIT_DIR = Path(__file__).resolve().parent
DIAG = AUDIT_DIR.parent
BASE_URL = os.environ.get("AUDIT_BASE_URL", "http://127.0.0.1:8848")

CANVAS = 2048
TARGET_H = 1836
TOP = (CANVAS - TARGET_H) // 2          # 106, see *_to_canvas.py
STAGE_BG = (18, 24, 38)                 # stage radial gradient behind a seated head
K_STAGE_5 = 0.14111                     # five seats @760 css px (t5 README §7)
K_STAGE_2 = 0.15605                     # two seats

# ------------------------------------------------------------------ pose matrix
# Historical t5 set (neutral / stage_pose / AngleX-10 / AX+6,AY+4) plus the +-6
# and +10 poses the round-2 contract asks for.  Keys are also the threshold keys.
POSES: dict[str, dict[str, float]] = {
    "neutral": {},
    "stage_pose": dict(AngleX=-6, AngleY=-3, BodyAngleX=-2.3, HairFront=-0.118, Breath=1.0),
    "anglex_m6": dict(AngleX=-6, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5),
    "anglex_p6": dict(AngleX=6, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5),
    "anglex_m10": dict(AngleX=-10, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5),
    "anglex_p10": dict(AngleX=10, AngleY=0, BodyAngleX=0, HairFront=0, Breath=0.5),
    "ax6ay4": dict(AngleX=6, AngleY=4, BodyAngleX=0, HairFront=0, Breath=0.5),
}
DEFAULT_POSES = tuple(POSES)


def pose_params(pose: str, supported: list[str] | None = None) -> dict[str, float]:
    """Params for one pose, filtered to ids the rig actually declares."""
    raw = POSES[pose]
    if not supported:
        return dict(raw)
    return {k: v for k, v in raw.items() if "Param" + k in supported}


# ------------------------------------------------------------------ rig registry
@dataclass
class Rig:
    key: str
    build: Path
    model3: Path
    layout: Path | None
    matte: Path | None
    face: dict | None = None
    params: list[str] = field(default_factory=list)
    union_bbox: tuple | None = None
    mapping: dict | None = None
    map_residual: tuple | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def rel_model(self) -> str:
        """probe.html wants a URL relative to preview/."""
        return "../" + self.model3.relative_to(ROOT).as_posix()

    @property
    def has_truth(self) -> bool:
        return self.matte is not None and self.face is not None

    def window(self, pad: int = 30) -> tuple[int, int, int, int]:
        """(x0, y0, x1, y1) -- the face rect grown by `pad` px (t5/t7 window)."""
        if self.face is None:
            return (0, 0, CANVAS, CANVAS)
        return (self.face["left"] - pad, self.face["top"] - pad,
                self.face["left"] + self.face["width"] + pad,
                self.face["top"] + self.face["height"] + pad)


def _layout_union_bbox(layout: Path) -> tuple[int, int, int, int] | None:
    man = json.loads(layout.read_text(encoding="utf-8"))
    acc = np.zeros((CANVAS, CANVAS), bool)
    base = layout.parent
    for layer in man["layers"]:
        p = base / layer["image"]["path"]
        if not p.exists():
            continue
        a = np.asarray(Image.open(p).convert("RGBA"))[..., 3] > 8
        r = layer["rect"]
        y, x = r["top"], r["left"]
        acc[y:y + a.shape[0], x:x + a.shape[1]] |= a
    ys, xs = np.where(acc)
    if not len(xs):
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def matte_mapping(matte: Path, alpha_thr: int = 64) -> dict:
    """See module docstring: k / dx / dy from the matte's own alpha bbox."""
    a = np.asarray(Image.open(matte).convert("RGBA"))[..., 3]
    ys, xs = np.where(a > alpha_thr)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    k = TARGET_H / float(y1 - y0)
    return {"scale": float(k),
            "dx": float(CANVAS / 2.0 - k * (x0 + x1) / 2.0),
            "dy": float(TOP - k * y0),
            "bbox": [x0, y0, x1, y1],
            "alpha_thr": alpha_thr}


def _layout_candidates(model3: Path) -> list[Path]:
    stem = model3.name[: -len(".model3.json")]
    ch = stem.split(".")[0]
    cands = [
        model3.parent / f"{stem}.json",
        BUILD / f"{ch}-layout" / f"{stem}.json",
        BUILD / f"{ch}-v3-layout" / f"{stem}.json",
    ]
    cands += sorted(BUILD.glob(f"*/{stem}.json"))
    seen, out = set(), []
    for c in cands:
        if c.exists() and c not in seen and ".bak" not in c.as_posix() \
                and not c.parent.name.startswith("_") \
                and ".t4-" not in c.name and ".t4-" not in c.parent.name:
            seen.add(c)
            out.append(c)
    return out


def _pick_layout(model3: Path, mapping: dict | None) -> tuple[Path | None, tuple | None, list[str]]:
    """Layouts in this repo can be stale (claude-layout vs claude-v3-layout).
    Pick the one whose part union lines up with the mapped matte bbox."""
    notes: list[str] = []
    cands = _layout_candidates(model3)
    if not cands:
        return None, None, ["no layout json"]
    if mapping is None or len(cands) == 1:
        best = cands[0]
        return best, _layout_union_bbox(best), notes
    k, dx, dy = mapping["scale"], mapping["dx"], mapping["dy"]
    mx0, my0, mx1, my1 = mapping["bbox"]
    pred = (dx + k * mx0, dy + k * my0, dx + k * mx1, dy + k * my1)
    scored = []
    for c in cands:
        bb = _layout_union_bbox(c)
        if bb is None:
            continue
        # limbs may be missing from the parts, so the left/top edges weigh most
        score = abs(bb[0] - pred[0]) + abs(bb[1] - pred[1]) \
            + 0.25 * (abs(bb[2] - pred[2]) + abs(bb[3] - pred[3]))
        scored.append((score, c, bb))
    if not scored:
        return cands[0], None, ["layout union is empty"]
    scored.sort(key=lambda s: s[0])
    if len(scored) > 1:
        notes.append("layout picked by bbox residual: %s (%.1f px) over %s"
                     % (f"{scored[0][1].parent.name}/{scored[0][1].name}", scored[0][0],
                        ", ".join(f"{c.parent.name}/{c.name}={s:.1f}" for s, c, _ in scored[1:])))
    return scored[0][1], scored[0][2], notes


def discover_rigs() -> dict[str, Rig]:
    """Every exported Live2D model under assets/build, keyed by character."""
    rigs: dict[str, Rig] = {}
    for model3 in sorted(BUILD.rglob("*.model3.json")):
        s = model3.as_posix()
        if ".bak" in s or "deployed" in s or "template" in s.lower():
            continue
        stem = model3.name[: -len(".model3.json")]
        ch = stem.split(".")[0]
        matte = BUILD / f"{ch}-parts" / "matte.png"
        rig = Rig(key=ch, build=model3.parent, model3=model3,
                  layout=None, matte=matte if matte.exists() else None)
        mapping = matte_mapping(matte) if rig.matte else None
        rig.mapping = mapping
        rig.layout, rig.union_bbox, notes = _pick_layout(model3, mapping)
        rig.notes += notes
        if rig.layout is not None:
            man = json.loads(rig.layout.read_text(encoding="utf-8"))
            faces = [l["rect"] for l in man["layers"] if l["name"] == "face"]
            rig.face = faces[0] if faces else None
            if rig.face is None:
                rig.notes.append("layout has no 'face' layer")
        cdi = [p for p in model3.parent.glob("*.cdi3.json")]
        if cdi:
            cj = json.loads(cdi[0].read_text(encoding="utf-8"))
            rig.params = [p["Id"] for p in cj.get("Parameters", [])]
        if rig.mapping and rig.union_bbox:
            k, dx, dy = rig.mapping["scale"], rig.mapping["dx"], rig.mapping["dy"]
            mx0, my0, mx1, my1 = rig.mapping["bbox"]
            pred = (dx + k * mx0, dy + k * my0, dx + k * mx1, dy + k * my1)
            rig.map_residual = tuple(round(rig.union_bbox[i] - pred[i])
                                     for i in range(4))
            rig.notes.append("matte-map residual: left %+d top %+d right %+d bottom %+d px"
                             % rig.map_residual)
        # Several builds can share a character name (claude-v3/model vs an old
        # test export).  Prefer one that has matte truth + a layout, then a -v1
        # directory, then the one with the most declared parameters.
        def rank(r: "Rig") -> tuple:
            return (r.has_truth, r.layout is not None,
                    "-v1" in r.build.name, len(r.params), str(r.model3))

        old = rigs.get(ch)
        if old is None or rank(rig) > rank(old):
            rigs[ch] = rig
    return rigs


# ------------------------------------------------------------------ alpha truth
def matte_ref(rig: Rig) -> np.ndarray:
    """Matte alpha mapped onto the 2048 canvas (float32, same rounding as t5)."""
    if rig.matte is None or rig.mapping is None:
        raise ValueError(f"{rig.key}: no matte")
    mat = np.array(Image.open(rig.matte).convert("RGBA")).astype(np.float32)
    h, w = mat.shape[:2]
    k, dx, dy = rig.mapping["scale"], rig.mapping["dx"], rig.mapping["dy"]
    ys = (np.arange(CANVAS, dtype=np.float32) - dy) / k
    xs = (np.arange(CANVAS, dtype=np.float32) - dx) / k
    yi = np.clip(np.round(ys).astype(np.int32), 0, h - 1)
    xi = np.clip(np.round(xs).astype(np.int32), 0, w - 1)
    ok_y = (ys >= -0.5) & (ys <= h - 0.5)
    ok_x = (xs >= -0.5) & (xs <= w - 0.5)
    sub = mat[np.ix_(yi, xi)]
    sub[~ok_y, :, :] = 0
    sub[:, ~ok_x, :] = 0
    return sub


REF_CACHE: dict[str, np.ndarray] = {}


def ref_alpha(rig: Rig) -> np.ndarray:
    if rig.key not in REF_CACHE:
        REF_CACHE[rig.key] = matte_ref(rig)[:, :, 3] / 255.0
    return REF_CACHE[rig.key]


# ------------------------------------------------------------------ rendering
def grab(page, rig: Rig | str, params: dict, scale: float = 1.0,
         mip: bool = False, allow_scaled: bool = False) -> Image.Image:
    """One deterministic 1:1 frame with alpha, straight out of the renderer.

    `scale` must stay 1.0 for any measurement -- scaled renders are only allowed
    when `allow_scaled=True` (background-sensitivity probe, and never for a
    verdict).
    """
    if scale != 1.0 and not allow_scaled:
        raise ValueError("audit renders must be 1:1 (scale=1.0); scaled renders may "
                         "not produce a verdict")
    model = rig.rel_model if isinstance(rig, Rig) else rig
    qs = [f"scale={scale}", "model=" + model.replace("/", "%2F")]
    if params:
        qs.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items())
                  .replace(":", "%3A").replace(",", "%2C"))
    if mip:
        qs.append("mip=1")
    page.goto(BASE_URL + "/preview/probe.html?" + "&".join(qs), wait_until="load")
    page.wait_for_function("() => document.title === 'READY'", timeout=180000)
    b64 = page.evaluate(
        "async () => await window.__app.renderer.extract.base64(window.__app.stage,'image/png')")
    img = Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGBA")
    want = int(round(CANVAS * scale))
    if img.size != (want, want):
        raise RuntimeError(f"extract returned {img.size}, expected {(want, want)}")
    return img


def grab_composite(page, rig: Rig, params: dict, scale: float, bg_hex: str) -> np.ndarray:
    """Screenshot composited over a page colour (for alpha==0 questions only)."""
    model = rig.rel_model
    qs = [f"scale={scale}", "model=" + model.replace("/", "%2F"), "bg=" + bg_hex]
    if params:
        qs.append("p=" + ",".join("%s:%s" % (k, v) for k, v in params.items())
                  .replace(":", "%3A").replace(",", "%2C"))
    page.goto(BASE_URL + "/preview/probe.html?" + "&".join(qs), wait_until="load")
    page.wait_for_function("() => document.title === 'READY'", timeout=180000)
    size = int(round(CANVAS * scale))
    page.set_viewport_size({"width": size + 2, "height": size + 2})
    page.wait_for_timeout(120)
    png = page.screenshot(clip={"x": 0, "y": 0, "width": size, "height": size})
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))


def composite(rgba: np.ndarray, bg=STAGE_BG) -> np.ndarray:
    base = Image.new("RGBA", (rgba.shape[1], rgba.shape[0]), tuple(bg) + (255,))
    base.alpha_composite(Image.fromarray(rgba, "RGBA"))
    return np.asarray(base.convert("RGB")).astype(np.float32)


def to_lstar(rgb: np.ndarray) -> np.ndarray:
    """CIE L* (D65) from sRGB 0-255 -- identical to t5's implementation."""
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    return np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)


def save_png(path: Path, rgba: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.ascontiguousarray(rgba), "RGBA").save(path)