import asyncio
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,DeepSeek&nogest=1&nolook=1"
JS="""() => window.__models.map(m=>{const cm=m.internalModel.coreModel;const g=id=>{try{return cm.getParameterValueById(id)}catch(e){return null}};
 return {e:g('ParamEyeLOpen'), ax:g('ParamAngleX'), ba:g('ParamBodyAngleX'), br:g('ParamBreath')};})"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":900,"height":800})
        await pg.goto(URL); await pg.wait_for_function("window.__ready===true",timeout=60000)
        mins=[9]*5; blinks=[[] for _ in range(5)]; lasts=[None]*5; axr=[[9,-9] for _ in range(5)]
        prev=[1]*5
        for k in range(120):
            await pg.wait_for_timeout(160)
            r=await pg.evaluate(JS)
            for i,s in enumerate(r[:5]):
                mins[i]=min(mins[i], s["e"]); axr[i][0]=min(axr[i][0],s["ax"]); axr[i][1]=max(axr[i][1],s["ax"])
                if prev[i]>0.5 and s["e"]<=0.5: blinks[i].append(round(k*0.16,1))
                prev[i]=s["e"]
        print("minEye per seat:", [round(x,2) for x in mins])
        print("blink moments (s):", [b_ for b_ in blinks])
        print("AngleX range per seat:", [[round(a,2),round(c,2)] for a,c in axr])
        await b.close()
asyncio.run(main())
