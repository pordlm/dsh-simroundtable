import numpy as np, colorsys
A=np.load(r"preview\_diag\_t7_plate.npy"); fill=np.load(r"preview\_diag\_t7_fill.npy")
def lab(rgb):
    c=rgb/255.0; c=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz=c@M.T/np.array([0.95047,1.0,1.08883]); f=np.where(xyz>0.008856,xyz**(1/3),7.787*xyz+16/116)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
LB=lab(A[...,:3].astype(float))
def hue(rgb):
    r,g,b=[float(v)/255 for v in rgb]; return colorsys.rgb_to_hsv(r,g,b)[0]*360.0
def prof(name,pts):
    seq=[(x,y,bool(fill[y,x]),int(A[y,x,3]),tuple(int(v) for v in A[y,x,:3])) for (x,y) in pts]
    inf=[s for s in seq if s[2]]; outs=[s for s in seq if (not s[2]) and s[3]>=250]
    if not inf or not outs: print(name,"n_inf",len(inf),"n_out",len(outs)); return
    dls=[];dhs=[]
    for s in inf:
        n=min(outs,key=lambda o:(o[0]-s[0])**2+(o[1]-s[1])**2)
        dls.append(abs(LB[s[1],s[0],0]-LB[n[1],n[0],0]))
        d=abs(hue(s[4])-hue(n[4])); dhs.append(min(d,360-d))
    dls=np.array(dls);dhs=np.array(dhs)
    print(f"{name}: n_inf={len(dls)} dL med {np.median(dls):.2f} max {dls.max():.2f} | dH med {np.median(dhs):.1f} max {dhs.max():.1f}")
prof("jaw row y=773 x880..1160",[(x,773) for x in range(880,1160)])
prof("left cheek col x=842 y600..830",[(842,y) for y in range(600,830)])
prof("right cheek col x=1200 y600..830",[(1200,y) for y in range(600,830)])
prof("jaw row y=769 x880..1160",[(x,769) for x in range(880,1160)])
