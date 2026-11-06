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
          const im=window.__model.internalModel, r=im.renderer;
          const keys=Object.keys(r);
          const found={};
          for (const k of keys) {
            const v=r[k];
            if (Array.isArray(v) && v.length && v[0] && v[0].baseTexture) found[k]=v.length;
            else if (v && v.baseTexture) found[k]='tex';
            else if (v && typeof v==='object' && v.textureStore) found[k]='store';
          }
          const st=r.textureStore ? Object.keys(r.textureStore) : null;
          const stT = r.textureStore && r.textureStore.textures;
          return {keys, found, st, stLen: Array.isArray(stT)? stT.length : (stT? Object.keys(stT).length : null)};
        }""")
        print(json.dumps(info)[:1500])
        await b.close()
asyncio.run(main())
