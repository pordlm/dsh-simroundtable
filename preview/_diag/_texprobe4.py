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
          const k=Object.keys(t);
          const v=t[k[0]];
          const desc=o=>{const r={};for(const kk of Object.keys(o||{})){const val=o[kk];r[kk]= (val&&typeof val==='object')? (val.constructor?val.constructor.name:'obj') : typeof val;}return r;};
          return {k, vKeys:Object.keys(v||{}), vDesc:desc(v), proto: v? Object.getOwnPropertyNames(Object.getPrototypeOf(v)).slice(0,12):null};
        }""")
        print(json.dumps(info)[:1200])
        await b.close()
asyncio.run(main())
