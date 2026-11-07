# -*- coding: utf-8 -*-
"""t3: derive the stage's on-screen scale from the user's screenshot (iris centres)."""
import numpy as np
from PIL import Image
im=Image.open(r"preview/_evidence/user_report_gemini_4x.png").convert("RGB")
a=np.array(im).astype(np.int16); R,G,B=a[:,:,0],a[:,:,1],a[:,:,2]
mag=(R>150)&(G<90)&(B>90)&(B<200)          # magenta iris (left eye)
amb=(R>200)&(G>150)&(B<90)                 # amber iris (right eye)
for nm,m in (("magenta",mag),("amber",amb)):
    ys,xs=np.nonzero(m)
    print("%-8s n=%6d centroid=(%.0f,%.0f) bbox x %d..%d y %d..%d"%(nm,m.sum(),xs.mean(),ys.mean(),xs.min(),xs.max(),ys.min(),ys.max()))
c=np.array([np.nonzero(mag)[1].mean(),np.nonzero(mag)[0].mean()])
d=np.array([np.nonzero(amb)[1].mean(),np.nonzero(amb)[0].mean()])
print("iris centre distance in the user image = %.1f px"%np.linalg.norm(c-d))
CANVAS=238.0   # layout: irides-l centre x 931, irides-r centre 1117 -> 186? recompute below
print("NOTE canvas reference computed next run")
