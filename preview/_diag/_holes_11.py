import numpy as np
from PIL import Image
from scipy import ndimage

for tag in ("orig","pad8"):
    im = Image.open(f"preview/_diag/_seam_{tag}.png").convert("RGB")
    a = np.asarray(im).astype(int)
    green = (a[:,:,0] < 90) & (a[:,:,1] > 190) & (a[:,:,2] < 90)
    body = ~green
    filled = ndimage.binary_fill_holes(body)
    holes = filled & green
    lab, n = ndimage.label(holes, structure=np.ones((3,3)))
    sizes = ndimage.sum(holes, lab, range(1, n+1)) if n else np.array([0])
    big = sizes[sizes > 30] if len(sizes) else np.array([0])
    print(f"{tag}: holes={int(holes.sum())} comps={n} biggest={int(sizes.max())} n>30={len(big)} sum>30={int(big.sum())}")
    if len(big):
        idx = np.argsort(sizes)[::-1][:6]
        for i in idx:
            if sizes[i] <= 30: continue
            ys, xs = np.where(lab == i+1)
            print(f"   comp {int(sizes[i])}px bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}")
