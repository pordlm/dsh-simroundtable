"""Build preview/_evidence/audit/README_audit.md from the t1 audit run.

Reads  preview/_diag/_audit/out/audit.json  (numbers, one row per pose)
and    preview/_diag/_audit/out/<char>_<pose>_defects.png  (overlay -> coordinates)
then re-renders ONE neutral frame per rig at 1:1 to cut the 6x zoom crops.

Numbers are never recomputed for the table: the table quotes audit.json so the
evidence file and the gate can not drift apart.  The only fresh measurement is
the neutral hole-component bbox list, which is cross-checked against the JSON
enclosed pixel count.

Run:  python preview/_evidence/audit/_make_report.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))

from _audit import common as C            # noqa: E402
from _audit import metrics as M          # noqa: E402

OUT_AUD = ROOT / "preview" / "_diag" / "_audit" / "out"
OUT = ROOT / "preview" / "_evidence" / "audit"

YELLOW = np.array([255, 235, 0], np.uint8)
ZOOM = 6
CROP = 240          # source px before the 6x upscale


# ---------------------------------------------------------------- helpers
def hole_components(rgba: np.ndarray, win, ref=None,
                    exempt_below: float | None = None) -> list[dict]:
    """Same rule as metrics.holes(): alpha<0.5, not touching the canvas edge,
    >=4 px inside the face window.  Returns bboxes in 2048 canvas coordinates.

    With ref/exempt_below the mother-art alpha exemption applies: pixels whose
    matte alpha is below the threshold (negative space in the source art) are
    not counted, and a component left with <4 solid px drops out.
    """
    x0, y0, x1, y1 = win
    low = (rgba[:, :, 3] / 255.0) < 0.5
    lab, n = ndi.label(low)                      # 4-connectivity, as metrics.holes()
    if n == 0:
        return []
    border = set(np.unique(np.concatenate([
        lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    inside = np.zeros(lab.shape, bool)
    inside[y0:y1, x0:x1] = True
    exempt = ref is not None and exempt_below is not None
    solid = (np.asarray(ref, np.float32) >= exempt_below) if exempt else inside
    ids, counts = np.unique(lab[inside], return_counts=True)
    out = []
    for i, px in zip(ids.tolist(), counts.tolist()):
        if i == 0 or i in border or px < M.HOLE_MIN_PX:
            continue
        m = lab == i
        keep = int((m & solid & inside).sum()) if exempt else int(px)
        if keep < M.HOLE_MIN_PX:
            continue
        ys, xs = np.where(m)                     # bbox of the WHOLE component
        out.append({"px": keep, "px_raw": int(px),
                    "bbox": (int(xs.min()), int(ys.min()),
                             int(xs.max()), int(ys.max()))})
    out.sort(key=lambda c: -c["px"])
    return out


def marker_bbox(png: Path) -> tuple[tuple[int, int, int, int] | None, str]:
    """Largest hole (yellow) cluster; falls back to the largest truth (red) gap.

    Only coordinates come from here -- every number in the table is quoted from
    audit.json, so this can not disagree with the gate.
    """
    if not png.exists():
        return None, ""
    rgb = np.asarray(Image.open(png).convert("RGB"))
    for colour, tag in ((YELLOW, ""), (np.array([255, 0, 0], np.uint8), "红")):
        m = np.all(rgb == colour, axis=-1)
        if not m.any():
            continue
        lab, n = ndi.label(m, structure=np.ones((3, 3), bool))
        sizes = ndi.sum(m, lab, range(1, n + 1))
        k = int(np.argmax(sizes)) + 1
        ys, xs = np.where(lab == k)
        return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())), tag
    return None, ""


def crop_zoom(rgba: np.ndarray, bbox, overlay: np.ndarray | None) -> Image.Image:
    """6x nearest-neighbour crop of the render, optionally paired with the overlay."""
    x0, y0, x1, y1 = bbox
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    h = CROP // 2
    sx0, sy0 = max(0, cx - h), max(0, cy - h)
    sx1, sy1 = min(C.CANVAS, sx0 + CROP), min(C.CANVAS, sy0 + CROP)
    plane = C.composite(rgba).astype(np.uint8)[sy0:sy1, sx0:sx1]
    panels = [np.asarray(Image.fromarray(plane).resize(
        ((sx1 - sx0) * ZOOM, (sy1 - sy0) * ZOOM), Image.NEAREST))]
    if overlay is not None:
        ov = overlay[sy0:sy1, sx0:sx1]
        panels.append(np.asarray(Image.fromarray(ov).resize(
            ((sx1 - sx0) * ZOOM, (sy1 - sy0) * ZOOM), Image.NEAREST)))
    gap = np.full((panels[0].shape[0], 12, 3), 255, np.uint8)
    return Image.fromarray(np.concatenate(sum([[p, gap] for p in panels], [])[:-1], axis=1))


def fmt_bbox(bbox) -> str:
    return f"({bbox[0]},{bbox[1]})–({bbox[2]},{bbox[3]})" if bbox else "—"


# ---------------------------------------------------------------- main
def main() -> int:
    report = json.loads((OUT_AUD / "audit.json").read_text(encoding="utf-8"))
    rigs = C.discover_rigs()
    OUT.mkdir(parents=True, exist_ok=True)
    # Correction pass (captain m00768 / advisor m00772): mother-art alpha
    # exemption for "solid holes", head_base judged from the CURRENT layout,
    # straight-edge dL* left n/a because no pre-fix plate exists to compare.
    RC: dict = {}
    rc_path = OUT_AUD / "recheck.json"
    if rc_path.exists():
        RC = json.loads(rc_path.read_text(encoding="utf-8"))

    def rc_pose(key: str, pose: str) -> dict | None:
        return (RC.get("chars", {}).get(key, {}).get("pose", {}).get(pose))

    def holes_now(key: str, pose: str) -> tuple[int, int, int, bool]:
        """(n, px, largest, exempted) -- exempted numbers where recomputed."""
        j = report["rigs"][key]["poses"][pose]["holes"]
        r = rc_pose(key, pose)
        if r and r.get("holes_exempt"):
            e = r["holes_exempt"]
            return (e["enclosed_n"], e["enclosed_px"], e["largest_enclosed_px"], True)
        return (j["enclosed_n"], j["enclosed_px"], j["largest_enclosed_px"], False)

    from playwright.sync_api import sync_playwright
    rows: dict[str, dict] = {}
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="msedge", headless=True,
                                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page(viewport={"width": 400, "height": 400}, device_scale_factor=1)
        page.set_default_timeout(180000)
        for key in report["rigs"]:
            rig = rigs[key]
            rgba = np.asarray(C.grab(page, rig, {}, scale=1.0))
            ref = C.ref_alpha(rig) if rig.has_truth else None
            comps = hole_components(rgba, rig.window(), ref=ref,
                                    exempt_below=RC.get("exempt_below")) if ref is not None \
                else hole_components(rgba, rig.window())
            json_px = holes_now(key, "neutral")[1]
            got = sum(c["px"] for c in comps)
            if abs(got - json_px) > max(4, 0.02 * json_px):
                print(f"  ! {key}: neutral holes {got} != json {json_px}")
            png = OUT / f"{key}_zoom6x.png"
            ov = None
            op = OUT_AUD / f"{key}_neutral_defects.png"
            if op.exists():
                ov = np.asarray(Image.open(op).convert("RGB"))
            F = rig.face
            fallback = (F["left"], F["top"], F["left"] + F["width"], F["top"] + F["height"])
            crop_zoom(rgba, comps[0]["bbox"] if comps else fallback, ov).save(png)
            # Second row: the hole closest to the FACE outline -- that is the
            # "face part vs hair" ring the round-2 fix targets, which is usually
            # not the single biggest blob.
            fx, fy = F["left"], F["top"]
            def face_dist(c):
                x0, y0, x1, y1 = c["bbox"]
                return min(abs(x0 - fx), abs(x1 - (fx + F["width"])),
                           abs(y0 - fy), abs(y1 - (fy + F["height"])))
            face_comps = sorted(comps, key=face_dist)
            if face_comps and face_dist(face_comps[0]) <= 40 and \
                    face_comps[0]["bbox"] != comps[0]["bbox"]:
                row2 = crop_zoom(rgba, face_comps[0]["bbox"], ov)
                a = np.asarray(Image.open(png).convert("RGB"))
                b = np.asarray(row2)
                gap = np.full((12, a.shape[1], 3), 255, np.uint8)
                Image.fromarray(np.concatenate([a, gap, b], axis=0)).save(png)
                print(f"  (2 rows: biggest + face-edge @ {fmt_bbox(face_comps[0]['bbox'])})")
            rows[key] = {
                "comps": comps,
                "zoom": png.name,
                "overlays": {p: marker_bbox(OUT_AUD / f"{key}_{p}_defects.png")
                             for p in report["rigs"][key]["poses"]},
            }
            print(f"{key}: {len(comps)} comps, zoom -> {png.name}", flush=True)

    # ------------------------------------------------------------ markdown
    L: list[str] = []
    add = L.append
    add("# 新角色「黑框 / 黑缝」审计（第 2 轮 t2）\n")
    add(f"生成时间：{report['generated_at']}　口径实现：`preview/_diag/_audit/`"
        "（README §3 是阈值唯一真源）\n")
    add("取图：`preview/probe.html?scale=1.0` + "
        "`renderer.extract.base64(app.stage,'image/png')`，2048×2048 带 alpha，"
        "**没有用缩放截图**。姿态：静止 / 待机(stage_pose) / AngleX−6 / +6 / −10 / +10 / AX6+AY4。\n")
    add("> 本文件只做体检，**没有改任何资产**。修改建议见每节末尾。\n")
    add(f"> **快照**：v2 口径读数生成于 {RC.get('generated_at', '?')}。t5 正在并发重建这批 rig"
        "（glm 00:40、qwen 00:43、dounai 00:45），每个 rig 的数字只对它自己那版 build 成立 —— "
        "每节开头的「读数指纹」给出 layout/model3 的 mtime 与字节数，别把不同版本的数字混着比。\n")

    # summary verdicts
    add("\n## 0. 结论速览\n")
    add("| 角色 | 判定 | 一句话 |")
    add("|---|---|---|")
    notes = {
        "dounai": "00:45 重建版：双手已补（neutral truth 165→23），脸缘环缝 66→5 px；"
                  "stage_pose 的 truth 4967 是静态母图与头部位移的伪差（红环沿发际 2–3 px），不是缺件",
        "glm": "00:40 重建版：脸缘环缝 1619→19 px 基本修好（各姿态 ≤34，仅 anglex_m10 211 略超 200）；"
               "truth 仍因母图宽 172 px 置 n/a，右侧竖直裁切线需看叠加图确认是否还在",
        "qwen": "00:43 重建版：封闭洞 1078→0 px，neutral/stage_pose 都干净；其余姿态见下方 v1 行（旧 build）",
        "kimi": "发丝交叉/发梢的封闭空隙为主（豁免母图负空间后 162 px/…，原 1410）+ 脸缘细缝",
        "mimo": "原「1276 px 实心空洞」经母图 alpha 豁免后只剩 97 px（该块是母图发丝↔身体负空间）；剩余为脸缘环缝",
        "minimax": "封闭空洞豁免后 244 px，落在发丝-皮肤交界与衣领边；舞台暗像素 0；窗框不实心，open 不作判据",
        "kimi-prop": "与 kimi 同源（发丝空隙 + 脸缘缝），道具变体只是多一层道具",
        "mimo-prop": "与 mimo 同源；neutral「1222 px 最大域」同为母图负空间，豁免后见下表",
        "minimax-prop": "与 minimax 同源，豁免后见下表",
    }
    for key, r in report["rigs"].items():
        n0, h0, big0, ex0 = holes_now(key, "neutral")
        p0 = r["poses"]["neutral"]
        rcp = rc_pose(key, "neutral") or {}
        t0 = rcp.get("truth_in_window")
        if t0 is None:
            t0 = (p0["truth"] or {}).get("in_window") or 0
        seam0 = p0["dark"]["stage_px"]
        n1, h1, big1, _ = holes_now(key, "stage_pose")
        seam1 = r["poses"]["stage_pose"]["dark"]["stage_px"]
        worst_h = max(h0, h1)
        verdict = ("有黑框" if (worst_h >= M.HOLE_TOTAL_LIMIT
                                or t0 >= M.TRUTH_LIMIT["neutral"]
                                or max(seam0, seam1) > M.DARK_SEAM_LIMIT)
                   else "待确认" if (worst_h or seam0 or seam1) else "干净")
        add(f"| `{key}` | **{verdict}** | {notes.get(key, '')} |")

    # per-rig tables
    for key, r in report["rigs"].items():
        add(f"\n## {key}\n")
        fp = RC.get("chars", {}).get(key, {}).get("build_state") or {}
        if fp:
            add("- 读数指纹：" + "；".join(
                f"`{n}` @{v['mtime']} ({v['size']} B)" for n, v in fp.items())
                + f"　（口径 v2 生成于 {RC.get('generated_at', '?')}）")
        add(f"- build `{r['build']}`　layout `{r['layout']}`"
            + (f"　matte `{r['matte']}`" if r["matte"] else "　matte 无"))
        add(f"- 脸窗 {fmt_bbox(r['window'])}（2048 画布）")
        hb = RC.get("chars", {}).get(key, {}).get("head_base")
        if hb:
            add(f"　head_base（当前 layout `{hb['layout']}`）："
                + ("有，图像存在" if hb["exists"] else
                   ("层声明在、图像缺失" if hb["declared"] else "**无该层**")))
        else:
            add(f"　head_base 层：{'有' if r['has_plate'] else '无'}")
        if r["notes"]:
            add("- 备注：" + "；".join(r["notes"]))
        if r["truth_disabled"]:
            add("- truth 已置 n/a：母图与成品几何不符（见备注），不拿 truth 下结论")
        add("")
        add("| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |")
        add("|---|---|---|---|---|---|---|---|")
        for pose, p in r["poses"].items():
            h, d = p["holes"], p["dark"]
            n, hpx, big, ex = holes_now(key, pose)
            edge = p["edge"]
            dl = f"{edge['worst_long']:.2f}（{edge['long_edges_n']} 长边）" if edge else "n/a²"
            bbox, btag = rows[key]["overlays"].get(pose, (None, ""))
            steps = p.get("advisory_steps") or []
            step = max((s.get("dl_max", 0) for s in steps), default=None) if steps else None
            hole_cell = f"{n} / {hpx} px / {big}"
            if ex:
                hole_cell += f"（原 {h['enclosed_px']}）"
            elif key in RC.get("chars", {}):
                hole_cell += "（v1 未豁免）"
            rp = rc_pose(key, pose) or {}
            tval = rp.get("truth_in_window")
            if tval is None:
                tval = (p["truth"] or {}).get("in_window") or 0
            pass_pose = (hpx < M.HOLE_TOTAL_LIMIT and big <= M.HOLE_TOTAL_LIMIT
                         and d["stage_px"] <= M.DARK_SEAM_LIMIT
                         and tval < M.TRUTH_LIMIT.get(pose, 200))
            add(f"| {pose}{'²' if ex else ''} | {hole_cell} | {tval} | "
                f"{d['stage_px']} / {d['largest']} | {dl} | "
                f"{'' if step is None else f'{step:.2f}'} | {fmt_bbox(bbox)} | "
                f"{'FAIL' if not pass_pose else 'pass'} |")
        dl_reason = RC.get("chars", {}).get(key, {}).get("dlstar") or {}
        add("\n¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 "
            "L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。"
            "按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），"
            "但**都没有修复前版本可对比**，"
            "所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），"
            "在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。"
            + (f"　本 rig 备注：{dl_reason.get('reason', '')}" if dl_reason.get("reason") else ""))
        comps = rows[key]["comps"][:3]
        add("² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的"
            "发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；"
            "括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，"
            "其余姿态保留 v1 值（未豁免，偏保守）。")
        add(f"**6× 放大**：`{rows[key]['zoom']}` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。\n")
        if comps:
            add("neutral 最大的几个封闭域（2048 坐标）：")
            for c in comps:
                add(f"- {c['px']} px @ {fmt_bbox(c['bbox'])}")
            add("")
        # fix hint
        if key.startswith("dounai"):
            add("**修法**：补双手部件（或把 matte 的双手区域从 alpha 真值里去掉）；"
                "脸缘按下面统一做法。")
        elif key in ("glm", "qwen"):
            add("**修法**：① 脸部件 1–2 px 形态学外扩/闭运算后把 α≥24 硬化为 255"
                "（同 README_t7 的做法）；② 右侧竖直裁切线来自部件被矩形裁切，"
                "需把被裁的部件补回或让相邻部件覆盖过裁切线。")
        else:
            add("**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；"
                "发丝交叉处的空隙用同法在对应部件上补 1–2 px。")

    # registration facts
    add("\n## 附录 A. 注册与可上座状态（核对过源码，不引用旧说法）\n")
    add("| 角色 | `lib/stage.js` | `lib/client.js` `STAGE_CHARACTERS` | 能上座？ |")
    add("|---|---|---|---|")
    add("| dounai | 有（177 行起 `dounai: {dir:'build/dounai-v1'…}`） | "
        "**有**（1993 行，`scale 1.45 / dy 83 / dyCharH 182`） | 能 |")
    add("\n> 任务书里的说法「豆包已注册但还没接进 `STAGE_CHARACTERS`」与当前源码不符："
        "`lib/client.js:1940` 的 `STAGE_CHARACTERS` 里已经有 `dounai`（1993 行）。"
        "本轮审计仍然按 probe 单模型做（与上座路径无关），但如果要写「不能上座」请以源码为准。\n")

    (OUT / "README_audit.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {OUT/'README_audit.md'} ({len(L)} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())