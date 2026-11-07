import json, numpy as np
from pathlib import Path
from PIL import Image
ROOT=Path(r"D:\dsh_simroundtable"); LAYOUT=ROOT/"assets/build/gemini-layout"; C=2048
man=json.loads((LAYOUT/"gemini.layout.json").read_text(encoding="utf-8"))
A={}
for l in man["layers"]:
    im=Image.open(LAYOUT/l["image"]["path"]).convert("RGBA"); arr=np.asarray(im)
    o=np.zeros((C,C),np.uint8); r=l["rect"]
    o[r["top"]:r["top"]+arr.shape[0], r["left"]:r["left"]+arr.shape[1]]=arr[...,3]
    A[l["name"]]=o
for (x,y) in [(825,700),(830,700),(835,700),(841,700),(850,700),(825,760),(900,760),(1100,760),(1200,700),(1205,660)]:
    owners={n:int(A[n][y-1:y+2,x-1:x+2].max()) for n in A if A[n][y-1:y+2,x-1:x+2].max()>0}
    print(f"({x},{y}) owners={owners}")
print("face alpha col x=839..845 at y=700:", [int(A["face"][700,x]) for x in range(837,848)])
print("plate alpha row y=700 x=815..845:", [int(A["head base"][700,x]) for x in range(815,846)])
print("master matte check")
m=np.asarray(Image.open(ROOT/"assets/build/gemini-parts/matte.png").convert("RGBA"))
k=1.2599; ox,oy=380.4,68.5
def m_at(x,y):
    mx=int(round((x-ox)/k)); my=int(round((y-oy)/k))
    return int(m[my,mx,3]) if 0<=my<m.shape[0] and 0<=mx<m.shape[1] else -1
for (x,y) in [(825,700),(830,700),(835,700),(841,700),(850,700),(825,760),(900,760),(1100,760),(1200,700)]:
    print(" matte A",(x,y),m_at(x,y))
