import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
E=Path(r"D:\dsh_simroundtable\preview\_evidence\t4")
def comp(tag,case,k):
    a=np.asarray(Image.open(E/f"render_{tag}_{case}.png").convert("RGBA")).astype(float)
    im=Image.fromarray(a.astype(np.uint8)).resize((int(round(2048*k)),int(round(2048*k))),Image.LANCZOS)
    base=Image.new("RGBA",im.size,(16,21,34,255)); base.alpha_composite(im); return base.convert("RGB")
FACE=(839,510,1211,810)
for case in ("neutral","stage_pose"):
    tiles=[]
    for tag in ("old","new"):
        k=0.379; s=comp(tag,case,k); pad=18
        box=(int(FACE[0]*k)-pad,int(FACE[1]*k)-pad,int(FACE[2]*k)+pad,int(FACE[3]*k)+pad)
        c=s.crop(box).resize(((box[2]-box[0])*6,(box[3]-box[1])*6),Image.NEAREST)
        d=ImageDraw.Draw(c); d.rectangle([0,0,c.width-1,c.height-1],outline=(0,200,255),width=2)
        d.text((10,10),"OLD (before t4)" if tag=="old" else "NEW (after t4)",fill=(255,255,0))
        tiles.append(c)
    w=sum(t.width for t in tiles); h=max(t.height for t in tiles)
    out=Image.new("RGB",(w,h),(0,0,0)); x=0
    for t in tiles: out.paste(t,(x,0)); x+=t.width
    out.save(E/f"AB_stage_scale_{case}.png"); print("wrote",f"AB_stage_scale_{case}.png",out.size)
