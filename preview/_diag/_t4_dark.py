import json, numpy as np
from pathlib import Path
from PIL import Image
ROOT=Path(r"D:\dsh_simroundtable"); C=2048
def comp(d):
    man=json.loads((d/"gemini.layout.json").read_text(encoding="utf-8"))
    base=Image.new("RGBA",(C,C),(16,21,34,255))
    for l in man["layers"]:
        base.alpha_composite(Image.open(d/l["image"]["path"]).convert("RGBA"),(l["rect"]["left"],l["rect"]["top"]))
    return np.asarray(base).astype(int), man
for tag,d in (("old",ROOT/"assets/build/gemini-layout"),("new",ROOT/"assets/build/_t4-layout")):
    a,man=comp(d)
    fr=np.zeros((C,C),bool); y0,x0=500,829; y1,x1=815,1221
    fr[y0:y1,x0:x1]=True
    L=a[...,:3].mean(axis=2)
    print(f"{tag}: face-region dark(L<60)={int((fr&(L<60)).sum())} verydark(<40)={int((fr&(L<40)).sum())} Lmin={int(L[fr].min())}")
    # vertical gutters: mean colour over x for rows in the cheek band
    for y in (650,700,750,790):
        row=[int(L[y,x]) for x in range(832,845)]
        print("   row y=%d L x832..844: %s"%(y,row))
