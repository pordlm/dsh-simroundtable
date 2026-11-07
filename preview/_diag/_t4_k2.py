import numpy as np
from PIL import Image
from scipy import ndimage as ndi
p=r"D:\dsh_simroundtable\preview\_evidence\user_report_gemini_4x.png"
im=np.asarray(Image.open(p).convert("RGB")).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
Y=im.shape[0]
def blobs(m,name,minpx=400):
    m=m.copy(); m[1000:,:]=False
    lab,n=ndi.label(m)
    if n==0: print(name,"none"); return []
    sizes=ndi.sum(m,lab,range(1,n+1)); idx=np.argsort(sizes)[::-1][:3]
    out=[]
    for i in idx:
        if sizes[i]<minpx: continue
        cy,cx=ndi.center_of_mass(m,lab,i+1)
        print("  %s blob %d px center=(%.0f,%.0f)"%(name,int(sizes[i]),cx,cy)); out.append((cx,cy,int(sizes[i])))
    return out
pink=(r>140)&(g<r*0.45)&(b>50)&(b<190)
yel=(r>190)&(g>130)&(g<205)&(b<95)
print("pink:"); P=blobs(pink,"pink")
print("yellow:"); Q=blobs(yel,"yellow")
if P and Q:
    d=((P[0][0]-Q[0][0])**2+(P[0][1]-Q[0][1])**2)**0.5
    print("d(4x)=%.1f  stage=%.1f  k=%.4f"%(d,d/4,(d/4)/194.5))
