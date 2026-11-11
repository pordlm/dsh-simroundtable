import numpy as np
from PIL import Image
A=np.load(r"preview\_diag\_t7_plate.npy").astype(float)
ms=Image.open(r"assets/build/gemini-parts/matte.png").convert("RGBA")
k=1.2599; ms=ms.resize((int(round(ms.width*k)),int(round(ms.height*k))),Image.LANCZOS)
M=np.zeros((2048,2048,4),np.uint8); M[68:68+ms.height,380:380+ms.width]=np.asarray(ms)
M=M.astype(float)
both=(A[...,3]>200)&(M[...,3]>200)
print("both px", int(both.sum()))
for c,name in enumerate("RGB"):
    ratio=A[...,c][both]/np.maximum(M[...,c][both],1)
    print(name,"plate med",np.median(A[...,c][both]).round(1),"master med",np.median(M[...,c][both]).round(1),"ratio med",np.median(ratio).round(3))
print("master at (1000,772)",M[772,1000,:3].astype(int),"plate",A[772,1000,:3].astype(int))
print("master at (842,700)",M[700,842,:3].astype(int),"plate",A[700,842,:3].astype(int))
print("master at (1200,700)",M[700,1200,:3].astype(int),"plate",A[700,1200,:3].astype(int))
print("master at (900,760)",M[760,900,:3].astype(int),"plate",A[760,900,:3].astype(int))
np.save(r"preview\_diag\_t7_master.npy", M)
