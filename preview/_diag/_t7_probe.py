import json, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
R=Path(r"D:\dsh_simroundtable")
man=json.loads((R/"assets/build/gemini-v1/gemini.layout.json").read_text(encoding="utf-8"))
L={l["name"]:l for l in man["layers"]}
g=(R/"preview/_evidence/t7"); g.mkdir(parents=True,exist_ok=True)
hb=L["head base"]; r=hb["rect"]
im=Image.open(R/"assets/build/gemini-v1/hb_placeholder".replace("hb_placeholder",hb["image"]["path"])).convert("RGBA")
x0,y0,x1,y1=780,430,1260,860
c=im.crop((x0-r["left"],y0-r["top"],x1-r["left"],y1-r["top"]))
chk=Image.new("RGBA",c.size,(255,0,255,255)); chk.alpha_composite(c)
chk.convert("RGB").resize((c.width*2,c.height*2),Image.NEAREST).save(g/"plate_t7_box.png")
# numeric: distance of fill pixels to nearest face-opaque pixel, and dL within 6px band
face=L["face"]; fr=face["rect"]
fi=Image.open(R/"assets/build/gemini-v1"/face["image"]["path"]).convert("RGBA")
fc=Image.new("RGBA",(2048,2048),(0,0,0,0)); fc.paste(fi,(fr["left"],fr["top"]),fi)
fa=np.asarray(fc)
from scipy import ndimage
pa=np.asarray(Image.new("RGBA",(2048,2048),(0,0,0,0)))
pi=Image.open(R/"assets/build/gemini-v1"/hb["image"]["path"]).convert("RGBA")
pc=Image.new("RGBA",(2048,2048),(0,0,0,0)); pc.paste(pi,(r["left"],r["top"]),pi)
pa=np.asarray(pc).astype(int)
fop=fa[...,3]>=250
fill=(pa[...,3]>=250)&(fa[...,3]<128)
d=ndimage.distance_transform_edt(~fop)
band=fill&(d<=6)
print("fill px",int(fill.sum()),"band<=6px",int(band.sum()))
print("band dL mean %.1f  max %.1f"%(np.abs(pa[band][:,:3].astype(int).mean(axis=1)-fa[fop][:,:3].astype(int).mean(axis=1).mean()).mean() if band.any() else -1,0))
