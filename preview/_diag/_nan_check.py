import asyncio
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/longtable.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nochairs=1"
JS="""() => (window.__seats||[]).map(s => { const cm=s.model.internalModel.coreModel;
  const ids=['ParamAngleX','ParamAngleY','ParamAngleZ','ParamHairFront','ParamHairBack','ParamEyeBallX','ParamEyeBallY','ParamBodyAngleZ','ParamBreath'];
  const bad=[]; for (const id of ids){ try{ const v=cm.getParameterValueById(id); if(!Number.isFinite(v)) bad.push(id); }catch(e){} }
  return { bad, name: s.cfg && s.cfg.name }; })"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1400,"height":920})
        await pg.goto(URL); await pg.wait_for_function("window.__stageReady===true",timeout=60000)
        worst={}
        for k in range(40):
            await pg.wait_for_timeout(500)
            r=await pg.evaluate(JS)
            for i,s in enumerate(r):
                if s["bad"]: worst[i]=set(worst.get(i,set()))|set(s["bad"])
        print("NaN seats:", worst if worst else "none")
        await b.close()
asyncio.run(main())
