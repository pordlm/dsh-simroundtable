import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
E=Path(r"D:\dsh_simroundtable\preview\_evidence\t4")
def comp(tag,case,k=0.379):
    a=np.asarray(Image.open(E/f"render_{tag}_{case}.png").convert("RGBA")).astype(float)
    im=Image.fromarray(a.astype(np.uint8)).resize((int(round(2048*k)),int(round(2048*k))),Image.LANCZOS)
    base=Image.new("RGBA",im.size,(16,21,34,255)); base.alpha_composite(im); return base.convert("RGB")
for case in ("neutral","stage_pose"):
    tiles=[]
    for tag in ("old","new"):
        s=comp(tag,case)
        c=s.crop((int(450*0.379),int(90*0.379),int(1600*0.379),int(1950*0.379)))
        c=c.resize((c.width*2,c.height*2),Image.LANCZOS)
        d=ImageDraw.Draw(c); d.text((8,8),"OLD" if tag=="old" else "NEW",fill=(255,255,0))
        tiles.append(c)
    w=sum(t.width for t in tiles)+8; h=max(t.height for t in tiles)
    out=Image.new("RGB",(w,h),(0,0,0)); x=0
    for t in tiles: out.paste(t,(x,0)); x+=t.width+8
    out.save(E/f"AB_fullbody_{case}.png"); print("wrote",out.size)
