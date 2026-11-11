# -*- coding: utf-8 -*-
"""t5: stage A/B screenshots for Gemini (shipped plate vs pre-t4 plate).

Reuses preview/stage-760.html with every request for assets/build/gemini-v1/*
fulfilled from assets/build/gemini-v1.bak/*, so both frames go through exactly
the same stage code, camera, DPR and seed; only the rig differs.  Pose comes from
the library's own breath, so the two frames are close but not pixel-identical;
the plate footprint (face rect) is static, so the pale band is comparable.

Writes preview/_evidence/t5/stage_old_{tag}_2x.png and stage_AB_{tag}_8x.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\dsh_simroundtable")
OUT = ROOT / "preview" / "_evidence" / "t5"
OLD = ROOT / "assets" / "build" / "gemini-v1.bak"
BASE = "http://127.0.0.1:8848/preview/stage-760.html"
SEED = 20261103
URLS = {
    "five": f"{BASE}?n=5&names=Grok,Claude,Gemini,GPT,GLM&seed={SEED}&nogest=1&active=-1",
    "two": f"{BASE}?n=2&names=Grok,Gemini&seed={SEED}&nogest=1&active=-1",
}
# CSS-pixel crop boxes around the Gemini head (measured from stage_metrics/layout)
CROPS = {"five": (330, 165, 440, 285), "two": (509, 185, 619, 305)}


def capture(page, url, n, path):
    page.goto(url, wait_until="load")
    page.wait_for_function(
        f"() => window.__ready === true && window.__loaded === true"
        f" && (window.__models||[]).filter(Boolean).length === {n}", timeout=180000)
    page.wait_for_function(
        "() => (window.__models||[]).every(m => !m || (m.__fade||0) >= 1)", timeout=60000)
    page.wait_for_timeout(900)
    page.query_selector("#inner").screenshot(path=str(path))


def main() -> int:
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True,
                               args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for tag, url in URLS.items():
            n = 5 if tag == "five" else 2
            # new / shipped
            ctx = br.new_context(viewport={"width": 820, "height": 680}, device_scale_factor=2)
            pg = ctx.new_page()
            pg.set_default_timeout(180000)
            capture(pg, url, n, OUT / f"stage_new_{tag}_2x.png")
            ctx.close()

            # old / pre-fix, same code path, asset URLs remapped to the backup build
            ctx = br.new_context(viewport={"width": 820, "height": 680}, device_scale_factor=2)
            pg = ctx.new_page()
            pg.set_default_timeout(180000)

            def reroute(route):
                url_path = route.request.url.split("?")[0]
                rel = url_path.split("/assets/build/gemini-v1/")[-1]
                f = OLD / rel
                if not f.is_file():
                    return route.continue_()
                ctype = "image/png" if f.suffix == ".png" else (
                    "application/json" if f.suffix == ".json" else "application/octet-stream")
                route.fulfill(status=200, body=f.read_bytes(), content_type=ctype)

            pg.route("**/assets/build/gemini-v1/*", reroute)
            capture(pg, url, n, OUT / f"stage_old_{tag}_2x.png")
            ctx.close()

            box = tuple(int(v * 2) for v in CROPS[tag])
            a = Image.open(OUT / f"stage_new_{tag}_2x.png").convert("RGB").crop(box)
            b = Image.open(OUT / f"stage_old_{tag}_2x.png").convert("RGB").crop(box)
            z = 4
            a = a.resize((a.width * z, a.height * z), Image.NEAREST)
            b = b.resize((b.width * z, b.height * z), Image.NEAREST)
            sheet = Image.new("RGB", (a.width * 2 + 20, a.height), (6, 8, 12))
            sheet.paste(b, (0, 0))
            sheet.paste(a, (a.width + 20, 0))
            d = ImageDraw.Draw(sheet)
            d.text((6, 4), "OLD plate (pre-t4)", fill=(255, 210, 120))
            d.text((a.width + 26, 4), "NEW plate (shipped)", fill=(120, 240, 200))
            sheet.save(OUT / f"stage_AB_{tag}_8x.png")
            print(f"{tag}: wrote stage_AB_{tag}_8x.png {sheet.size}")
        br.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())