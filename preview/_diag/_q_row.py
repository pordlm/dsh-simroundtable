import numpy as np
from PIL import Image
a=np.asarray(Image.open(r"preview/_diag/_q_full.png").convert("RGB")).astype(int)
# find the figure's face: locate the image's non-green region properly within x 300..1800, y 100..1200
g=(np.abs(a-np.array([0,255,0])).sum(axis=2)<=20)
sub=~g[100:1300, 300:1800]
ys,xs=np.where(sub); print("sub bbox", xs.min()+300, ys.min()+100, xs.max()+300, ys.max()+100)
cx=(xs.min()+xs.max())//2+300
print("figure center x =", cx)
for y in [420, 520, 620, 720, 820]:
    row=a[y, cx-6:cx+7]
    print(y, [tuple(v) for v in row])
