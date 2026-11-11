# -*- coding: utf-8 -*-
"""The measurements and their thresholds.

Every metric consumes a 1:1 RGBA render (2048x2048, alpha intact) plus the face
window, and returns numbers + a PASS/FAIL verdict.  Thresholds are the t5/t7
acceptance numbers, or stricter where round 2 asks for more -- see README.md
for the provenance of each one.

Calibration anchors (reproduced by this file on the gemini-v1 build,
2026-11-08): matte-truth defect 56 px, enclosed holes 39 px / 5 components,
fill-boundary dL* 3.8 on 189 rows (left) and 8.1 on 184 rows (right).
"""
from __future__ import annotations

import json

import numpy as np
from scipy import ndimage as ndi

from PIL import Image

from . import common as C

# ------------------------------------------------------------------ thresholds
# matte-truth defect px (canvas px @2048^2) per pose.  t5 used 60/200/600/200
# for neutral/stage_pose/-10/+6+4; the +-6 and +10 poses reuse the nearest
# historical budget, which is the stricter of the two where they differ.
TRUTH_LIMIT = {
    "neutral": 60,
    "stage_pose": 200,
    "anglex_m6": 200,
    "anglex_p6": 200,
    "anglex_m10": 600,
    "anglex_p10": 600,
    "ax6ay4": 200,
}
# alpha-only holes inside the face window.  t5 final: 5-6 components / 39-177 px
# total, largest 44.  The per-component cap catches "one big empty patch" while
# staying above the soft-edge residue the historical build was accepted with.
HOLE_TOTAL_LIMIT = 200
# t5 judged the total only; the per-component number is kept in the report so a
# single blob is distinguishable from soft-edge speckle, but it does not gate
# (the historical build was accepted with a 144 px component at AngleX -10).
HOLE_LARGEST_LIMIT = HOLE_TOTAL_LIMIT
HOLE_MIN_PX = 4
# "open" holes (connected to the canvas exterior) that reach into the face
# window: must be exactly zero -- that is a gap through the silhouette.
HOLE_OPEN_LIMIT = 0
# Near-black seam pixels, measured at true stage scale (k=0.14111) from the 1:1
# render: opaque, RGB < 24, and lit skin on BOTH sides horizontally (or
# vertically).  That "skin on both sides" clause is what separates a seam from
# the character's own line art, hair mass or a jaw shadow -- those have skin on
# one side only.  A near-black line running *through* lit skin is the reported
# "black frame / black line" defect.
DARK_MAX_RGB = 24
DARK_ALPHA_MIN = 200
DARK_SEAM_LIMIT = 20        # px at stage scale
DARK_SEAM_COMPONENT = 10    # largest component
DARK_SEAM_GAP = 3           # look this far for skin on each side
# vertical edge dL* at the fill boundary (the "fill <-> hairline" straight
# boundary).  Historical limit <3 on long edges (>=50 rows = 7 CSS px at
# k=0.14111); t7 shipped 8.1 on 184 rows (=26 CSS px) and that is exactly the
# round-2 target.  Colours are read from the render: inside 6 columns = the
# fill, outside 6 columns = the artwork the fill replaced.
EDGE_DL_LIMIT = 3.0
EDGE_LONG_ROWS = 50
EDGE_ANY_ROWS = 8
FILL_MIN_PX = 300
EDGE_SAMPLES = 20
# background sensitivity: a seam is a band, so judge the largest component.
BG_COMPONENT_LIMIT = 20
# flatness (advisory): inner L* std vs the 8-10 px ring outside it.
FLATNESS_RATIO_LIMIT = 1.5


def _window_mask(win, shape=(C.CANVAS, C.CANVAS)) -> np.ndarray:
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = win
    m[max(0, y0):min(shape[0], y1), max(0, x0):min(shape[1], x1)] = True
    return m


# ------------------------------------------------------------------ 1 matte truth
def truth_defect(rgba: np.ndarray, ref_a: np.ndarray, win) -> dict:
    """Ref alpha says opaque, the render is transparent: the user-visible hole.

    Identical definition to t5: defect = (REF_A > 0.85) & (A < 0.60).
    """
    assert rgba.shape[:2] == (C.CANVAS, C.CANVAS), "1:1 render required"
    a = rgba[:, :, 3] / 255.0
    defect = (ref_a > 0.85) & (a < 0.60)
    winm = _window_mask(win)
    in_win = int(defect[winm].sum())
    lab, n = ndi.label(defect)
    sizes = [int(s) for s in ndi.sum(defect, lab, range(1, n + 1))] if n else []
    big = [s for s in sizes if s >= 12]
    return {"in_window": in_win, "total": int(defect.sum()),
            "components_ge12px": len(big), "largest": max(big) if big else 0,
            "mask": defect}


