import numpy as np
from PIL import Image
def seamscan(tex):
    a=np.asarray(Image.open(tex).convert("RGBA")).astype(np.int16)
    H,W,_=a.shape
    lum=a[...,:3].mean(axis=2); al=a[...,3]
    d1=lum[:,:-4]-lum[:,2:-2]; d2=lum[:,4:]-lum[:,2:-2]
    seam=(al[:,2:-2]>250)&(d1>26)&(d2>26)
    cols=list()
    Wc=seam.shape[1]
    for x in range(Wc):
        col=seam[:,x]
        if not col.any(): continue
        idx=np.flatnonzero(col); mx=0; s=idx[0]; prev=idx[0]
        for i in idx[1:]:
            if i==prev+1: prev=i
            else:
                mx=max(mx,prev-s+1); s=i; prev=i
        mx=max(mx,prev-s+1)
        if mx>250: cols.append((x,mx))
    return (W,H), cols[:12], len(cols)
for tex in ["assets/build/gemini-v1/gemini.layout.4096/texture_00.png",
            "assets/build/grok-v1/grok.layout.4096/texture_00.png",
            "assets/build/claude-v3/claude.layout.4096/texture_00.png"]:
    try: size,cnt,tot=seamscan(tex); print(tex.split("/")[2], size, "cols>250:", tot, "sample:", cnt)
    except Exception as e: print(tex,"ERR",repr(e))
