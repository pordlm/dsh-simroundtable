import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ.get("URLX")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            args=["--headless=new","--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":760,"height":760})
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_function("window.__loaded === true", timeout=180000)
        await pg.wait_for_timeout(2000)
        acc = [{"hair":[], "turn":[]} for _ in range(3)]
        for _ in range(40):
            rows = await pg.evaluate("() => window.__models.filter(Boolean).map(m => m.__applied || null)")
            for r, a in zip(rows, acc):
                if r: a["hair"].append(r["hair"]); a["turn"].append(r["turn"])
            await pg.wait_for_timeout(250)
        for i, a in enumerate(acc):
            h, t = a["hair"], a["turn"]
            print(f"seat{i} applied hair {min(h):+.3f}..{max(h):+.3f}  turn {min(t):+.2f}..{max(t):+.2f}  frames {len(h)}")
        # one frame as a file for the eyes
        data = await pg.evaluate("() => window.__app.renderer.extract.base64(window.__app.stage, 'image/png')")
        import base64
        open("preview/_evidence/hook_stage_frame.png","wb").write(base64.b64decode(data.split(",")[-1]))
        await b.close()
asyncio.run(main())
