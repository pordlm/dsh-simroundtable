import numpy as np
from PIL import Image
a = np.array(Image.open("assets/build/gemini-v1/gemini.layout.4096/texture_00.png").convert("RGBA")).astype(int)
b = np.array(Image.open("assets/build/_gemini-pad8/gemini.layout.4096/texture_00.png").convert("RGBA")).astype(int)
d = np.abs(a-b).sum(axis=2)
print("diff pixels", int((d>0).sum()), "max", int(d.max()))
ys, xs = np.where(d>0)
if len(ys): print("bbox", xs.min(), ys.min(), xs.max(), ys.max())
# alpha-only diff
da = np.abs(a[:,:,3]-b[:,:,3])
print("alpha diff pixels", int((da>0).sum()))
