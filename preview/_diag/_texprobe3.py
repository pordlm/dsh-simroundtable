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
          const t=window.__model.internalModel.renderer._textures;
          const one=Array.isArray(t)? t[0] : t;
          const bt=one && one.baseTexture;
          return {isArray:Array.isArray(t), len:Array.isArray(t)?t.length:null, type:one&&one.constructor&&one.constructor.name,
                  bt: bt? {w:bt.width,h:bt.height,mip:bt.mipmap,sm:bt.scaleMode,valid:bt.valid,res:bt.resolution,aniso:bt.anisotropicLevel} : null};
        }""")
        print(json.dumps(info)[:800])
        await b.close()
asyncio.run(main())
