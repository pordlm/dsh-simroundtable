# -*- coding: utf-8 -*-
"""t3: real stage screenshot (stage-760 harness, single Gemini seat) + its render scale."""
import base64, io, json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
EVI=r"preview/_evidence/t3"
URL="http://127.0.0.1:8848/preview/stage-760.html?n=1&names=Gemini&active=0&tpin=6000&nogest=1&seed=7"
with sync_playwright() as p:
    br=p.chromium.launch(channel="msedge",headless=True,args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=br.new_page(viewport={"width":1200,"height":900},device_scale_factor=1)
    pg.goto(URL,wait_until="load"); pg.wait_for_timeout(9000)
    info=pg.evaluate("""() => {
      const out={models:[]};
      const ms=window.__models||[];
      for (const m of ms){ const im=m.internalModel||m.model&&m.model.internalModel;
        out.models.push({name:m.name||m.settings&&m.settings.name,
          scale: im&&im.scale&&{x:im.scale.x,y:im.scale.y},
          view: m.model&&m.model.scale&&{x:m.model.scale.x,y:m.model.scale.y},
          app: m.app&&{w:m.app.screen.width,h:m.app.screen.height},
          el: m.el&&{w:m.el.offsetWidth,h:m.el.offsetHeight}});}
      const c=document.querySelector('canvas');
      out.canvas=c&&{w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight};
      out.body={w:document.body.clientWidth,h:document.body.clientHeight};
      return out;}""")
    print(json.dumps(info,ensure_ascii=False)[:1200])
    pg.screenshot(path=EVI+"/stage_1200.png")
    br.close()
im=Image.open(EVI+"/stage_1200.png"); print("shot",im.size)
