import numpy as np
from PIL import Image
p=r"D:\dsh_simroundtable\preview\_evidence\user_report_gemini_4x.png"
im=np.asarray(Image.open(p).convert("RGB")).astype(int)
H,W,_=im.shape
print("img",W,H)
r,g,b=im[...,0],im[...,1],im[...,2]
# pink/magenta iris: high R, low G, mid B ; yellow iris: high R, high G, low B
pink=(r>150)&(g<90)&(b>60)&(b<170)
yel=(r>170)&(g>120)&(g<200)&(b<90)
def cen(m,name):
    ys,xs=np.nonzero(m)
    if len(xs)==0: print(name,"none"); return None
    # keep largest blob-ish: use median
    return (float(np.median(xs)),float(np.median(ys)),len(xs))
a=cen(pink,"pink"); c=cen(yel,"yellow")
print("pink",a); print("yellow",c)
if a and c:
    d=((a[0]-c[0])**2+(a[1]-c[1])**2)**0.5
    print("iris distance in 4x img = %.1f -> stage px %.2f -> k=%.4f"%(d,d/4,(d/4)/194.5))
