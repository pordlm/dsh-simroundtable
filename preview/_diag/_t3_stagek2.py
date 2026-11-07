import numpy as np
from PIL import Image
im=Image.open(r"preview/_evidence/t3/stage_1200.png").convert("RGB")
a=np.array(im).astype(np.int16); R,G,B=a[:,:,0],a[:,:,1],a[:,:,2]
# crop to the stage canvas (760x438 at the top)
a=a[:438,:760]; R,G,B=a[:,:,0],a[:,:,1],a[:,:,2]
skin=(R>228)&(G>196)&(B>186)&((R-B)<70)&(G>B)
print("skin px",skin.sum())
ys,xs=np.nonzero(skin)
print("bbox x %d..%d y %d..%d"%(xs.min(),xs.max(),ys.min(),ys.max()))
# widest skin run per row
best=(0,0,0)
for y in range(ys.min(),ys.max()+1):
    row=skin[y]; 
    if not row.any(): continue
    idx=np.nonzero(row)[0]; run=idx.max()-idx.min()
    if run>best[0]: best=(run,y,idx.min())
print("widest skin run = %d px at y=%d starting x=%d"%best)
print("k_stage from face width 372 -> %.4f"%(best[0]/372.0))
print("seam 3 canvas px -> %.2f stage px ; 5px -> %.2f"%(3*best[0]/372.0,5*best[0]/372.0))
im.crop((0,0,760,438)).resize((760*2,438*2),Image.LANCZOS).save(r"preview/_evidence/t3/stage760_2x.png")
