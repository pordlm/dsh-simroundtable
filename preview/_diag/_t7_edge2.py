import numpy as np, colorsys
from scipy import ndimage
A=np.load(r"preview\_diag\_t7_plate.npy"); fill=np.load(r"preview\_diag\_t7_fill.npy")
def lab(rgb):
    c=rgb/255.0; c=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz=c@M.T/np.array([0.95047,1.0,1.08883]); f=np.where(xyz>0.008856,xyz**(1/3),7.787*xyz+16/116)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
LB=lab(A[...,:3])
fr=(839,510,1211,810); m=np.zeros_like(fill); m[fr[1]:fr[3],fr[0]:fr[2]]=True
f=fill&m
op=(A[...,3]>=250)
nb=(ndimage.binary_dilation(f,ndimage.generate_binary_structure(2,1))&op&~f&m)
edge=f&ndimage.binary_dilation(nb,ndimage.generate_binary_structure(2,1))
print("edge fill px",int(edge.sum()))
dls=[]
HSV={}
for y,x in zip(*np.nonzero(edge)):
    # nearest opaque neighbour
    ys,xs=[],[]
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            yy,xx=y+dy,x+dx
            if not(dy==0 and dx==0) and op[yy,xx] and m[yy,xx] and not f[yy,xx]:
                ys.append(yy);xs.append(xx)
    if not ys: continue
    dls.append(min(abs(LB[y,x,0]-LB[yy,xx,0]) for yy,xx in zip(ys,xs)))
dls=np.array(dls)
print("boundary dL n=%d med %.2f p90 %.1f max %.1f  frac<3=%.1f%%"%(len(dls),np.median(dls),np.percentile(dls,90),dls.max(),100*(dls<3).mean()))
