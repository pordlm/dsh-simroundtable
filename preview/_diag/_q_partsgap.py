import numpy as np, glob, os
from PIL import Image
rows=[]
for p in sorted(glob.glob("assets/build/gemini-layout/parts/*.png")):
    a=np.asarray(Image.open(p).convert("RGBA"))[...,3]
    if a.size==0: continue
    ys,xs=np.where(a>0)
    if not len(xs): continue
    x0,x1=xs.min(),xs.max()
    inner=a[:, x0+1:x1]
    if inner.shape[1]==0: continue
    cols=inner.max(axis=0)
    empty=np.where(cols==0)[0]
    if len(empty):
        rows.append((os.path.basename(p), a.shape[1], a.shape[0], [(int(e+x0+1)) for e in empty][:8], len(empty)))
for r in rows: print(r)
print("parts with interior transparent columns:", len(rows))
