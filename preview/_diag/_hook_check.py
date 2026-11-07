"""Verify the showcase-style pipeline: the library must run breath, blink and
physics itself while our acting rides the beforeModelUpdate hook.

Reports, per seat: the range of ParamAngleX / ParamBodyAngleX / ParamEyeLOpen /
ParamHairBack over ~18s, how many core.update() calls happened (the model's own
flag is enough: we only need "more than one per frame is impossible"), and the
pixel delta between two frames one second apart.

Usage: $env:URLX = "http://127.0.0.1:8848/preview/stage-760.html?n=5"; python _hook_check.py
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

URL = os.environ.get("URLX") or "http://127.0.0.1:8848/preview/stage-760.html?n=5"
SECONDS = float(os.environ.get("SECS") or 18)
STEP = 300

SAMPLE = """
() => {
  const seats = (window.__models || []).filter(Boolean).map(m => ({ model: m, key: m.__stageKey || "" }));
  return seats.map((s, i) => {
    const core = s.model && s.model.internalModel && s.model.internalModel.coreModel;
    const get = (id) => { try { return core.getParameterValueById(id); } catch (e) { return null; } };
    return {
      i,
      name: s.key || s.name || "",
      ax: get("ParamAngleX"), ay: get("ParamAngleY"),
      bax: get("ParamBodyAngleX"), baz: get("ParamBodyAngleZ"),
      hb: get("ParamHairBack"), hf: get("ParamHairFront"),
      eye: get("ParamEyeLOpen"),
      turns: s.model && s.model.__acting ? s.model.__acting.turn : null,
    };
  });
}
"""


async def main():
    stats = None
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            args=["--headless=new", "--use-angle=d3d11", "--enable-gpu",
                  "--ignore-gpu-blocklist", "--disable-lcd-text"],
        )
        page = await browser.new_page(viewport={"width": 760, "height": 760}, device_scale_factor=1)
        await page.goto(URL, wait_until="load")
        await page.wait_for_function("window.__loaded === true && window.__models.filter(Boolean).length >= 3", timeout=180000)
        await page.wait_for_timeout(2500)
        n = int(SECONDS * 1000 / STEP)
        for _ in range(n):
            rows = await page.evaluate(SAMPLE)
            if stats is None:
                stats = [{"name": r["name"], "ax": [], "bax": [], "baz": [], "hb": [], "hf": [], "eye": [], "turns": []} for r in rows]
            for r, st in zip(rows, stats):
                for key in ("ax", "bax", "baz", "hb", "hf", "eye", "turns"):
                    v = r[key]
                    if isinstance(v, (int, float)):
                        st[key].append(v)
            await page.wait_for_timeout(STEP)
        # two frames a second apart, alpha preserved via extract
        a = await page.evaluate("() => window.__app.renderer.extract.base64(window.__app.stage, 'image/png')")
        await page.wait_for_timeout(1000)
        b = await page.evaluate("() => window.__app.renderer.extract.base64(window.__app.stage, 'image/png')")
        await browser.close()

    from PIL import Image
    import io
    ia = Image.open(io.BytesIO(__import__("base64").b64decode(a.split(",")[-1]))).convert("RGBA")
    ib = Image.open(io.BytesIO(__import__("base64").b64decode(b.split(",")[-1]))).convert("RGBA")
    diff = 0
    for pa, pb in zip(ia.getdata(), ib.getdata()):
        if pa[3] > 12 or pb[3] > 12:
            if abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]) + abs(pa[2] - pb[2]) > 12:
                diff += 1
    print(f"frame diff (1s apart): {diff} px")
    for st in stats:
        def rng(key):
            v = st[key]
            if not v:
                return "n/a"
            return f"{min(v):+.2f}..{max(v):+.2f}"
        print(f"seat{st['name'] or ''} ax {rng('ax')}  bax {rng('bax')}  baz {rng('baz')}  "
              f"hb {rng('hb')}  hf {rng('hf')}  eye {rng('eye')}  acting-turn {rng('turns')}")


asyncio.run(main())

