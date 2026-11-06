import asyncio, os
from playwright.async_api import async_playwright
URL=os.environ["URLX"]
JS="""() => window.__models.map(m => { const cm=m.internalModel.coreModel;
 const g=id=>{try{return cm.getParameterValueById(id)}catch(e){return null}};
 return { ax:g('ParamAngleX'), ay:g('ParamAngleY'), az:g('ParamAngleZ'), bax:g('ParamBodyAngleX'),
          baz:g('ParamBodyAngleZ'), br:g('ParamBreath'), eye:g('ParamEyeLOpen'), y:m.y }; })"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":800})
        await pg.goto(URL); await pg.wait_for_function("window.__ready===true",timeout=30000)
        await pg.wait_for_timeout(1500)
        rows=[[] for _ in range(5)]
        for _ in range(100):
            await pg.wait_for_timeout(100)
            r=await pg.evaluate(JS)
            for i,m in enumerate(r):
                rows[i].append(m)
        for i,rs in enumerate(rows):
            def rng(k):
                v=[m[k] for m in rs if m[k] is not None]
                return f"{min(v):+.2f}..{max(v):+.2f}"
            print(f"seat{i} ax {rng('ax')} ay {rng('ay')} az {rng('az')} bax {rng('bax')} baz {rng('baz')} br {rng('br')} eye {rng('eye')}")
        await b.close()
asyncio.run(main())
