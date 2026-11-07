import numpy as np
from pathlib import Path
from PIL import Image, ImageChops
from scipy import ndimage as ndi
E=Path(r"D:\dsh_simroundtable\preview\_evidence\t4")
def load(t):
    im=np.asarray(Image.open(E/f"render_{t}.png").convert("RGBA")).astype(int)
    return im
Bg=np.array([16,21,34])
for case in ("neutral","stage_pose"):
    a=load(f"old_{case}"); b=load(f"new_{case}")
    # composite on bg
    def comp(x):
        al=x[...,3:4]/255.0
        return x[...,:3]*al+Bg*(1-al)
    ca,cb=comp(a),comp(b)
    d=np.abs(ca-cb).max(axis=2)
    m=d>25
    lab,n=ndi.label(m)
    sizes=ndi.sum(m,lab,range(1,n+1))
    order=np.argsort(sizes)[::-1][:8]
    print(f"== {case}: changed px(>25)={int(m.sum())} comps={n}")
    for i in order:
        sl=ndi.find_objects(lab==i+1)[0]
        print("   %6d px bbox x%d..%d y%d..%d"%(int(sizes[i]),sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    # jaw band region detail: rows 770..812, mean colour per column range
    for y in (770,780,790,800,810):
        print("   y=%d old=%s new=%s"%(y,tuple(int(v) for v in ca[y,900]),tuple(int(v) for v in cb[y,900])))
