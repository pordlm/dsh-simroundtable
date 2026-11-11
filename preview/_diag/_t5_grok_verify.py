# -*- coding: utf-8 -*-
"""t5: independent re-verification of the Grok idle fix on the real stage.

Pass 1 (active=1, Grok idle): 20 s of ParamAngleY / ParamHairFront sampling from a
`beforeModelUpdate` hook registered after the stage's acting hook, i.e. exactly
the values the single core.update() of that frame consumes.

Pass 2 (active=0, Grok speaking): 8 s, to prove the acting nod was not flattened
together with the passive breath nod.

Writes preview/_evidence/t5/grok_verify.json|txt and grok_{idle,acting}_head.png
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(r"D:\dsh_simroundtable\preview\_evidence\t5")
BASE = "http://127.0.0.1:8848/preview/stage-760.html?n=3&names=Grok,Claude,Gemini&nogest=1&seed=20261103"

COLLECT = """
() => {
  const models = window.__models || [];
  const m = models.find((x) => x && x.__char && x.__char.key === 'grok');
  if (!m) return { error: 'no grok seat' };
  const im = m.internalModel, core = im.coreModel;
  const read = (id) => { try { return Number(core.getParameterValueById(id)) || 0; } catch (e) { return 0; } };
  const rows = [];
  const state = { idleGroup: null, playing: null, motionStarts: 0 };
  const mm = im.motionManager;
  if (mm && mm.groups) state.idleGroup = mm.groups.idle === undefined ? 'undefined' : 'set';
  if (mm) {
    state.playing = typeof mm.isFinished === 'function' ? !mm.isFinished() : null;
    const orig = mm.startRandomMotion && mm.startRandomMotion.bind(mm);
    if (orig) mm.startRandomMotion = function (...args) { state.motionStarts += 1; return orig(...args); };
  }
  im.on('beforeModelUpdate', () => {
    rows.push({ t: performance.now(),
      ax: read('ParamAngleX'), ay: read('ParamAngleY'), az: read('ParamAngleZ'),
      hf: read('ParamHairFront'), hb: read('ParamHairBack'), bz: read('ParamBodyAngleZ') });
  });
  window.__verify = { rows, state, m };
  return { ok: true };
}
"""


def corr(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def lagged_corr(ax, hf, lag):
    if lag > 0:
        return corr(ax[lag:], hf[:-lag])
    if lag < 0:
        return corr(ax[:lag], hf[-lag:])
    return corr(ax, hf)


def run_pass(br, url, seconds, png: Path):
    ctx = br.new_context(viewport={"width": 900, "height": 900}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.set_default_timeout(120000)
    pg.goto(url, wait_until="load")
    pg.wait_for_function("() => window.__loaded === true && (window.__models||[]).filter(Boolean).length >= 3",
                        timeout=120000)
    pg.wait_for_timeout(800)
    info = pg.evaluate(COLLECT)
    pg.wait_for_timeout(int(seconds * 1000))
    data = pg.evaluate("() => ({ rows: window.__verify.rows, state: window.__verify.state })")
    bounds = pg.evaluate("() => { const b = window.__verify.m.getBounds();"
                         " return {x: b.x, y: b.y, w: b.width, h: b.height}; }")
    clip = {"x": max(0, bounds["x"] - 10), "y": max(0, bounds["y"]), "width": max(20, bounds["w"] + 20),
            "height": max(20, bounds["h"] * 0.45)}
    pg.screenshot(path=str(png), clip=clip)
    ctx.close()
    return info, data


def main() -> int:
    res = {}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        info, data = run_pass(br, BASE + "&active=1", 20, OUT / "grok_idle_head.png")
        rows, state = data["rows"], data["state"]
        ax = [r["ax"] for r in rows]
        ay = [r["ay"] for r in rows]
        az = [r["az"] for r in rows]
        hf = [r["hf"] for r in rows]
        hb = [r["hb"] for r in rows]
        span = (rows[-1]["t"] - rows[0]["t"]) / 1000 if rows else 0
        c_hf = corr(ax, hf)
        rail = sum(1 for v in hf if abs(abs(v) - 0.22) < 1e-6)
        lags = {str(k): round(lagged_corr(ax, hf, k), 3) for k in (-3, -2, -1, 0, 1, 2, 3)} if c_hf is not None else {}
        res["idle"] = {
            "frames": len(rows), "seconds": round(span, 2), "hz": round(len(rows) / max(span, 1e-9), 1),
            "param_angle_y_pp": round(max(ay) - min(ay), 3),
            "param_angle_x_pp": round(max(ax) - min(ax), 3),
            "param_angle_z_pp": round(max(az) - min(az), 3),
            "hair_front_pp": round(max(hf) - min(hf), 3),
            "hair_back_pp": round(max(hb) - min(hb), 3),
            "corr_angleX_hairFront": None if c_hf is None else round(c_hf, 3),
            "lagged_corr": lags,
            "rail_hits": rail,
            "idle_group": state["idleGroup"], "motion_playing": state["playing"],
            "motion_starts": state["motionStarts"],
        }
        info2, data2 = run_pass(br, BASE + "&active=0", 8, OUT / "grok_acting_head.png")
        rows2 = data2["rows"]
        ay2 = [r["ay"] for r in rows2]
        hf2 = [r["hf"] for r in rows2]
        ax2 = [r["ax"] for r in rows2]
        res["acting"] = {
            "frames": len(rows2),
            "param_angle_y_pp": round(max(ay2) - min(ay2), 3),
            "hair_front_pp": round(max(hf2) - min(hf2), 3),
            "corr_angleX_hairFront": None if corr(ax2, hf2) is None else round(corr(ax2, hf2), 3),
        }
        br.close()

    idle = res["idle"]
    idle["verdict_nod"] = "PASS" if idle["param_angle_y_pp"] < 1.5 else "FAIL"
    idle["verdict_hair"] = "PASS" if (idle["corr_angleX_hairFront"] or 0) > 0.9 and idle["rail_hits"] == 0 else "FAIL"
    idle["verdict_idle_off"] = "PASS" if idle["idle_group"] == "undefined" and idle["motion_playing"] is False else "FAIL"
    res["acting"]["verdict_nod_alive"] = "PASS" if res["acting"]["param_angle_y_pp"] > 3 else "FAIL"

    print(json.dumps(res, ensure_ascii=False, indent=1))
    (OUT / "grok_verify.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        "t5 / Grok idle re-verification (stage-760.html, hook after acting effect)",
        f"  idle pass: {idle['frames']} frames / {idle['seconds']} s ({idle['hz']} Hz)",
        f"  ParamAngleY p-p {idle['param_angle_y_pp']} deg  (limit < 1.5)  {idle['verdict_nod']}",
        f"  ParamHairFront p-p {idle['hair_front_pp']}, corr(AngleX,HairFront) "
        f"{idle['corr_angleX_hairFront']}, rail {idle['rail_hits']}  {idle['verdict_hair']}",
        f"  corr by lag: {idle['lagged_corr']}",
        f"  motionManager.groups.idle {idle['idle_group']}, playing {idle['motion_playing']}, "
        f"startRandomMotion calls {idle['motion_starts']}  {idle['verdict_idle_off']}",
        f"  acting pass (Grok speaks): AngleY p-p {res['acting']['param_angle_y_pp']} deg  "
        f"{res['acting']['verdict_nod_alive']}",
    ]
    (OUT / "grok_verify.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())