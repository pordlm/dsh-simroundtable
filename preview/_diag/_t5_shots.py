# -*- coding: utf-8 -*-
"""t5: real-stage screenshots + the stage pixel scale measured from the live page.

Renders preview/stage-760.html in Edge (SwiftShader) and, before every shot,
reads back the *actual* transform each rig got: PIXI scale, position, local
bounds.  That gives the exact canvas-px -> stage-CSS-px factor k per seat, so a
"1x stage pixel" statement later is measured, not assumed (t4 used a k=0.379
derived from a user screenshot).

Shots (preview/_evidence/t5/):
  five_seat_1x.png / five_seat_2x.png      n=5, nobody speaking
  five_seat_active_2x.png                  n=5, Gemini speaking (nod + turn)
  two_seat_1x.png / two_seat_2x.png        n=2 Grok + Gemini
  head_grok_*_4x.png / head_gemini_*_4x.png  4x NEAREST crops of the head region
  stage_metrics.json                       per-seat k, positions, layout debug
"""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8848/preview/stage-760.html"
SEED = 20261103

SHOTS = [
    dict(tag="five_seat", n=5, names="Grok,Claude,Gemini,GPT,GLM", active=-1, dpr=1),
    dict(tag="five_seat", n=5, names="Grok,Claude,Gemini,GPT,GLM", active=-1, dpr=2),
    dict(tag="five_seat_active", n=5, names="Grok,Claude,Gemini,GPT,GLM", active=2, dpr=2),
    dict(tag="two_seat", n=2, names="Grok,Gemini", active=-1, dpr=1),
    dict(tag="two_seat", n=2, names="Grok,Gemini", active=-1, dpr=2),
]

MEASURE_JS = """
() => {
  const app = window.__app, models = window.__models || [];
  return {
    debug: JSON.parse(document.body.dataset.debug || '{}'),
    dpr: window.devicePixelRatio,
    canvas: { w: app.view.width, h: app.view.height,
              cssW: app.view.clientWidth, cssH: app.view.clientHeight,
              res: app.renderer.resolution },
    seats: models.map((m, i) => {
      if (!m) return null;
      const b = m._bounds ? m._bounds.getRectangle() : m.getLocalBounds();
      return {
        i, name: (m.__char && m.__char.key) || '?',
        scale: m.scale.x,
        pos: [m.x, m.y],
        localBounds: [b.x, b.y, b.width, b.height],
        height: m.height, width: m.width,
        rotation: m.rotation,
      };
    }),
  };
}
"""


def shot(page, spec, metrics):
    qs = f"?n={spec['n']}&names={spec['names']}&seed={SEED}&nogest=1"
    if spec["active"] >= 0:
        qs += f"&active={spec['active']}"
    else:
        qs += "&active=-1"
    url = BASE + qs
    page.goto(url, wait_until="load")
    page.wait_for_function(
        "() => window.__ready === true && window.__loaded === true"
        " && (window.__models||[]).filter(Boolean).length === %d" % spec["n"],
        timeout=180000,
    )
    # let the per-seat fade-in finish so no seat is half transparent
    page.wait_for_function(
        "() => (window.__models||[]).every(m => !m || (m.__fade||0) >= 1)", timeout=60000
    )
    page.wait_for_timeout(700)  # a few breath frames past fade-in
    data = page.evaluate(MEASURE_JS)
    el = page.query_selector("#inner")
    path = OUT / f"{spec['tag']}_{spec['dpr']}x.png"
    el.screenshot(path=str(path))
    data["shot"] = str(path)
    data["url"] = url
    data["size"] = [el.bounding_box()["width"], el.bounding_box()["height"]]
    metrics.append(data)
    print(f"{path.name}: {data['size']} css, dpr={data['dpr']}, "
          f"canvas={data['canvas']['w']}x{data['canvas']['h']}, res={data['canvas']['res']}")
    for s in data["seats"]:
        if s:
            print(f"   seat{s['i']} {s['name']:8s} scale={s['scale']:.5f} "
                  f"pos=({s['pos'][0]:.1f},{s['pos'][1]:.1f}) bounds={[round(v,1) for v in s['localBounds']]}")
    return data


def main() -> int:
    metrics = []
    with sync_playwright() as p:
        br = p.chromium.launch(
            channel="msedge", headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        for spec in SHOTS:
            ctx = br.new_context(viewport={"width": 820, "height": 680},
                                 device_scale_factor=spec["dpr"])
            page = ctx.new_page()
            page.set_default_timeout(180000)
            shot(page, spec, metrics)
            ctx.close()
        br.close()
    (OUT / "stage_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())