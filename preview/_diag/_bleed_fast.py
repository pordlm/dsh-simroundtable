import numpy as np
from PIL import Image
from scipy import ndimage
def bleed_file(path):
    im = Image.open(path).convert("RGBA"); a = np.asarray(im)
    al = a[...,3]
    ind = ndimage.distance_transform_edt(al == 0, return_distances=False, return_indices=True)
    out = a[...,:3][ind[0], ind[1]]
    Image.fromarray(np.dstack([out, al]), "RGBA").save(path)
for p in ["preview/_bleedtest/gemini/gemini.layout.4096/texture_00.png",
          "preview/_bleedtest/grok/grok.layout.4096/texture_00.png"]:
    bleed_file(p); print("bled", p)
