import numpy as np
from pathlib import Path
from PIL import Image
E=Path(r"D:\dsh_simroundtable\preview\_evidence\t4")
Bg=np.array([16,21,34]); 
def comp(tag,case):
    a=np.asarray(Image.open(E/f"render_{tag}_{case}.png").convert("RGBA")).astype(float)
    al=a[...,3:4]/255.0
    return a[...,:3]*al+Bg*(1-al)
for case in ("neutral","stage_pose"):
    o=comp("old",case); n=comp("new",case)
    print("==",case)
    for y in (735,745,755,765,775):
        ro=o[y,911:1137].mean(axis=0); rn=n[y,911:1137].mean(axis=0)
        print("  band y=%d old=%s new=%s dmax=%.1f"%(y,tuple(int(v) for v in ro),tuple(int(v) for v in rn),np.abs(ro-rn).max()))
    # band edge sharpness in NEW: column means across x860..1180 at y=750
    row=n[750,860:1181].mean(axis=1)
    print("  new row750 L profile x860..1180 step8:",[int(row[i]) for i in range(0,len(row),40)])
