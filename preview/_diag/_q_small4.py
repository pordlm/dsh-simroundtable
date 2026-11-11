from PIL import Image
import numpy as np
for s in ["0.09","0.18"]:
    im=Image.open(f"preview/_diag/_q_small_{s}.png").convert("RGB")
    a=np.asarray(im).astype(int)
    bg=np.abs(a-np.array([20,18,26])).sum(axis=2)<=24
    ys,xs=np.where(~bg)
    print(s,"bbox",xs.min(),ys.min(),xs.max(),ys.max())
    # head band = top 25% of the figure
    y0,y1=ys.min(), ys.min()+int((ys.max()-ys.min())*0.30)
    x0,x1=xs.min(), xs.max()
    im.crop((x0,y0,x1,y1)).resize(((x1-x0)*6,(y1-y0)*6), Image.NEAREST).save(f"preview/_diag/_q_small_{s}_zoom.png")
print("ok")
