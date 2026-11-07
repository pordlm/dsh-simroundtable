import json, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
R=Path(r"D:\dsh_simroundtable")
for tag,root in (("new","assets/build/gemini-v1"),("old","assets/build/gemini-v1.bak")):
    man=json.loads((R/root/"gemini.layout.json").read_text(encoding="utf-8"))
    L={l["name"]:l for l in man["layers"]}
    hb=L["head base"]; r=hb["rect"]
    im=Image.open(R/root/hb["image"]["path"]).convert("RGBA")
    x0,y0,x1,y1=780,430,1260,860
    c=im.crop((x0-r["left"],y0-r["top"],x1-r["left"],y1-r["top"]))
    chk=Image.new("RGBA",c.size,(255,0,255,255)); chk.alpha_composite(c)
    chk=chk.convert("RGB").resize((c.width*2,c.height*2),Image.NEAREST)
    d=ImageDraw.Draw(chk); d.text((6,6),tag+" head_base "+str(r),fill=(0,255,0))
    chk.save(R/"preview/_evidence/t4"/f"plate_box_{tag}.png")
    print("saved",tag,c.size)
