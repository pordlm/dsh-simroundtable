import asyncio, json
from playwright.async_api import async_playwright

INIT = """
window.__samples = [];
const origAdd = PIXI.Container.prototype.addChild;
PIXI.Container.prototype.addChild = function (...nodes) {
  for (const n of nodes) {
    if (n && n.internalModel && n.internalModel.coreModel && !n.__tagged) {
      n.__tagged = true;
      window.__models = window.__models || [];
      window.__models.push(n);
    }
  }
  return origAdd.apply(this, nodes);
};
setInterval(() => {
  for (const m of (window.__models || [])) {
    const c = m.internalModel.coreModel;
    const g = (id) => { try { return c.getParameterValueById(id); } catch (e) { return null; } };
    window.__samples.push([g("ParamAngleX"), g("ParamAngleY"), g("ParamBodyAngleZ"), m.y]);
  }
}, 60);
"""

async def run(pg, url, label, wait=9000):
    await pg.goto(url)
    await pg.wait_for_timeout(wait)
    data = await pg.evaluate("window.__samples")
    xs = [d[0] for d in data if d and d[0] is not None]
    ys = [d[1] for d in data if d and d[1] is not None]
    bs = [d[2] for d in data if d and d[2] is not None]
    yy = [d[3] for d in data if d and d[3] is not None]
    if not xs:
        print(label, "no samples", len(data)); return
    print(f"{label}: n={len(xs)} AngleX {min(xs):+.2f}..{max(xs):+.2f} "
          f"AngleY {min(ys):+.2f}..{max(ys):+.2f} BodyZ {min(bs):+.2f}..{max(bs):+.2f} "
          f"y {min(yy):.1f}..{max(yy):.1f}")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width":900,"height":800})
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page()
        await run(pg, "http://127.0.0.1:8848/preview/stage-760.html?n=1&names=Claude&nogest=1&nolook=1", "stage")
        await run(pg, "http://127.0.0.1:8848/preview/claude-showcase.html", "showcase")
        await b.close()

asyncio.run(main())