# ------------------------------------------------------------------ 2 alpha holes
def holes(rgba: np.ndarray, win, ref_a=None, exempt_below=None) -> dict:
    """Alpha-only: enclosed holes and gaps that reach the silhouette.

    enclosed  = low-alpha component that does NOT touch the canvas border;
                its pixels inside the face window are the count (t5 counted the
                whole component; the window count is the stricter reading).
    open      = border-connected component with >=HOLE_MIN_PX px inside the
                window -- that is a channel from the outside into the head.

    ref_a / exempt_below: mother-art alpha as truth for *should there be skin
    here*.  A transparent gap that sits where the mother art is itself
    transparent (hair<->body negative space, alpha<128) is not a defect: those
    pixels are excluded from every count and a component with no solid pixel
    left drops out entirely.  Pass `ref_a=ref, exempt_below=128` to enable.
    """
    assert rgba.shape[:2] == (C.CANVAS, C.CANVAS), "1:1 render required"
    low = (rgba[:, :, 3] / 255.0) < 0.5
    lab, n = ndi.label(low)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    winm = _window_mask(win)
    # A window that is not entirely inside the character also contains outside
    # air, which is border-connected by definition -- the open-count would then
    # measure the window's placement, not a broken silhouette.  Only gate it
    # when the window frame sits on opaque pixels.
    win_solid = False
    if win is not None:
        a = rgba[:, :, 3]
        x0, y0, x1, y1 = (max(0, int(win[0])), max(0, int(win[1])),
                          min(C.CANVAS, int(win[2])), min(C.CANVAS, int(win[3])))
        ring = np.zeros(a.shape, bool)
        ring[y0, x0:x1] = True
        ring[y1 - 1, x0:x1] = True
        ring[y0:y1, x0] = True
        ring[y0:y1, x1 - 1] = True
        win_solid = bool(ring.any()) and bool((a[ring] >= 250).all())
    exempt = ref_a is not None and exempt_below is not None
    if exempt and exempt_below > 1.0:
        # callers pass the matte threshold in 0..255 (128), ref_a is 0..1
        exempt_below = float(exempt_below) / 255.0
    solid_mask = (np.ones(winm.shape, bool) if not exempt
                  else (np.asarray(ref_a, np.float32) >= float(exempt_below)))
    in_win_ids, counts = np.unique(lab[winm], return_counts=True)
    enclosed, opened, enc_ids = [], [], []
    # raw totals over EVERY enclosed component, before the exemption filter --
    # otherwise the "raw for comparison" column silently drops the exempted
    # negative-space blocks and no longer matches the first-round numbers.
    raw_n = raw_px = raw_largest = 0
    for i, px_in_win in zip(in_win_ids.tolist(), counts.tolist()):
        if i == 0 or px_in_win < HOLE_MIN_PX:
            continue
        m = lab == i
        total = int(m.sum())
        ys, xs = np.where(m)
        solid_px = int((m & solid_mask & winm).sum())
        item = {"px_in_window": int(px_in_win), "px_total": total,
                "px_solid": solid_px,
                "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]}
        if i in border:
            opened.append(item)
        else:
            raw_n += 1
            raw_px += int(px_in_win)
            raw_largest = max(raw_largest, int(px_in_win))
            if exempt and solid_px < HOLE_MIN_PX:
                continue  # a gap only where the mother art is transparent too
            enclosed.append(item)
            enc_ids.append(i)
    key = (lambda h: -h["px_solid"]) if exempt else (lambda h: -h["px_in_window"])
    enclosed.sort(key=key)
    mask = (np.isin(lab, enc_ids) & winm) if enc_ids else np.zeros(lab.shape, bool)
    counted = "px_solid" if exempt else "px_in_window"
    return {"enclosed_n": len(enclosed),
            "enclosed_px": int(sum(h[counted] for h in enclosed)),
            "enclosed_px_raw": int(raw_px),
            "enclosed_n_raw": int(raw_n),
            "largest_enclosed_px_raw": int(raw_largest),
            "largest_enclosed_px": enclosed[0][counted] if enclosed else 0,
            "exempt_below": exempt_below if exempt else None,
            "open_n": len(opened),
            "open_px": int(sum(h["px_in_window"] for h in opened)),
            "window_solid": win_solid,
            "mask": mask,
            "components": enclosed[:8],
            "open_components": opened[:8]}


# ------------------------------------------------------------------ 3 dark seam
def _box_down(arr: np.ndarray, n: int) -> np.ndarray:
    im = Image.fromarray(arr.astype(np.float32), "F")
    return np.asarray(im.resize((n, n), Image.BOX))


def stage_composite(rgba: np.ndarray, k: float = C.K_STAGE_5) -> tuple:
    """True stage-scale view of a 1:1 render, composited over the stage colour.

    Downsamples the *premultiplied* colour, so transparent pixels never bleed
    black into the result -- the bug that makes a naive resize look like a seam.
    """
    n = int(round(C.CANVAS * k))
    a = rgba[:, :, 3].astype(np.float32) / 255.0
    pre = rgba[:, :, :3].astype(np.float32) * a[..., None]
    pa = _box_down(a, n)
    prgb = np.stack([_box_down(pre[..., i], n) for i in range(3)], axis=-1)
    comp = prgb + np.array(C.STAGE_BG, np.float32) * (1.0 - pa[..., None])
    return pa, comp


def dark_seam(rgba: np.ndarray, win) -> dict:
    """Near-black pixels that sit *inside* lit skin -- the black line/frame.

    Stage scale matters: at 1:1 the character's own line art is legitimately
    RGB<24 over ~10k px, while at the shipped 14 % scale only a seam keeps a
    near-black core (HANDOFF 6.3 measured 11-337 px for Gemini this way).
    """
    assert rgba.shape[:2] == (C.CANVAS, C.CANVAS), "1:1 render required"
    pa, comp = stage_composite(rgba)
    L = C.to_lstar(comp)
    dark = (pa * 255.0 >= DARK_ALPHA_MIN) & (comp.max(axis=2) < DARK_MAX_RGB)
    skin = (pa > 0.90) & (L > 45) & (L < 92)

    def gap(m, axis, shift):
        out = np.zeros_like(m)
        if axis == 1:
            if shift > 0:
                out[:, :-shift] = m[:, shift:]
            else:
                out[:, -shift:] = m[:, :shift]
        else:
            if shift > 0:
                out[:-shift, :] = m[shift:, :]
            else:
                out[-shift:, :] = m[:shift, :]
        return out

    near = np.zeros_like(skin)
    for axis in (0, 1):
        for shift in range(1, DARK_SEAM_GAP + 1):
            near |= gap(skin, axis, shift) | gap(skin, axis, -shift)
    both_x = np.zeros_like(dark)
    both_y = np.zeros_like(dark)
    for shift in range(1, DARK_SEAM_GAP + 1):
        both_x |= gap(skin, 1, shift) & gap(skin, 1, -shift)
        both_y |= gap(skin, 0, shift) & gap(skin, 0, -shift)
    seam = dark & (both_x | both_y)

    n = seam.shape[0]
    scale = C.CANVAS / float(n)
    wx0, wy0, wx1, wy1 = [int(round(v / scale)) for v in win]
    winm = np.zeros_like(seam)
    winm[max(0, wy0):wy1, max(0, wx0):wx1] = True
    seam_w = seam & winm
    lab, ncomp = ndi.label(seam_w)
    sizes = [int(s) for s in ndi.sum(seam_w, lab, range(1, ncomp + 1))] if ncomp else []
    full = (rgba[:, :, 3] >= DARK_ALPHA_MIN) & (rgba[:, :, :3].max(axis=2) < DARK_MAX_RGB)
    return {"stage_px": int(seam_w.sum()), "components": ncomp,
            "largest": max(sizes) if sizes else 0,
            "dark_px_stage": int((dark & winm).sum()),
            "dark_px_fullres": int(full.sum()),
            "stage_size": n, "mask_stage": seam_w, "scale": scale,
            "win_stage": (wx0, wy0, wx1, wy1)}


# ------------------------------------------------------------------ 4 fill edge
PLATE_HINTS = ("head base", "head_base", "headbase", "head-base")


def plate_layer(rig) -> tuple | None:
    """(name, image path, rect) of the head-base plate, if the build ships one."""
    return _plate_layer_in(rig.build, rig.layout)


def _plate_layer_in(build, layout: "Path | None") -> tuple | None:
    if layout is None or not layout.exists():
        return None
    man = json.loads(layout.read_text(encoding="utf-8"))
    for layer in man.get("layers", []):
        name = str(layer.get("name", ""))
        if name.strip().lower() in PLATE_HINTS:
            rel = layer["image"]["path"]
            # The psd2live manifest sits next to its own `parts/` directory
            # (`assets/build/<name>-layout/parts/...`), NOT inside the build.
            for base in (layout.parent, build):
                p = base / rel
                if p.exists():
                    return name, p, layer["rect"]
    return None


def plate_canvas(rig_or_build, layout=None) -> np.ndarray | None:
    """The plate image pasted onto the 2048 canvas (alpha = where it paints)."""
    if isinstance(rig_or_build, (str, C.Path)):
        info = _plate_layer_in(C.Path(rig_or_build), layout)
    else:
        info = plate_layer(rig_or_build)
    if info is None:
        return None
    _, path, rect = info
    arr = np.asarray(Image.open(path).convert("RGBA"))
    out = np.zeros((C.CANVAS, C.CANVAS, 4), np.uint8)
    h, w = arr.shape[:2]
    out[rect["top"]:rect["top"] + h, rect["left"]:rect["left"] + w] = arr
    return out


def reference_plate(rig) -> tuple:
    """(plate canvas, label) of the pre-fix build, when a backup exists.

    The fill is defined the way t5/t7 defined it: plate opaque now, plate
    transparent in the previous build.  That region is exactly "pixels the fill
    added", and comparing the fill's colour with the colour that used to be
    there is the dL* criterion.  Builds without a backup get (None, reason).
    """
    if rig.layout is None:
        return None, "no layout"
    parent = rig.build.parent
    me = rig.build.name
    for suf in (".bak", ".prev", ".pre-fix", ".before"):
        for cand in sorted(parent.glob(me + suf + "*")):
            if not cand.is_dir():
                continue
            # The current manifest may live beside the build (`<name>-layout/`),
            # not inside it, so look for the same file name in every plausible
            # backup location instead of assuming a build-relative path.
            cands = [cand / rig.layout.name]
            cands += sorted(cand.glob("*-layout/*.json"))
            cands += sorted(cand.glob("*.json"))
            for lay in cands:
                if not lay.exists():
                    continue
                pl = plate_canvas(cand, lay)
                if pl is not None:
                    return pl, f"{cand.name}/{lay.name}"
    return None, "no backup build with a plate"


def fill_boundary_edges(new_plate: np.ndarray, ref_plate: np.ndarray,
                        rgba: np.ndarray, win, source: str = "plate") -> dict:
    """dL* between the fill and the artwork it replaced, per fill component.

    source="plate"  -- the t5/t7 definition: new plate colour vs the reference
                       plate colour (the artwork the fill replaced).  This is
                       the historical 3.8 / 8.1 measurement, exact.
    source="render" -- the same boundary read off the shipped frame (includes
                       AA, hair overlay, lighting), i.e. what the eye sees.

    Left/right edges only: the reported defect is a vertical straight boundary,
    and t5's own numbers came from the same 6-column strips.
    """
    assert rgba.shape[:2] == (C.CANVAS, C.CANVAS), "1:1 render required"
    an, ao = new_plate[..., 3], ref_plate[..., 3]
    if source == "plate":
        L_in = C.to_lstar(new_plate[..., :3])
        L_out = C.to_lstar(ref_plate[..., :3])
        a_in, a_out = an, ao
    elif source == "render":
        L_in = L_out = C.to_lstar(rgba[:, :, :3])
        a_in = a_out = rgba[:, :, 3]
    else:
        raise ValueError(source)
    fill = (an >= 250) & (ao < 200)
    lab, n = ndi.label(fill)
    comps = []
    for i in range(1, n + 1):
        m = lab == i
        px = int(m.sum())
        if px < FILL_MIN_PX:
            continue
        ys, xs = np.where(m)
        bx0, bx1 = int(xs.min()), int(xs.max())
        by0, by1 = int(ys.min()), int(ys.max())

        def edge(side: str) -> tuple:
            if side == "left":
                rows = np.unique(ys[xs <= bx0 + 2])
                inside = [(y, x) for y in rows for x in range(bx0 + 1, bx0 + 7)]
                outside = [(y, x) for y in rows for x in range(bx0 - 9, bx0 - 3)]
            else:
                rows = np.unique(ys[xs >= bx1 - 2])
                inside = [(y, x) for y in rows for x in range(bx1 - 6, bx1)]
                outside = [(y, x) for y in rows for x in range(bx1 + 4, bx1 + 10)]
            ins = [L_in[y, x] for y, x in inside if a_in[y, x] >= 250]
            outs = [L_out[y, x] for y, x in outside if a_out[y, x] >= 250]
            if len(ins) < EDGE_SAMPLES or len(outs) < EDGE_SAMPLES:
                return None, int(len(rows))
            return round(float(np.mean(ins) - np.mean(outs)), 2), int(len(rows))

        el, el_rows = edge("left")
        er, er_rows = edge("right")
        ring = ndi.binary_dilation(m, iterations=10) & ~m & (a_out >= 250)
        bbox_px = (bx1 - bx0 + 1) * (by1 - by0 + 1)
        on_side = ((xs <= bx0 + 1) | (xs >= bx1 - 1)
                   | (ys <= by0 + 1) | (ys >= by1 - 1))
        comps.append({
            "px": px, "bbox": [bx0, by0, bx1, by1],
            "stage_px2": round(px * C.K_STAGE_5 * C.K_STAGE_5, 1),
            "stage_bbox": [round((bx1 - bx0 + 1) * C.K_STAGE_5, 1),
                           round((by1 - by0 + 1) * C.K_STAGE_5, 1)],
            "bbox_fill_ratio": round(px / bbox_px, 3),
            "boundary_on_bbox_side": round(float(on_side.mean()), 3),
            "edge_dl_left": el, "edge_dl_left_rows": el_rows,
            "edge_dl_right": er, "edge_dl_right_rows": er_rows,
            "inner_std_l": round(float(L_in[m].std()), 1),
            "ring_std_l": round(float(L_out[ring].std()), 1) if ring.any() else None,
        })
    comps.sort(key=lambda c: -c["px"])

    def edges_of(min_rows: int) -> list:
        out = []
        for c in comps:
            for side in ("left", "right"):
                dl = c[f"edge_dl_{side}"]
                rows = c[f"edge_dl_{side}_rows"]
                if dl is None or rows < min_rows:
                    continue
                out.append({"bbox": c["bbox"], "side": side, "rows": rows,
                            "dl": dl, "px": c["px"],
                            "css_px": round(rows * C.K_STAGE_5, 1)})
        return out

    long_e = edges_of(EDGE_LONG_ROWS)
    any_e = edges_of(EDGE_ANY_ROWS)
    long_e.sort(key=lambda e: -abs(e["dl"]))
    any_e.sort(key=lambda e: -abs(e["dl"]))
    return {"fill_px": int(fill.sum()), "components": comps,
            "edges_n": len(any_e), "long_edges_n": len(long_e),
            "worst_long": round(abs(long_e[0]["dl"]), 2) if long_e else 0.0,
            "worst_any": round(abs(any_e[0]["dl"]), 2) if any_e else 0.0,
            "long_edge_min_rows": EDGE_LONG_ROWS,
            "long_edges": long_e[:6], "any_edges": any_e[:6],
            "fill_mask": fill}


# ------------------------------------------------------------------ 5 advisory
def aligned_truth(rgba: np.ndarray, ref_a: np.ndarray, win,
                  max_shift: int = 16) -> dict:
    """Matte-truth defect after the best rigid shift of the matte.

    The matte is the neutral-pose artwork.  At stage_pose the head moves, so
    comparing it against the static matte reports the whole displaced
    silhouette.  Search +-max_shift px (coarse 4 px, then 1 px), take the shift
    that minimises the defect count, and report the residual.  `raw` keeps the
    unshifted number so the two can be compared in the report.
    """
    a = rgba[:, :, 3].astype(np.float32) / 255.0
    x0, y0, x1, y1 = (int(v) for v in win)
    X0, Y0 = max(0, x0 - max_shift), max(0, y0 - max_shift)
    X1 = min(C.CANVAS, x1 + max_shift)
    Y1 = min(C.CANVAS, y1 + max_shift)
    refc = np.asarray(ref_a[Y0:Y1, X0:X1], np.float32)
    ac = a[Y0:Y1, X0:X1]
    inner = (slice(y0 - Y0, y1 - Y0), slice(x0 - X0, x1 - X0))

    def count(shifted):
        m = (shifted > 0.85) & (ac < 0.60)
        return int(m[inner].sum())

    raw = count(refc)
    best = (raw, 0, 0)
    for dy in range(-max_shift, max_shift + 1, 4):
        for dx in range(-max_shift, max_shift + 1, 4):
            n = count(ndi.shift(refc, (dy, dx), order=1, mode="nearest"))
            if n < best[0]:
                best = (n, dx, dy)
    for dy in range(best[2] - 3, best[2] + 4):
        for dx in range(best[1] - 3, best[1] + 4):
            n = count(ndi.shift(refc, (dy, dx), order=1, mode="nearest"))
            if n < best[0]:
                best = (n, dx, dy)
    return {"raw": int(raw), "in_window": int(best[0]),
            "shift": [int(best[1]), int(best[2])],
            "removed_frac": (1.0 - best[0] / raw) if raw else 0.0}


def plate_self_steps(plate: np.ndarray, win, half: int = 3,
                     long_rows: int = EDGE_LONG_ROWS, dl_min: float = EDGE_DL_LIMIT,
                     skin_lo: float = 45.0, skin_hi: float = 100.0,
                     line_rgb: int = 60) -> dict:
    """Straight vertical L* steps *inside* the head plate itself.

    Fallback for rigs that have a head_base but no pre-fix build to compare
    against: the historical pale_edge compares the new fill against the old
    fill, which does not exist for a brand-new rig.  What the eye still sees is
    a straight vertical step inside the plate where both sides are skin -- so
    scan every column of the plate, keep rows where both sides are painted,
    both are skin-toned (L* 45..100, not line art), and |dL*| >= dl_min, then
    take the longest run.  A run >= long_rows (50 rows = 7 CSS px) is reported.
    """
    assert plate.shape[:2] == (C.CANVAS, C.CANVAS)
    pa = plate[:, :, 3]
    rgb = plate[:, :, :3].astype(np.float32)
    L = C.to_lstar(rgb)
    dark = rgb.max(axis=2) < line_rgb
    painted = pa >= 250
    y0, y1, x0, x1 = (max(0, int(win[0])), max(0, int(win[1])),
                      min(C.CANVAS, int(win[2])), min(C.CANVAS, int(win[3])))
    rows = []
    for x in range(max(x0 + half, half), min(x1, C.CANVAS - half)):
        a, b = x - half, x + half
        ok = (painted[:, a] & painted[:, b] & ~dark[:, a] & ~dark[:, b]
              & (L[:, a] >= skin_lo) & (L[:, a] <= skin_hi)
              & (L[:, b] >= skin_lo) & (L[:, b] <= skin_hi))
        d = np.where(ok, L[:, b] - L[:, a], 0.0)
        hit = ok & (np.abs(d) >= dl_min)
        if not hit[y0:y1].any():
            continue
        ys = np.where(hit[y0:y1])[0] + y0
        # longest consecutive run
        splits = np.where(np.diff(ys) > 1)[0]
        starts = np.concatenate([[0], splits + 1])
        ends = np.concatenate([splits, [len(ys) - 1]])
        i = int(np.argmax(ends - starts))
        run = ys[starts[i]:ends[i] + 1]
        if len(run) < EDGE_ANY_ROWS:
            continue
        rows.append({"x": int(x), "y0": int(run[0]), "y1": int(run[-1]),
                     "rows": int(len(run)),
                     "dl_median": round(float(np.median(L[run, b] - L[run, a])), 2),
                     "dl_max": round(float(np.max(np.abs(L[run, b] - L[run, a]))), 2),
                     "l_left": round(float(L[run, a].mean()), 1),
                     "l_right": round(float(L[run, b].mean()), 1)})
    longe = [r for r in rows if r["rows"] >= long_rows]
    longe.sort(key=lambda r: -r["rows"])
    anye = sorted(rows, key=lambda r: -r["rows"])
    return {"edges_n": len(longe), "long_edges_n": len(longe),
            "worst_long": max((abs(r["dl_median"]) for r in longe), default=None),
            "worst_long_rows": longe[0]["rows"] if longe else 0,
            "long_edges": longe[:6], "any_edges": anye[:6]}


def straight_steps(rgba: np.ndarray, win, thr: float = EDGE_DL_LIMIT,
                   half: int = 3, any_rows: int = EDGE_ANY_ROWS) -> dict:
    """Every straight vertical L* step in the window -- advisory only.

    Kept because it catches seams the fill metric cannot see on builds without
    a plate, but it also fires on painted outlines, so it does not gate.
    """
    assert rgba.shape[:2] == (C.CANVAS, C.CANVAS), "1:1 render required"
    a = rgba[:, :, 3]
    L = C.to_lstar(rgba[:, :, :3])
    op = a >= 250
    d = np.zeros_like(L)
    d[:, half:-half] = L[:, 2 * half:] - L[:, :-2 * half]
    valid = np.zeros_like(op)
    valid[:, half:-half] = op[:, 2 * half:] & op[:, :-2 * half]
    valid &= _window_mask(win)

    found = []
    for x in range(half, C.CANVAS - half):
        col = np.where(valid[:, x], d[:, x], 0.0)
        for y0, y1 in _runs(col, thr, any_rows):
            seg = col[y0:y1 + 1]
            left = L[y0:y1 + 1, x - half]
            right = L[y0:y1 + 1, x + half]
            found.append({
                "x": int(x), "y0": int(y0), "y1": int(y1), "rows": int(y1 - y0 + 1),
                "dl_median": round(float(np.median(seg)), 2),
                "dl_max": round(float(np.abs(seg).max()), 2),
                "l_left": round(float(np.median(left)), 1),
                "l_right": round(float(np.median(right)), 1),
                "l_std_left": round(float(left.std()), 1),
                "l_std_right": round(float(right.std()), 1),
            })
    found.sort(key=lambda e: (-e["rows"], -abs(e["dl_median"])))
    return {"steps_n": len(found), "steps": found[:12]}


def _runs(col: np.ndarray, thr: float, min_rows: int):
    """[(start, end)] of consecutive rows where |col| >= thr."""
    idx = np.where(np.abs(col) >= thr)[0]
    if not len(idx):
        return []
    splits = np.where(np.diff(idx) > 1)[0]
    starts = np.r_[idx[0], idx[splits + 1]]
    ends = np.r_[idx[splits], idx[-1]]
    return [(int(s), int(e)) for s, e in zip(starts, ends) if e - s + 1 >= min_rows]


def flatness(rgba: np.ndarray, face: dict) -> dict:
    """Inner vs 10 px ring L* std (t5 §5, ratio <1.5 = not a flat pasted patch)."""
    assert rgba.shape[:2] == (C.CANVAS, C.CANVAS), "1:1 render required"
    L = C.to_lstar(C.composite(rgba))
    x, y, w, h = face["left"], face["top"], face["width"], face["height"]
    inner = np.zeros((C.CANVAS, C.CANVAS), bool)
    inner[y:y + h, x:x + w] = True
    ring = ndi.binary_dilation(inner, iterations=10) & ~inner
    a = rgba[:, :, 3] >= 250
    inner &= a
    ring &= a
    si = float(L[inner].std()) if inner.any() else 0.0
    sr = float(L[ring].std()) if ring.any() else 0.0
    return {"inner_std": round(si, 1), "ring_std": round(sr, 1),
            "ratio": round(si / sr, 2) if sr else None}


# ------------------------------------------------------------------ 6 bg check
def skin_mask(rig, ref_a: np.ndarray, win, erode: int = 3) -> tuple[np.ndarray, str]:
    """Face skin: the matte's own skin tone when it has one, else ref alpha.

    The tone gate matters because hair lying on the face is opaque too, and its
    AA edge is a legitimate soft edge, not a seam (t5 §7).
    """
    if rig.matte is None:
        m = ref_a > 0.85
        return ndi.binary_erosion(m, iterations=erode), "ref-alpha (no matte)"
    mat = np.asarray(Image.open(rig.matte).convert("RGBA")).astype(np.int16)
    r, g, b, al = mat[..., 0], mat[..., 1], mat[..., 2], mat[..., 3]
    tone = (al >= 250) & (r >= 235) & (g >= 195) & (b >= 190) & (np.abs(r - b) <= 30)
    m = ref_a > 0.85
    if tone.any():
        k, dx, dy = rig.mapping["scale"], rig.mapping["dx"], rig.mapping["dy"]
        h, w = tone.shape
        ys = np.clip(np.round((np.arange(C.CANVAS) - dy) / k).astype(int), 0, h - 1)
        xs = np.clip(np.round((np.arange(C.CANVAS) - dx) / k).astype(int), 0, w - 1)
        tone_c = tone[np.ix_(ys, xs)]
        m = m & tone_c
        kind = "matte-skin-tone"
    else:
        kind = "ref-alpha (matte has no skin tone)"
    winm = _window_mask(win)
    return ndi.binary_erosion(m & winm, iterations=erode), kind


def group_stats(mask: np.ndarray) -> dict:
    lab, n = ndi.label(mask)
    sizes = [int((lab == i).sum()) for i in range(1, n + 1)]
    ys, xs = np.where(mask)
    return {"px": int(mask.sum()), "components": n,
            "largest": max(sizes) if sizes else 0,
            "bbox": ([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
                     if len(xs) else None)}


# ------------------------------------------------------------------ 6 bleed
# Colour-category defect: the plate is filled under the jaw, and a fill that is
# too pale shows through/next to the hair as a SKIN-coloured band.  Brightness
# alone cannot see it (t4 hit dL* 0.94 and still shipped a skin band), so this
# metric compares colour classes instead.
#
# Ring = up to BLEED_RING px outside the face cut, skipping the face's own
# BLEED_AA_SKIP px anti-aliased collar (that collar is legitimately skin).  A
# pixel counts when the master art says HAIR there but the product renders a
# colour within BLEED_DE_LIMIT of the rendered skin, or within BLEED_HUE_LIMIT
# of its hue with a skin-like saturation/value.
#
# Calibration (gemini, neutral, 1:1; see preview/_diag/_t11_*.py):
#   old build (gemini-v1.t4-backup2)  199 px / largest 17   PASS
#   t4 build (skin band in the hair)  274 px / largest 32   FAIL
# so the limit sits between the two accepted-looking states and the regression.
BLEED_DE_LIMIT = 16.0
BLEED_HUE_LIMIT = 15.0
BLEED_RING = 8
BLEED_AA_SKIP = 2
BLEED_MAX_COMPONENT = 20
BLEED_TOTAL_LIMIT = 200


def _hsv(rgb: np.ndarray) -> np.ndarray:
    return np.asarray(Image.fromarray(np.clip(rgb, 0, 255).round().astype(np.uint8))
                      .convert("HSV")).astype(np.int32)


def _lab(rgb: np.ndarray) -> np.ndarray:
    x = rgb.astype(np.float64) / 255.0
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805],
                  [0.2126, 0.7152, 0.0722],
                  [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], -1)


