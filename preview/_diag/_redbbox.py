import numpy as np
from PIL import Image
from scipy import ndimage as nd
im = np.asarray(Image.open("preview/_diag/_audit/out/dounai_neutral_defects.png").convert("RGB")).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
red = (r > 180) & (g < 90) & (b < 90)
lab, n = nd.label(red)
sizes = nd.sum(red, lab, range(1, n + 1))
order = np.argsort(sizes)[::-1][:8]
for i in order:
    sl = nd.find_objects(lab == i + 1)[0]
    print(f"{int(sizes[i]):6d} px  x {sl[1].start}-{sl[1].stop}  y {sl[0].start}-{sl[0].stop}")
print("total red", int(red.sum()))
