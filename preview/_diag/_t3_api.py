# -*- coding: utf-8 -*-
"""t3 step 0: introspect the probe page API for per-drawable control + bounds."""
import json, sys
from playwright.sync_api import sync_playwright

URL = ("http://127.0.0.1:8848/preview/probe.html?scale=0.25"
       "&model=..%2Fassets%2Fbuild%2Fgemini-v1%2Fgemini.layout.model3.json")

JS = r"""
() => {
  const m = window.__model, im = m.internalModel, core = im.coreModel;
  const proto = (o) => o ? Object.getOwnPropertyNames(Object.getPrototypeOf(o)).filter(k => k !== 'constructor') : null;
  const out = { coreKeys: Object.keys(core), coreProto: proto(core) };
  try {
    const d = core.drawables;
    out.drawablesKeys = Object.keys(d);
    out.drawableIds = (d.ids || []).slice();
    out.nVerts = (d.vertexCounts || []).length;
    out.firstVerts = d.vertexPositions ? Array.from(d.vertexPositions.slice(0, 40)) : null;
    out.firstCount = d.vertexCounts ? d.vertexCounts[0] : null;
  } catch (e) { out.drawablesErr = String(e); }
  try { out.rawModel = proto(core._model || core.__proto__); } catch (e) { out.rawErr = String(e); }
  try { out.rendererKeys = Object.keys(im.renderer); } catch (e) { out.rendererErr = String(e); }
  try { out.rendererProto = proto(im.renderer); } catch (e) {}
  try { out.parts = im.parts && im.parts.ids; } catch (e) { out.partsErr = String(e); }
  return out;
}
"""

with sync_playwright() as p:
    br = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = br.new_page(viewport={"width": 600, "height": 600}, device_scale_factor=1)
    pg.goto(URL, wait_until="load")
    pg.wait_for_function("() => window.__model && document.title === 'READY'", timeout=60000)
    info = pg.evaluate(JS)
    txt = json.dumps(info, ensure_ascii=False, indent=1)
    print(txt)
    open(r"D:\dsh_simroundtable\preview\_evidence\t3_api.json", "w", encoding="utf-8").write(txt)
    br.close()
