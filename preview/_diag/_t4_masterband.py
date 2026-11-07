import numpy as np
from pathlib import Path
from PIL import Image
R=Path(r"D:\dsh_simroundtable")
m=Image.open(R/"assets/build/gemini-parts/matte.png").convert("RGBA")
k=1.2599; ox,oy=380.4,68.5
# canvas box -> master box
def c2m(x,y): return ((x-ox)/k,(y-oy)/k)
x0,y0,x1,y1=860,700,1200,830
mx0,my0=c2m(x0,y0); mx1,my1=c2m(x1,y1)
c=m.crop((int(mx0),int(my0),int(mx1),int(my1)))
c=c.resize((c.width*5,c.height*5),Image.NEAREST)
c.save(R/"preview/_evidence/t4/master_chinband_5x.png")
print("master crop saved",c.size)
# also alpha stats there
a=np.asarray(m).astype(int)[int(my0):int(my1),int(mx0):int(mx1)]
print("master alpha>200 frac %.3f, mean rgb %s"%( (a[...,3]>200).mean(), tuple(int(v) for v in a[...,:3].reshape(-1,3).mean(axis=0))))
