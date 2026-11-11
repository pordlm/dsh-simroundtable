import json,numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage
ROOT=Path(r"D:\dsh_simroundtable")
def load(name):
    d=ROOT/"assets/build"/f"{name}-layout"
    lay=json.loads((d/f"{name}.layout.json").read_text())
    c=Image.new("RGBA",(2048,2048),(0,0,0,0))
    for L in lay["layers"]:
        p=d/L["image"]["path"]
        if p.is_file(): c.alpha_composite(Image.open(p).convert("RGBA"),(L["rect"]["left"],L["rect"]["top"]))
    return np.asarray(c)[...,3], lay
for name in ["kimi","mimo","minimax","dounai","glm","qwen"]:
    a,lay=load(name)
    m=Image.open(ROOT/f"assets/build/{name}-parts/matte.png").convert("RGBA")
    ma=np.asarray(m)[...,3]; ys,xs=np.where(ma>64)
    x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
    k=1836.0/(y1-y0); dx=1024-k*(x0+x1)/2; dy=106-k*y0
    # resample matte into canvas
    big=m.resize((int(round(m.width*k)),int(round(m.height*k))),Image.BILINEAR)
    can=Image.new("RGBA",(2048,2048),(0,0,0,0)); can.paste(big,(int(round(dx)),int(round(dy))),big)
    ref=np.asarray(can)[...,3]
    solid=a>127
    lab,n=ndimage.label(~solid)
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
    print(f"== {name}  (master {m.size}, k={k:.4f} dx={dx:.1f} dy={dy:.1f})")
    rows=[]
    for i in range(1,n+1):
        if i in border: continue
        msk=lab==i; area=int(msk.sum())
        if area<40: continue
        yy,xx=np.where(msk)
        rows.append((area,xx.min(),yy.min(),xx.max(),yy.max(),float(ref[msk].mean())))
    rows.sort(reverse=True)
    for r in rows[:6]:
        print(f"   hole {r[0]:6d} px @({r[1]},{r[2]})-({r[3]},{r[4]})  master_alpha_mean={r[5]:.0f}")
