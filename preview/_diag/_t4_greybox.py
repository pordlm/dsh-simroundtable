import numpy as np, json
from pathlib import Path
from PIL import Image
R=Path(r"D:\dsh_simroundtable")
def plate(root):
    man=json.loads((R/root/"gemini.layout.json").read_text(encoding="utf-8"))
    L={l["name"]:l for l in man["layers"]}
    hb=L["head base"]; p=R/root/hb["image"]["path"]
    im=Image.open(p).convert("RGBA"); return np.asarray(im).astype(int), hb["rect"]
for root in ("assets/build/gemini-v1","assets/build/gemini-v1.bak"):
    a,r=plate(root)
    y0,y1,x0,x1=486,723,840,998
    s=a[y0-r["top"]:y1-r["top"], x0-r["left"]:x1-r["left"]]
    print(root,"box alpha mean %.0f min %d max %d colour %s"%(s[...,3].mean(),s[...,3].min(),s[...,3].max(),
        tuple(int(v) for v in s[...,:3].reshape(-1,3).mean(axis=0))))
    # sample points
    for (x,y) in ((900,600),(950,700),(860,520),(980,500)):
        v=a[y-r["top"],x-r["left"]]
        print("   (%d,%d) rgba %s"%(x,y,tuple(int(t) for t in v)))
