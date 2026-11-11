import numpy as np
from PIL import Image
a = np.asarray(Image.open("assets/build/dounai-v1/parts/handwear-l.png"))[..., 3]
print("shape", a.shape)
reg = a[1361-1324:1559-1324, 620-613:748-613]
print("region alpha max", int(reg.max()), "mean", round(float(reg.mean()),1), ">0", int((reg>0).sum()), ">=200", int((reg>=200).sum()))
print("hist", np.histogram(reg, bins=[0,1,25,64,128,200,250,256])[0])
