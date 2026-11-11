"""Gemini 图层错位取证：同一模型在「原始探针」与「舞台」两处的近景对比。

用法: python preview/_diag/_gem_zoom.py
产出: preview/_evidence/gemini_probe_zoom.png（probe.html，全参数 0，raw）
      preview/_evidence/gemini_stage_zoom.png（stage-760 真舞台，只坐 Gemini）
"""
import asyncio
import datetime
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVID = ROOT / "preview" / "_evidence"
BASE = "http://127.0.0.1:8848/preview/"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"


def profile(name: str) -> pathlib.Path:
    # 必须 Join-Path 语义：绝不能字符串拼到盘根去（HANDOFF §1 的坑）
    p = ROOT / ".edge-tmp" / name
    p.mkdir(parents=True, exist_ok=True)
    return p


async def shot(url: str, out: pathlib.Path, clip=None, dsf=2, wait_ms=3000, ready=None):
    async with async_playwright() as pw:
        b = await pw.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        pg = await b.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=dsf)
        pg.on("console", lambda m: print("CONSOLE", m.type, m.text[:160]))
        pg.on("pageerror", lambda e: print("PAGEERROR", str(e)[:200]))
        await pg.goto(url, wait_until="load")
        if ready:
            try:
                await pg.wait_for_function(ready, timeout=25000)
            except Exception as e:  # noqa: BLE001
                print("READY TIMEOUT", e)
        await pg.wait_for_timeout(wait_ms)
        await pg.screenshot(path=str(out), clip=clip)
        await pg.wait_for_timeout(200)  # 首张偶发 0 字节
        if out.stat().st_size < 2000:
            await pg.screenshot(path=str(out), clip=clip)
        await b.close()
    print(f"wrote {out} {out.stat().st_size} B")


async def main():
    EVID.mkdir(parents=True, exist_ok=True)
    await shot(
        BASE + "probe.html?model=" + MODEL + "&scale=1.0&raw=1",
        EVID / "gemini_probe_zoom.png",
        ready="window.__app && window.__model",
    )
    await shot(
        BASE + "stage-760.html?n=1&names=Gemini&nogest=1&nolook=1",
        EVID / "gemini_stage_zoom.png",
        clip={"x": 200, "y": 40, "width": 420, "height": 420},
        ready="window.__stageReady === true || window.__ready === true",
    )


if __name__ == "__main__":
    if "--stamp" in sys.argv:
        print(datetime.datetime.now().isoformat())
    asyncio.run(main())