import numpy as np
from pathlib import Path
from PIL import Image
E=Path(r"D:\dsh_simroundtable\preview\_evidence\t4")
for tag in ("old","new"):
    for case in ("stage_pose","neutral"):
        a=np.asarray(Image.open(E/f"render_{tag}_{case}.png").convert("RGBA")).astype(int)
        al=a[...,3]
        print(tag,case,"alpha rows 735..770 at x=1000:",[int(al[y,1000]) for y in range(735,771)])
        print("   row y=750 alpha x 900..1140 min/mean:", int(al[750,900:1141].min()), round(float(al[750,900:1141].mean()),3))
        print("   row y=750 rgb at x=1000:", tuple(int(v) for v in a[750,1000,:3]), " y=730:", tuple(int(v) for v in a[730,1000,:3]), " y=780:", tuple(int(v) for v in a[780,1000,:3]))
