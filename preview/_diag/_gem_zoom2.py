"""Gemini 图层取证 2：正常缩放的 probe 对照 + 舞台 404 资源明细。

产出: preview/_evidence/gemini_probe_035.png  (probe.html scale=0.35, 全参数 0)
      preview/_evidence/gemini_stage_seat.png  (stage-760 只坐 Gemini, 剪座位)
      preview/_evidence/reqs_gemini.txt        (所有非 2xx 请求)
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVID = ROOT / "preview" / "_evidence"
BASE = "http://127.0.0.1:8848/preview/"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"


async def run(url, out, clip=None, dsf=2, wait=2500, tag=""):
    bad = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        pg = await b.new_page(viewport={"width": 900, "height": 760}, device_scale_factor=dsf)
        pg.on("response", lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
        pg.on("requestfailed", lambda r: bad.append(("FAIL", r.url)))
        await pg.goto(url, wait_until="load")
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=str(out), clip=clip)
        if out.stat().st_size < 2000:
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=str(out), clip=clip)
        await b.close()
    print(f"[{tag}] {out.name} {out.stat().st_size} B; bad={bad}")
    return bad


async def main():
    EVID.mkdir(parents=True, exist_ok=True)
    bad = []
    bad += await run(BASE + "probe.html?model=" + MODEL + "&scale=0.35", EVID / "gemini_probe_035.png", tag="probe")
    bad += await run(
        BASE + "stage-760.html?n=1&names=Gemini&nogest=1&nolook=1",
        EVID / "gemini_stage_seat.png",
        clip={"x": 170, "y": 20, "width": 460, "height": 460},
        tag="stage",
    )
    (EVID / "reqs_gemini.txt").write_text("\n".join(f"{s} {u}" for s, u in bad), encoding="utf-8")
    print("reqs ->", EVID / "reqs_gemini.txt")


if __name__ == "__main__":
    asyncio.run(main())