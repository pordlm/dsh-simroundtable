import hashlib, pathlib
from PIL import Image
import numpy as np
for d in ("assets/build/gemini-v1", "assets/build/_gemini-pad8"):
    t = pathlib.Path(d, "gemini.layout.4096/texture_00.png")
    m = pathlib.Path(d, "gemini.layout.moc3")
    im = Image.open(t)
    a = np.array(im.convert("RGBA"))[:, :, 3]
    print(d, "tex", im.size, "sha", hashlib.sha256(t.read_bytes()).hexdigest()[:12],
          "moc3", m.stat().st_size, "sha", hashlib.sha256(m.read_bytes()).hexdigest()[:12])
    print("   alpha0 ratio %.4f  opaque %.4f" % ((a == 0).mean(), (a > 0).mean()))
