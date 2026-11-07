"""Are the torso-turn parameters even live on these rigs?

The slit only opens when the torso turns (`_evidence/safe_corner.txt`: with
BodyAngleX 0 the hole stays ~1271-1309 px at every head angle). The 60 s live
sample showed BodyAngleX pinned at 0.00, so check the rig's declared bounds --
if ParamBodyAngleX is 0..0 the parameter is locked in the .moc3 and no stage code
can turn the torso, which would explain why the slit never appears in practice.

Run: python preview\\_diag\\_param_bounds.py
"""
import asyncio, json
from playwright.async_api import async_playwright

MODELS = [
    ("gemini", "../assets/build/gemini-v1/gemini.layout.model3.json"),
    ("grok", "../assets/build/grok-v1/grok.layout.model3.json"),
    ("claude", "../assets/build/claude-v2/claude.layout.model3.json"),
]
PARAMS = ["ParamAngleX", "ParamAngleY", "ParamAngleZ",
          "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ",
          "ParamHairFront", "ParamHairBack", "ParamBreath"]
LOG = "preview/_evidence/param_bounds.txt"


def log(message, **_ignored):
    print(message, flush=True)
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1200, "height": 1200})
        for name, model in MODELS:
            await pg.goto(f"http://127.0.0.1:8848/preview/probe.html?raw=1&scale=0.60&model={model}")
            await pg.wait_for_function("() => !!window.__model", timeout=45000)
            bounds = await pg.evaluate("""(ids) => {
              const core = window.__model.internalModel.coreModel;
              const out = {};
              for (const id of ids) {
                try {
                  const index = core.getParameterIndex(id); out[id] = index < 0 ? null : [core.getParameterMinimumValue(index), core.getParameterMaximumValue(index)];
                } catch (e) { out[id] = null; }
              }
              return out;
            }""", PARAMS)
            log(f"\n[{name}]")
            for key, value in bounds.items():
                if value is None:
                    log(f"  {key:18s} missing")
                else:
                    locked = "  <- locked" if value[0] == value[1] else ""
                    log(f"  {key:18s} {value[0]:+.3f} .. {value[1]:+.3f}{locked}")
        await b.close()


asyncio.run(main())