def face_alpha(rig) -> np.ndarray | None:
    """The face cut's own alpha on the 2048 canvas (for the bleed ring)."""
    layout = getattr(rig, "layout", None)
    build = getattr(rig, "build", None)
    if layout is None or build is None or not layout.exists():
        return None
    man = json.loads(layout.read_text(encoding="utf-8"))
    lay = next((l for l in man["layers"]
                if l["name"].strip().lower() == "face"), None)
    if lay is None:
        return None
    p = layout.parent / lay["image"]["path"]
    if not p.exists():
        p = build / lay["image"]["path"]
    if not p.exists():
        return None
    a = np.asarray(Image.open(p).convert("RGBA"))[..., 3]
    out = np.zeros((C.CANVAS, C.CANVAS), np.uint8)
    r = lay["rect"]
    out[r["top"]:r["top"] + a.shape[0], r["left"]:r["left"] + a.shape[1]] = a
    return out


def bleed_mask(rig, rgba: np.ndarray, ring: int = BLEED_RING) -> dict | None:
    """Skin-coloured pixels leaking into hair along the face edge.

    `rgba` is a 1:1 render.  The master art (matte) decides what SHOULD be at a
    pixel; the render decides what colour is actually there.
    """
    if getattr(rig, "matte", None) is None or getattr(rig, "mapping", None) is None:
        return None
    fa = face_alpha(rig)
    if fa is None:
        return None
    matte = C.matte_ref(rig)[..., :3]
    mhsv = _hsv(matte)
    mH, mS, mV = mhsv[..., 0], mhsv[..., 1], mhsv[..., 2]
    hair = (mH >= 135) & (mH <= 232) & (mS >= 35) & (mV >= 50)
    skin_m = ((mH <= 25) | (mH >= 235)) & (mS >= 10) & (mV >= 90)

    face_op = fa > 0
    st = ndi.generate_binary_structure(2, 2)
    outer = ndi.binary_dilation(face_op, st, iterations=ring)
    inner = ndi.binary_dilation(face_op, st, iterations=BLEED_AA_SKIP)
    band = outer & ~inner

    a = rgba[..., 3]
    lab = _lab(rgba[..., :3])
    hsv = _hsv(rgba[..., :3])
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    ref_px = face_op & (a >= 250) & skin_m
    if int(ref_px.sum()) < 50:
        ref_px = face_op & (a >= 250)
    if int(ref_px.sum()) < 50:
        return None
    skin_ref = np.median(lab[ref_px], 0)
    sh = int(np.median(H[ref_px]))
    ss = int(np.median(S[ref_px]))
    dsk = np.linalg.norm(lab - skin_ref, axis=-1)
    dh = np.minimum(np.abs(H - sh), 255 - np.abs(H - sh))
    skin_like = ((dsk < BLEED_DE_LIMIT)
                 | ((dh < BLEED_HUE_LIMIT) & (S <= max(ss * 2, 60))
                    & (V >= 110) & (S >= 8)))
    mask = band & hair & (a >= 200) & skin_like
    stats = group_stats(mask)
    stats["mask"] = mask
    stats["skin_ref"] = [round(float(v), 1) for v in skin_ref]
    stats["ring_px"] = int(band.sum())
    stats["pass"] = (stats["largest"] < BLEED_MAX_COMPONENT
                     and stats["px"] < BLEED_TOTAL_LIMIT)
    return stats


