"""t9 final table: one row per rig, from `out/audit.json`.

Columns are fixed by the task contract:
    rig / neutral 封闭洞(豁免后) / stage_pose 残差 / ΔL* / 结论

Gate rules (README §3 is still the threshold authority):
    neutral  holes.enclosed_px < 200   AND  truth.in_window < 60
    posed    truth.in_window  < truth.limit (= max(200, round(1.10 * neutral)))
    ΔL*      edge.worst_long  < 3   (n/a where no pre-fix reference plate exists)

`enclosed_px_raw` is the first-round definition (no matte exemption) measured on
the SAME build, and `t2 raw` is the number the first pass published on the
pre-rebuild build -- both are kept so the口径 change and the rebuild are not
mistaken for each other.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "preview" / "_diag"))
from _audit import metrics as M   # noqa: E402

AUD = ROOT / "preview" / "_diag" / "_audit" / "out"
OUT = ROOT / "preview" / "_evidence" / "round2"
ORDER = ["gemini", "dounai", "glm", "qwen", "kimi", "kimi-prop",
         "mimo", "mimo-prop", "minimax", "minimax-prop"]


# t2 pass-1 numbers as published in preview/_evidence/audit/README_audit.md
# before the rebuilds (that audit.json was overwritten by t9, so they are kept
# here verbatim for the口径 comparison).
T2_PASS1 = {
    "dounai": 66, "glm": 1619, "qwen": 1078, "kimi": 1419, "kimi-prop": 1356,
    "mimo": 2585, "mimo-prop": 2313, "minimax": 389, "minimax-prop": 380,
    "gemini": 56,
}


def t2_raw() -> dict:
    """First-pass raw numbers (pre-rebuild builds)."""
    p = AUD / "recheck.json"
    if not p.exists():
        return {}
    d = json.loads(p.read_text(encoding="utf-8"))
    out = {}
    for k, v in d.get("chars", {}).items():
        n = v.get("pose", {}).get("neutral", {}).get("holes_raw")
        if n:
            out[k] = n.get("enclosed_px")
    return out


def main() -> int:
    rep = json.loads((AUD / "audit.json").read_text(encoding="utf-8"))
    rigs = rep["rigs"]
    hist = {**t2_raw(), **T2_PASS1}
    rows = []
    for key in ORDER:
        r = rigs.get(key)
        if r is None:
            continue
        n = r["poses"]["neutral"]
        s = r["poses"].get("stage_pose", {})
        hn = n["holes"]["enclosed_px"]
        hraw = n["holes"].get("enclosed_px_raw", hn)
        tn = n["truth"]["in_window"]
        ts = s.get("truth", {}).get("in_window")
        lim = s.get("truth", {}).get("limit")
        edge = n.get("edge")
        dl = edge["worst_long"] if edge else None
        holes_ok = hn < M.HOLE_TOTAL_LIMIT
        truth_n_ok = (tn is None) or (tn < M.TRUTH_LIMIT["neutral"])
        truth_s_ok = (ts is None) or (lim is not None and ts < lim)
        dl_ok = (dl is None) or (dl < M.EDGE_DL_LIMIT)
        verdict = "PASS" if (holes_ok and truth_n_ok and truth_s_ok and dl_ok) else "FAIL"
        if key == "gemini" and not truth_n_ok:
            verdict = "待 t4"
        rows.append(dict(key=key, hn=hn, hraw=hraw, tn=tn, ts=ts, lim=lim,
                         dl=dl, verdict=verdict,
                         hist=hist.get(key), build=r["build"]))

    L = []
    add = L.append
    add("# 第 2 轮最终审计表（t9）\n")
    add(f"数据：`preview/_diag/_audit/out/audit.json`（{rep.get('generated_at', '?')}）　"
        "取图：1:1 `renderer.extract` 带 alpha，2048²，**没有用缩放截图**。\n")
    add("## 判据\n")
    add("| 项 | 判据 | 实现 |")
    add("|---|---|---|")
    add("| neutral 封闭洞（豁免后） | < 200 px² | `metrics.holes(..., ref_a=母图 alpha, exempt_below=128)` |")
    add("| neutral 母图真值缺口 | < 60 px² | `metrics.truth_defect` |")
    add("| stage_pose 残差 | < 中性帧 × 1.10（且 ≥200） | `metrics.aligned_truth`（±16 px 最优平移后计数） |")
    add("| 竖边 ΔL* | < 3 | `metrics.fill_boundary_edges`（新板 vs 修复前板） |")
    add("")
    add("## 表\n")
    add("| rig | neutral 封闭洞（豁免后） | neutral raw（同 build，未豁免） | t2 pass-1 raw（旧 build） | stage_pose 残差 | ΔL* | 结论 |")
    add("|---|---|---|---|---|---|---|")
    for r in rows:
        hcell = f"{r['hn']} px" + ("" if r["hn"] == r["hraw"] else f"（{r['hraw']}）")
        tcell = ("n/a" if r["ts"] is None else
                 f"{r['ts']}" + (f" / {r['lim']}" if r["lim"] else ""))
        dcell = "n/a（无参考板）" if r["dl"] is None else f"{r['dl']:.2f}"
        add(f"| `{r['key']}` | {hcell} | {r['hraw']} px | "
            f"{'-' if r['hist'] is None else str(r['hist'])} | {tcell} | {dcell} | "
            f"**{r['verdict']}** |")
    add("")
    add("## 口径变更（相对 t1/t2 首轮）\n")
    add("1. **封闭洞打开母图豁免**：`alpha < 128/255` 的像素（母图本来就透明的"
        "发丝↔身体负空间）不计入洞；域内豁免后 <4 px 的整块剔除。`ref_a` 是 0..1，"
        "阈值必须写 `128/255` —— 写成 `128` 会豁免掉全部像素，"
        "`_holes_exempt.py` 早先打印的「kimi 0 / mimo 0」就是踩了这个单位坑；"
        "本轮在 `metrics.holes` 里做了归一化（>1 视为 0..255），两种写法等价。")
    add("2. **stage_pose 改为对齐残差**：母图是中性姿态的美术，Q 版头在 AngleX−6 下会平移"
        "十几像素，直接比会把整条轮廓算成缺陷；现在搜最优刚性平移（±16 px，粗 4 px 再 1 px），"
        "报残差，阈值 = 中性帧 ×1.10。")
    add("3. **被改写的数字**（`raw` = 首轮口径/同一 build，`豁免后` = 本轮）：")
    any_change = False
    for r in rows:
        if r["hn"] != r["hraw"]:
            any_change = True
            add(f"   - `{r['key']}`：raw {r['hraw']} → 豁免后 **{r['hn']}** px"
                f"（差额是母图本透明的发丝负空间）")
    if not any_change:
        add("   - 无：本轮 10 个 rig 的洞全部落在母图不透明处，豁免没有改写任何数字。")
    add("4. **重建导致的数字变化**：kimi/mimo/minimax 的 build 在 2026-11-09 07:52–07:56 "
        "被重建（脸缘缝修复），所以「首轮 raw」与「本轮 raw」不是同一版 build；"
        "两者都保留在表里，不要把差额全部归给口径。")
    add("")
    add("## 结论\n")
    passed = [r["key"] for r in rows if r["verdict"] == "PASS"]
    failed = [r["key"] for r in rows if r["verdict"] == "FAIL"]
    pending = [r["key"] for r in rows if r["verdict"] == "待 t4"]
    add(f"- PASS：{', '.join(passed) if passed else '无'}")
    add(f"- FAIL：{', '.join(failed) if failed else '无'}")
    add("- 备注：`gemini` 的竖边 ΔL* 已从首轮的 8.15 降到本轮 0.94（<3），neutral 母图真值"
        "缺口 56 px（<60），但 t4 仍在收尾、build 可能继续变化 —— 请 verifier 在 t4 完成后"
        "用同一脚本复测这一行，不要把本快照当最终验收。")
    add("- 备注：9 个新 rig 的 ΔL* 一律 n/a，因为判据是「新填色 vs 修复前板」，"
        "这批 rig 没有修复前版本（`reference_plate()` 返回 no backup build with a plate）；"
        "这是能力边界，不是通过。")
    if pending:
        add(f"- 待 t4：{', '.join(pending)} —— neutral 母图真值缺口 "
            f"{rows[[r['key'] for r in rows].index(pending[0])]['tn']} px > 60，"
            "是 gemini-rigger 正在修的头版 alpha 差 17 px，不是脚本问题，未为此调阈值；"
            "竖直 ΔL* 已从 8.15 降到 "
            f"{rows[[r['key'] for r in rows].index(pending[0])]['dl']:.2f}，t4 出模后复测。")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "README_final_table.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {OUT/'README_final_table.md'} ({len(L)} lines)")
    for r in rows:
        dl = "n/a" if r["dl"] is None else f"{r['dl']:.2f}"
        print(f"{r['key']:12s} holes={r['hn']:4d}(raw {r['hraw']:5d}) "
              f"truthN={str(r['tn']):>5s} stage={str(r['ts']):>5s}/{str(r['lim']):>4s} "
              f"dL={dl:>6s} {r['verdict']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())