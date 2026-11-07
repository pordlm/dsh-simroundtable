import asyncio
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":800,"height":620},device_scale_factor=2)
        await pg.goto(URL); await pg.wait_for_function("window.__ready===true",timeout=60000)
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path="preview/_evidence/stage_five_seats.png")
        print("ok")
        await b.close()
asyncio.run(main())
