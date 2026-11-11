import json, numpy as np
from PIL import Image
d=r"assets/build/gemini-v1"
l=json.load(open(d+"/gemini.layout.json",encoding="utf-8"))
fl=[x for x in l["layers"] if x["name"]=="face"][0]
im=Image.open(d+"/"+fl["image"]["path"]).convert("RGBA")
a=np.asarray(im)[...,3]
print("face rect",fl["rect"],"size",im.size,"opaque",int((a>=250).sum()),"soft",int(((a>0)&(a<250)).sum()))
# alpha histogram of the soft band
h=np.histogram(a[(a>0)&(a<250)],bins=[1,16,32,48,64,96,128,160,192,224,250])[0]
print("soft alpha hist",h.tolist())
ys,xs=np.nonzero((a>0)&(a<250))
print("soft bbox",xs.min(),ys.min(),xs.max(),ys.max())
# bottom rows of the face alpha
rows=(a>0).sum(1)
print("last rows with alpha",[(int(y),int(rows[y])) for y in range(a.shape[0]-1,max(0,a.shape[0]-14),-1)])