# ------------------------------------------------------------------ verdicts
def verdicts(pose: str, truth: dict, hole: dict, dark: dict,
             edge: dict | None, bg: dict | None = None,
             bleed: dict | None = None) -> dict:
    open_ok = (hole["open_px"] <= HOLE_OPEN_LIMIT
               if hole.get("window_solid", True) else True)
    t = truth.get("in_window")
    lim = truth.get("limit") or TRUTH_LIMIT[pose]
    v = {
        "truth": ("n/a" if t is None else
                  "PASS" if t < lim else "FAIL"),
        "holes": "PASS" if (hole["enclosed_px"] < HOLE_TOTAL_LIMIT
                            and hole["largest_enclosed_px"] < HOLE_LARGEST_LIMIT
                            and open_ok) else "FAIL",
        "dark": "PASS" if (dark["stage_px"] <= DARK_SEAM_LIMIT
                           and dark["largest"] <= DARK_SEAM_COMPONENT) else "FAIL",
    }
    if edge is not None:
        v["edge"] = "PASS" if edge["worst_long"] < EDGE_DL_LIMIT else "FAIL"
    if bg is not None:
        v["bg"] = "PASS" if bg["largest"] < BG_COMPONENT_LIMIT else "FAIL"
    if bleed is not None:
        v["bleed"] = "PASS" if bleed["pass"] else "FAIL"
    v["pass"] = all(x in ("PASS", "n/a") for x in v.values() if isinstance(x, str))
    return v