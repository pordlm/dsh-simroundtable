"""Grok idle: 20 s head/hair time series on the real stage harness.

Measures the non-speaking Grok seat in preview/stage-760.html and reports, for
each attribution mode:

  baseline  : what the stage does today
  idle-off  : motionManager cannot request/start an idle motion
  ay-off    : the library breath's ParamAngleY channel is cancelled at the last
              beforeModelUpdate (after breath + physics, before core.update)
  both      : idle-off + ay-off

Per mode it prints the peak-to-peak of ParamAngleY (and of the head-turn angle
actually driven into the rig), the front-hair range, corr(AngleX, HairFront),
and whether a motion ever started.

Run: python preview\\_diag\\_grok_stage_idle.py
"""
import asyncio
import json
import math
import os

from playwright.async_api import async_playwright

TAG = "?n=3&names=Grok,Claude,Gemini&active=1&nogest=1&seed=20261103"
URL = "http://127.0.0.1:8848/preview/stage-760.html" + TAG
EVID = "preview/_evidence"
HEAD_Y_RATIO = 0.42  # top 42 % of the model bounds is the head band

ARM = r"""
(cfg) => {
  const m = (window.__models || []).find(x => x && x.__char && x.__char.key === 'grok');
  if (!m) return {error: 'no grok seat'};
  const im = m.internalModel;
  const cm = im.coreModel;
  const g = id => { try { return cm.getParameterValueById(id); } catch (e) { return null; } };
  const mm = im.motionManager;
  const probe = window.__probe = {cfg, frames: [], hook: 0, motions: [], state: {}};
  im.on('motionStart', (group) => probe.motions.push([performance.now(), group]));
  im.on('beforeModelUpdate', () => {
    probe.hook++;
    if (cfg.killAy) { try { cm.setParameterValueById('ParamAngleY', 0); } catch (e) {} }
    probe.frames.push([performance.now(), g('ParamAngleX'), g('ParamAngleY'), g('ParamHairFront'),
                       g('ParamHairBack'), g('ParamBodyAngleZ'), g('ParamEyeLOpen'), g('ParamMouthOpenY')]);
  });
  probe.state = {
    defs: mm.definitions ? Object.keys(mm.definitions) : null,
    groups: mm.groups ? Object.keys(mm.groups) : null,
    idleGroup: mm.groups ? mm.groups.idle : null,
    playing: mm.playing, currentGroup: mm.currentGroup,
  };
  if (cfg.blockIdle) {
    try {
      mm.stopAllMotions();
      if (mm.groups) mm.groups.idle = undefined;
      mm.shouldRequestIdleMotion = () => false;
      mm.startRandomMotion = function () { return Promise.resolve(false); };
      probe.state.afterBlock = {groups: mm.groups ? Object.keys(mm.groups) : null,
                                playing: mm.playing, currentGroup: mm.currentGroup};
    } catch (e) { probe.state.blockErr = String(e); }
  }
  return probe.state;
}
"""

READ = r"""
() => {
  const p = window.__probe;
  const m = (window.__models || []).find(x => x && x.__char && x.__char.key === 'grok');
  const im = m.internalModel, mm = im.motionManager;
  const out = {frames: p.frames, hook: p.hook, motions: p.motions,
    now: {playing: mm.playing, currentGroup: mm.currentGroup, groups: mm.groups ? Object.keys(mm.groups) : null}};
  p.frames = []; p.hook = 0; p.motions = [];
  return out;
}
"""


def stats(rows, idx):
    v = [r[idx] for r in rows if r[idx] is not None]
    return (min(v), max(v), max(v) - min(v)) if v else (None, None, None)


def corr(xs, ys):
    xs = [x for x, y in zip(xs, ys) if x is not None and y is not None]
    ys = [y for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(xs) < 3:
        return None
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return num / (dx * dy) if dx and dy else None


async def run_mode(b, label, cfg, shot=False):
    ctx = await b.new_context(viewport={"width": 900, "height": 900})
    pg = await ctx.new_page()
    await pg.goto(URL)
    await pg.wait_for_function(
        "() => window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=60000)
    await pg.wait_for_timeout(1200)
    state = await pg.evaluate(ARM, cfg)
    await pg.wait_for_timeout(20000)
    data = await pg.evaluate(READ)
    rows = data["frames"]
    ax, ay, hf, hb, bz, eye, mouth = (stats(rows, i) for i in range(1, 8))
    t0 = rows[0][0] if rows else 0
    span = (rows[-1][0] - t0) / 1000 if rows else 0
    c_ax_hf = corr([r[1] for r in rows], [r[3] for r in rows])
    c_t_ay = corr([(r[0] - t0) / 1000 for r in rows], [r[2] for r in rows])
    print(f"\n[{label}] cfg={json.dumps(cfg)} frames={len(rows)} span={span:.1f}s "
          f"hookCalls={data['hook']} ({data['hook']/span:.1f}/s)")
    print(f"  AngleX {ax[0]:+.2f}..{ax[1]:+.2f} p-p {ax[2]:.2f} | "
          f"AngleY {ay[0]:+.2f}..{ay[1]:+.2f} p-p {ay[2]:.2f} | "
          f"HairFront {hf[0]:+.3f}..{hf[1]:+.3f} p-p {hf[2]:.3f}")
    print(f"  HairBack {hb[0]:+.3f}..{hb[1]:+.3f} p-p {hb[2]:.3f} | "
          f"BodyZ {bz[0]:+.2f}..{bz[1]:+.2f} p-p {bz[2]:.2f} | "
          f"Eye {eye[0]:.2f}..{eye[1]:.2f} | Mouth {mouth[0]:+.2f}..{mouth[1]:+.2f}")
    print(f"  corr(AngleX,HairFront)={c_ax_hf:+.3f}  corr(t,AngleY)={c_t_ay:+.3f}")
    print(f"  initial state: {json.dumps(state)}")
    print(f"  end state: {json.dumps(data['now'])}  motionStarts={len(data['motions'])} "
          f"{[x[1] for x in data['motions'][:6]]}")
    if shot:
        m = await pg.evaluate(
            "() => { const m=(window.__models||[]).find(x=>x&&x.__char&&x.__char.key==='grok');"
            "const b=m.getBounds(); return {x:b.x,y:b.y,w:b.width,h:b.height}; }")
        path = os.path.join(EVID, f"grok_head_{label}.png")
        await pg.screenshot(path=path, clip={"x": max(0, m["x"] - 10), "y": max(0, m["y"]),
                                             "width": min(900, m["w"] + 20),
                                             "height": max(10, m["h"] * HEAD_Y_RATIO)})
        print(f"  shot -> {path}")
    await ctx.close()
    return rows


async def main():
    os.makedirs(EVID, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        await run_mode(b, "baseline", {"blockIdle": False, "killAy": False}, shot=True)
        await run_mode(b, "idle_off", {"blockIdle": True, "killAy": False})
        await run_mode(b, "ay_off", {"blockIdle": False, "killAy": True})
        await run_mode(b, "both_off", {"blockIdle": True, "killAy": True}, shot=True)
        await b.close()

asyncio.run(main())