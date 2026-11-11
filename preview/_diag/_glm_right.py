import numpy as np
from pathlib import Path
from PIL import Image
ROOT=Path(r"D:\dsh_simroundtable")
master=Image.open(next((ROOT/"assets/incoming/glm-parts/p0").glob("*.png"))).convert("RGB")
print(master.size)
crop=master.crop((640,480,920,1040))
z=2
crop.resize((crop.width*z,crop.height*z),Image.LANCZOS).save(ROOT/"preview/_diag/_glm_right_master.png")
# part colour map
import json
lay=json.loads((ROOT/"assets/build/glm-layout/glm.layout.json").read_text())
print([l["name"] for l in lay["layers"]])
