import numpy as np
from PIL import Image
for p in ("assets/build/gemini-parts/matte.png",):
    im = Image.open(p).convert("RGBA")
    a = np.asarray(im)
    print(p, im.size, "alpha0 %", round((a[...,3]==0).mean()*100,2), "opaque %", round((a[...,3]>0).mean()*100,2))
    ys, xs = np.where(a[...,3] > 0)
    print("  bbox", xs.min(), ys.min(), xs.max(), ys.max())
