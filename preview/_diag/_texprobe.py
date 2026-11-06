import asyncio, json
from playwright.async_api import async_playwright
GM="../assets/build/gemini-v1/gemini.layout.model3.json"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":1400})
        await pg.goto(f"http://127.0.0.1:8848/preview/probe.html?scale=0.35&model={GM}")
        await pg.wait_for_function("() => !!window.__app", timeout=45000)
        info=await pg.evaluate("""() => {
          const im=window.__model.internalModel;
          const out={keys:Object.keys(im)};
          out.texturesLen = im.textures ? im.textures.length : null;
          if (im.textures && im.textures.length) {
            const t=im.textures[0];
            out.bt = t.baseTexture ? {mipmode:t.baseTexture.mipmap, sm:t.baseTexture.scaleMode, valid:t.baseTexture.valid, res:t.baseTexture.resolution} : null;
          }
          out.children = im.coreModel ? 'core' : 'nocore';
          return out;
        }""")
        print(json.dumps(info, indent=1)[:1200])
        await b.close()
asyncio.run(main())
