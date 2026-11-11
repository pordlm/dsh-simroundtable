"""Gemini 「图层错位」参数矩阵：用探针逐参数复现，看哪一档会裂。

产出 preview/_evidence/gem_case_<标签>.png（头部 2x 裁剪）
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVID = ROOT / "preview" / "_evidence"
BASE = "http://127.0.0.1:8848/preview/"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"

CASES = {
    "hf0": {},
    "hf12": {"ParamHairFront": 0.12},
    "hf22": {"ParamHairFront": 0.22},
    "baz32": {"ParamBodyAngleZ": 3.2},
    "ax10hf22": {"ParamAngleX": -10, "ParamHairFront": 0.22},
    "all": {"ParamAngleX": -10, "ParamHairFront": 0.22, "ParamBodyAngleZ": 3.2, "ParamAngleY": 5, "ParamBreath": 1},
}


def qs(p):
    if not p:
        return ""
    return "&p=" + "&p=".join(f"{k}:{v}" for k, v in p.items())


async def main():
    EVID.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        for tag, params in CASES.items():
            url = BASE + "probe.html?model=" + MODEL + "&scale=0.55&raw=1" + qs(params)
            pg = await b.new_page(viewport={"width": 760, "height": 760}, device_scale_factor=2)
            await pg.goto(url, wait_until="load")
            await pg.wait_for_timeout(2200)
            out = EVID / f"gem_case_{tag}.png"
            await pg.screenshot(path=str(out))
            if out.stat().st_size < 2000:
                await pg.wait_for_timeout(400)
                await pg.screenshot(path=str(out))
            print(tag, out.stat().st_size, "B")
            await pg.close()
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())