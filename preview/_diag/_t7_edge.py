import json, numpy as np
from PIL import Image
def plate_canvas(d):
    l=json.load(open(d+"/gemini.layout.json",encoding="utf-8"))
    lay=[x for x in l["layers"] if x["name"]=="head base"][0]
    im=Image.open(d+"/"+lay["image"]["path"]).convert("RGBA")
    c=Image.new("RGBA",(2048,2048),(0,0,0,0)); c.paste(im,(lay["rect"]["left"],lay["rect"]["top"]),im)
    return np.asarray(c).astype(float)
A=plate_canvas(r"assets/build/gemini-v1"); B=plate_canvas(r"assets/build/gemini-v1.bak")
def lab(rgb):
    c=rgb/255.0; c=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz=c@M.T/np.array([0.95047,1.0,1.08883]); f=np.where(xyz>0.008856,xyz**(1/3),7.787*xyz+16/116)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
LA=lab(A[...,:3]); LB=lab(B[...,:3])
fill=(A[...,3]>=250)&(B[...,3]<8)
fr=(839,510,1211,810); m=np.zeros_like(fill); m[fr[1]:fr[3],fr[0]:fr[2]]=True
f=fill&m
print("fill in face rect",int(f.sum()),"total",int(fill.sum()))
# vertical-edge step: for each row take the fill's left/right extent, compare with neighbour outside ±1 px
steps_l=[];steps_r=[]
for y in range(fr[1],fr[3]):
    xs=np.nonzero(f[y])[0]
    if len(xs)<4: continue
    x0,x1=xs.min(),xs.max()
    if x0-1>=0 and A[y,x0-1,3]>=250 and A[y,x0,3]>=250:
        steps_l.append(abs(LA[y,x0,0]-LA[y,x0-1,0]))
    if x1+1<2048 and A[y,x1+1,3]>=250 and A[y,x1,3]>=250:
        steps_r.append(abs(LA[y,x1,0]-LA[y,x1+1,0]))
print("vertical boundary dL: left n=%d med %.2f max %.1f | right n=%d med %.2f max %.1f"%(len(steps_l),np.median(steps_l) if steps_l else -1,max(steps_l) if steps_l else -1,len(steps_r),np.median(steps_r) if steps_r else -1,max(steps_r) if steps_r else -1))
inside=LA[...,0][f]; 
ring=ndimage_ring=None
from scipy import ndimage
ring=(ndimage.binary_dilation(f,iterations=8)&~f)&(A[...,3]>=250)&m
print("fill L* std %.2f  ring(8px outside) L* std %.2f  ring n=%d"%(inside.std(), LA[...,0][ring].std(), int(ring.sum())))
print("fill L* mean %.1f ring mean %.1f"%(inside.mean(), LA[...,0][ring].mean()))
