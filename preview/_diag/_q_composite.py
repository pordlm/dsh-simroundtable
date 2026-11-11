import json, numpy as np
from PIL import Image
man=json.load(open(r"assets/build/gemini-layout/gemini.layout.json",encoding="utf-8"))
cv=np.zeros((2048,2048,4),np.uint8)
for L in man["layers"]:
    im=Image.open("assets/build/gemini-layout/"+L["image"]["path"]).convert("RGBA")
    r=L["rect"]; cv[r["top"]:r["top"]+im.height, r["left"]:r["left"]+im.width] = np.asarray(im)
al=cv[:,:,3]
ys,xs=np.where(al>0); print("composite bbox",xs.min(),ys.min(),xs.max(),ys.max())
cols=al[:, xs.min():xs.max()+1].max(axis=0)
empty=np.where(cols<=8)[0]
print("transparent columns inside bbox:", len(empty), (empty+xs.min())[:12])
print("alpha at center column 1024:", int((al[:,1024]>8).sum()), "col 1023:", int((al[:,1023]>8).sum()), "col 1025:", int((al[:,1025]>8).sum()))
# widest vertical transparent band
runs=[];cur=None
for x in range(xs.min(),xs.max()+1):
    if cols[x-xs.min()]<=8:
        if cur is None: cur=x
    else:
        if cur is not None: runs.append((cur,x-1,x-cur)); cur=None
runs.sort(key=lambda r:-r[2]); print("widest transparent bands:", runs[:5])
