import numpy as np
from PIL import Image
from scipy import ndimage

im = Image.open("preview/_diag/_seam_orig.png").convert("RGB")
a = np.asarray(im).astype(int)
green = (a[:,:,0] < 90) & (a[:,:,1] > 190) & (a[:,:,2] < 90)
body = ~green
filled = ndimage.binary_fill_holes(body)
holes = filled & green
lab, n = ndimage.label(holes, structure=np.ones((3,3)))
objs = ndimage.find_objects(lab)
head = []
for i, sl in enumerate(objs):
    if sl is None: continue
    ys, xs = sl
    if 470 <= ys.start <= 900 and 800 <= xs.start <= 1250:
        size = int((lab[sl] == i+1).sum())
        head.append((size, xs.start, xs.stop, ys.start, ys.stop))
head.sort(reverse=True)
print("head-region enclosed gaps:", len(head), "total", sum(h[0] for h in head))
for s in head[:12]: print("  ", s)
print("small ones (<=40):", sum(1 for h in head if h[0] <= 40), "sum", sum(h[0] for h in head if h[0] <= 40))
