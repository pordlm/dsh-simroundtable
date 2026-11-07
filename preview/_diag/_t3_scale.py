# -*- coding: utf-8 -*-
"""t3: does the seam survive at stage scale?  downscale the 1:1 render to the real
stage factor, composite over the stage backdrop, and measure the line's contrast."""
import base64, io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
M="../assets/build/gemini-v1/gemini.layout.model3.json"
FR=dict(left=839,top=510,width=372,height=300)
# 1) the real backdrop colour behind the face, straight from the user's screenshot
u=Image.open(r"preview/_evidence/user_report_gemini_4x.png").convert("RGB")
w,h=u.size; px=np.array(u)
print("user report %dx%d"%(w,h))
for x,y in [(w-30,h//2),(30,h//2),(w//2,60),(w-40,h-80)]:
    print("  bg sample (%d,%d) = %s"%(x,y,px[y,x]))
