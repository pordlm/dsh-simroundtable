import json, numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage
ROOT=Path(r"D:\dsh_simroundtable"); C=2048
def load(d):
    man=json.loads((d/"gemini.layout.json").read_text(encoding="utf-8")); st={}
    for l in man["layers"]:
        arr=np.asarray(Image.open(d/l["image"]["path"]).convert("RGBA"))
        o=np.zeros((C,C,4),np.uint8); r=l["rect"]
        o[r["top"]:r["top"]+arr.shape[0], r["left"]:r["left"]+arr.shape[1]]=arr
        st[l["name"]]=o
    return man,st
m1,s1=load(ROOT/"assets/build/gemini-layout"); m2,s2=load(ROOT/"assets/build/_t4-layout")
old=s1["head base"][...,3]; new=s2["head base"][...,3]
added=(new>=8)&(old<8); removed=(old>=8)&(new<8)
print("added px",int(added.sum()),"removed px",int(removed.sum()))
lab,n=ndimage.label(added); sizes=ndimage.sum(added,lab,range(1,n+1))
for i in np.argsort(sizes)[::-1][:6]:
    sl=ndimage.find_objects(lab==i+1)[0]; print(f"  added comp {int(sizes[i]):>7} x{sl[1].start}..{sl[1].stop} y{sl[0].start}..{sl[0].stop}")
lab,n=ndimage.label(removed); sizes=ndimage.sum(removed,lab,range(1,n+1))
for i in np.argsort(sizes)[::-1][:6]:
    sl=ndimage.find_objects(lab==i+1)[0]; print(f"  removed comp {int(sizes[i]):>7} x{sl[1].start}..{sl[1].stop} y{sl[0].start}..{sl[0].stop}")
# what covers the added area (z order matters: anything above the plate)
for nm in ["face","front hair","headwear","ears","neckwear","neck","topwear","handwear"]:
    a=s2[nm][...,3]
    print(f"  added under {nm}: {int((added&(a>8)).sum()):>7} px  ({100.0*(added&(a>8)).sum()/max(1,added.sum()):.1f}%)")
