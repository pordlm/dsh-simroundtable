import asyncio, io
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np

URL = "http://127.0.0.1:8848/preview/_bookfade.html"
STAGE = np.array([0x14, 0x12, 0x1a], dtype=np.float32)

async def layer(pg, which):
    out = {}
    for name, bg in (("blk", "%23000000"), ("wht", "%23ffffff")):
        await pg.goto(f"{URL}?which={which}&scale=0.4&bg={bg}")
        await pg.wait_for_function("document.title.startsWith('READY')", timeout=40000)
        await pg.wait_for_timeout(250)
        buf = await pg.screenshot()
        out[name] = np.asarray(Image.open(io.BytesIO(buf)).convert("RGB"))[:819, :819].astype(np.float32)
    a = np.clip(1.0 - (out["wht"] - out["blk"]).mean(axis=2) / 255.0, 0, 1)
    return out["blk"], a            # premultiplied colour, alpha

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True,
              args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 900, "height": 900})
        p1, a1 = await layer(pg, "primary")
        p2, a2 = await layer(pg, "variant")
        print("layer alpha: primary %.3f  variant %.3f" % (a1.mean(), a2.mean()))
        sil = (a1 > 0.02) | (a2 > 0.02)
        print("union silhouette px:", int(sil.sum()))
        for t in (0.25, 0.5, 0.75):
            for mode in ("old", "new"):
                if mode == "old":
                    m1, m2 = 1 - t, t
                else:
                    m2 = min(1.0, t * 2)
                    m1 = 1.0 if t <= 0.5 else max(0.0, min(1.0, (1 - t) * 2))
                at = 1 - (1 - m1 * a1) * (1 - m2 * a2)
                thru = float((at[sil] < 0.9).mean()) * 100
                print(f"{mode:3s} t={t:<5} primary={m1:.2f} variant={m2:.2f} "
                      f"see_through={thru:5.1f}%  mean_a={at[sil].mean():.3f}")
                if abs(t - 0.5) < 1e-6:
                    out = m2 * p2 + (1 - m2 * a2)[:, :, None] * (m1 * p1 + (1 - m1 * a1)[:, :, None] * STAGE)
                    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f"preview/_bookfade_{mode}.png")
        await b.close()

asyncio.run(main())
