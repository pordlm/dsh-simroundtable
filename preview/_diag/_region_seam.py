import numpy as np
from PIL import Image
def stats(p):
    a = np.asarray(Image.open(p).convert("RGB")).astype(int)
    g = (a[:,:,0]<40)&(a[:,:,1]>200)&(a[:,:,2]<40)
    box = g[500:900, 800:1260]      # face + jaw + eye band
    jaw = g[820:900, 850:1200]
    eye = g[540:720, 820:1240]
    return int(box.sum()), int(jaw.sum()), int(eye.sum())
for tag in ("before","after"):
    print(tag, stats(f"preview/_diag/_{tag}_full.png"))
