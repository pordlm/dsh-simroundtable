import numpy as np
from PIL import Image
a = np.asarray(Image.open("assets/build/dounai-v1/parts/handwear-l.png"))[..., 3]
reg = a[1361:1559, 620:748]
print("handwear-l region alpha: max", reg.max(), "mean", round(float(reg.mean()),1), ">0", int((reg>0).sum()), ">=200", int((reg>=200).sum()), ">=128", int((reg>=128).sum()))
import collections
print("hist", np.histogram(reg, bins=[0,1,25,64,128,200,250,256])[0])
b = np.asarray(Image.open("assets/build/dounai-parts/src/handwear-l.png"))[..., 3]
print("src alpha max", b.max(), "unique", np.unique(b)[:10], "...", np.unique(b)[-5:])
