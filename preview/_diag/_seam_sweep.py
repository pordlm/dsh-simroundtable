"""量「露底色的缝」：把所有纯背景像素里、被模型包围的部分算出来。

旧口径（封闭空洞）只数「完全被不透明像素围住」的连通域，一旦缝有一条细颈连到
外部背景就被整体排除——这就是之前漏报黑缝的原因。这里改成：
    nonbg = 非背景像素
    closed = binary_closing(nonbg, 半径 R)   # 把 ≤2R 的细缝并进模型
    seam   = closed & bg                     # 模型内部露出的背景
再取最大连通域，就是肉眼看到的那条黑缝。

用法:
    python preview/_diag/_seam_sweep.py                 # 扫 AngleX
    python preview/_diag/_seam_sweep.py --body 3.2      # 同时给躯干角度
"""
import argparse
import asyncio
import pathlib

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVID = ROOT / "preview" / "_evidence"
BASE = "http://127.0.0.1:8848/preview/"
MODEL = "../assets/build/gemini-v1/gemini.layout.model3.json"
BG = (0, 255, 0)  # probe.html 的 raw 背景


def seam_stats(png: pathlib.Path, r: int = 9):
    im = np.asarray(Image.open(png).convert("RGB")).astype(np.int16)
    bg = (np.abs(im - np.array(BG)).max(axis=2) <= 6)
    nonbg = ~bg
    closed = ndimage.binary_closing(nonbg, structure=np.ones((r, r)), iterations=1)
    seal = closed & bg
    lab, n = ndimage.label(seal)
    if n == 0:
        return 0, 0
    sizes = ndimage.sum(seal, lab, range(1, n + 1))
    return int(sizes.max()), int(seal.sum())


def url(params: dict, scale=0.55):
    q = "&p=" + "&p=".join(f"{k}:{v}" for k, v in params.items()) if params else ""
    return BASE + "probe.html?model=" + MODEL + f"&scale={scale}&raw=1" + q


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--body", type=float, default=0.0)
    ap.add_argument("--hf", type=float, default=0.0)
    args = ap.parse_args()
    EVID.mkdir(parents=True, exist_ok=True)
    rows = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(
            channel="msedge", headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        pg = await b.new_page(viewport={"width": 700, "height": 700}, device_scale_factor=1)
        for ax in [10, 6, 4, 2, 0, -2, -4, -6, -8, -10, -12]:
            p = {"ParamAngleX": ax}
            if args.body:
                p["ParamBodyAngleX"] = args.body
            if args.hf:
                p["ParamHairFront"] = args.hf
            await pg.goto(url(p), wait_until="load")
            await pg.wait_for_timeout(1500)
            tag = f"ax{ax:+d}_b{args.body:g}_hf{args.hf:g}"
            out = EVID / f"seam_{tag}.png"
            await pg.screenshot(path=str(out))
            if out.stat().st_size < 2000:
                await pg.wait_for_timeout(400)
                await pg.screenshot(path=str(out))
            top, area = seam_stats(out)
            rows.append((ax, top, area))
            print(f"ax={ax:+3d}  body={args.body:g} hf={args.hf:g}  max_seam={top:5d}px²  seam_area={area:5d}px²")
        await b.close()
    txt = EVID / f"seam_sweep_b{args.body:g}_hf{args.hf:g}.txt"
    txt.write_text("\n".join(f"ax={a:+d}\tmax={t}\tarea={s}" for a, t, s in rows)
                   + f"\n\nmetric: bg={BG} closing r=9, 700x700 DPR1 scale0.55\n", encoding="utf-8")
    print("->", txt)


if __name__ == "__main__":
    asyncio.run(main())