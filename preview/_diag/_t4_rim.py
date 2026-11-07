import json, numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage as ndi
R=Path(r"D:\dsh_simroundtable")
man=json.loads((R/"assets/build/gemini-layout/gemini.layout.json").read_text(encoding="utf-8"))
L={l["name"]:l for l in man["layers"]}
f=L["face"]; r=f["rect"]
im=Image.open(R/"assets/build/gemini-layout"/f["image"]["path"]).convert("RGBA")
a=np.asarray(im).astype(int); A=a[...,3]; Lm=a[...,:3].mean(axis=2)
print("face png",im.size,"rect",r)
# dark pixels near silhouette
solid=A>8
dist_out=ndi.distance_transform_edt(solid)
near=dist_out<=6
dark=near&solid&(Lm<150)
print("dark(<150) within 6px of silhouette:",int(dark.sum()))
ys=np.nonzero(dark)[0]+r["top"]
print("  y range",int(ys.min()),int(ys.max()))
import collections
h,_=np.histogram(ys,bins=[500,560,620,680,740,780,800,820,860])
print("  y hist [500,560)..:",h.tolist())
# alpha=0 pixels (removed rim) inside rect
print("transparent px in rect:",int((A<8).sum()),"of",A.size)
# what is the plate colour there? compare plate px vs face px in the box region
y0,y1,x0,x1=780,800,900,1150
sub=a[y0-r["top"]:y1-r["top"], x0-r["left"]-0:x1-r["left"]]
print("face png region y780-800 x900-1150: alpha mean %.2f colour %s"%(sub[...,3].mean(), tuple(int(v) for v in sub[...,:3].reshape(-1,3).mean(axis=0))))
pb=np.asarray(Image.open(R/"assets/build/gemini-layout/parts/head_base.png").convert("RGBA")).astype(int)
hb=L["head base"]; hr=hb["rect"]
ys0,y1_,xs0,x1_=y0-hr["top"],y1-hr["top"],x0-hr["left"],x1-hr["left"]
print("plate region same: alpha mean %.2f colour %s"%(pb[ys0:y1_,xs0:x1_,3].mean(), tuple(int(v) for v in pb[ys0:y1_,xs0:x1_,:3].reshape(-1,3).mean(axis=0))))
