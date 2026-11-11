import json, numpy as np
from PIL import Image
b=r"assets/build/gemini-v1"; b0=r"assets/build/gemini-v1.bak"
def plate_canvas(d):
    l=json.load(open(d+"/gemini.layout.json",encoding="utf-8"))
    lay=[x for x in l["layers"] if x["name"]=="head base"][0]
    im=Image.open(d+"/"+lay["image"]["path"]).convert("RGBA")
    c=Image.new("RGBA",(2048,2048),(0,0,0,0)); c.paste(im,(lay["rect"]["left"],lay["rect"]["top"]),im)
    return np.asarray(c)
A=plate_canvas(b); B=plate_canvas(b0)
al=A[...,3]; ol=B[...,3]
fill=(al>=250)&(ol<8)
ys,xs=np.nonzero(fill); print("fill",int(fill.sum()),"canvas bbox",xs.min(),ys.min(),xs.max(),ys.max())
rows=fill.sum(1); cols=fill.sum(0)
print("rows",[(int(y),int(rows[y])) for y in np.argsort(rows)[-6:][::-1]])
print("cols",[(int(x),int(cols[x])) for x in np.argsort(cols)[-6:][::-1]])
lft=fill[:, :960].sum(0); print("leftcols",[(int(x),int(lft[x])) for x in np.argsort(lft)[-4:][::-1]])
rgt=fill[:, 1060:].sum(0); print("rightcols",[(int(x)+1060,int(rgt[x])) for x in np.argsort(rgt)[-4:][::-1]])
np.save(r"preview\_diag\_t7_fill.npy", fill)
np.save(r"preview\_diag\_t7_plate.npy", A)
np.save(r"preview\_diag\_t7_ref.npy", B)
