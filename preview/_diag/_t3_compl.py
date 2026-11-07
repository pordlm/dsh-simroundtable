import json, numpy as np
from PIL import Image
L=json.load(open(r"assets/build/gemini-v1/gemini.layout.json",encoding="utf-8"))
R={l["name"]:l["rect"] for l in L["layers"]}
def png(n): return np.array(Image.open("assets/build/gemini-v1/parts/%s.png"%n).convert("RGBA"))
C=2048
hb=png("head_base"); fc=png("face")
hr=R["head base"]; fr=R["face"]
# place both on canvas grid
def place(img,r):
    out=np.zeros((C,C),np.float32)
    l,t,w,h=r["left"],r["top"],r["width"],r["height"]
    out[t:t+h,l:l+w]=img[:,:,3]/255.0
    return out
A_hb=place(hb,hr); A_fc=place(fc,fr)
sub=(slice(fr["top"],fr["top"]+fr["height"]),slice(fr["left"],fr["left"]+fr["width"]))
hbo=A_hb[sub]; fco=A_fc[sub]
o=(hbo>0.9); f=(fco>0.9)
print("inside face rect: head_base opaque %.1f%%  face opaque %.1f%%"%(100*o.mean(),100*f.mean()))
print("both opaque %.1f%%  head_base only %.1f%%  face only %.1f%%  neither %.1f%%"%(100*(o&f).mean(),100*(o&~f).mean(),100*(~o&f).mean(),100*(~o&~f).mean()))
# how much of face's opaque area is NOT backed
print("face opaque but head_base transparent (no backing) = %d px"%int((f&~o).sum()))
# distance from face-rect left edge: is head_base transparent right at the cut?
for x in range(fr["left"]-8, fr["left"]+14, 2):
    col_h=A_hb[fr["top"]:fr["top"]+fr["height"], x]; col_f=A_fc[fr["top"]:fr["top"]+fr["height"], x]
    print(" x=%d  head_base frac>0.9 = %.2f   face frac>0.9 = %.2f"%(x,(col_h>0.9).mean(),(col_f>0.9).mean()))
# face alpha profile near its own rect edges (are the cut edges hard?)
a=fc[:,:,3]/255.0
print("face alpha: top row mean %.3f bottom %.3f left col %.3f right col %.3f"%(a[0].mean(),a[-1].mean(),a[:,0].mean(),a[:,-1].mean()))
# unsupported face pixels broken by direction
ys,xs=np.nonzero(f&(hbo<0.5))
if len(ys):
    print("unbacked face px: x range %d..%d y %d..%d  (rect x0=%d)"%(xs.min()+fr["left"],xs.max()+fr["left"],ys.min()+fr["top"],ys.max()+fr["top"],fr["left"]))
    import collections
    print(" unbacked px within 6px of left edge:",int((xs<6).sum()),"right:",int((xs>fr["width"]-7).sum()),"top:",int((ys<6).sum()),"bottom:",int((ys>fr["height"]-7).sum()))
