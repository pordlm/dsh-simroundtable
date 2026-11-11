import numpy as np, json
from pathlib import Path
from PIL import Image
ROOT=Path(r"D:\dsh_simroundtable")
name=sys.argv[1] if False else "kimi"
mp={"kimi":(1.2706,374.3,41.2),"mimo":(1.3152,351.28,8.68),"minimax":(1.2671,383.49,52.78)}[name]
k,dx,dy=mp
# canvas bbox -> src bbox
cx0,cy0,cx1,cy1=729,690,760,770
sx0,sy0,sx1,sy1=(int((cx0-dx)/k),int((cy0-dy)/k)),(int((cx1-dx)/k),int((cy1-dy)/k))
x0,y0=float((cx0-dx)/k),float((cy0-dy)/k); x1,y1=float((cx1-dx)/k),float((cy1-dy)/k)
print("src",x0,y0,x1,y1)
master=Image.open(next((ROOT/"assets/incoming").glob(f"{name}-parts/p0/*.png"))).convert("RGB")
print("master size",master.size)
crop=master.crop((int(x0),int(y0),int(x1),int(y1)))
matte=Image.open(ROOT/f"assets/build/{name}-parts/matte.png").convert("RGBA")
crop2=matte.crop((int(x0),int(y0),int(x1),int(y1)))
z=8
out=Image.new("RGB",(crop.width*z*2+20,crop.height*z),(80,80,80))
out.paste(crop.resize((crop.width*z,crop.height*z),Image.NEAREST),(0,0))
a=crop2.getchannel("A")
both=Image.merge("RGB",(a,a,a))
out.paste(both.resize((a.width*z,a.height*z),Image.NEAREST),(crop.width*z+20,0))
out.save(ROOT/f"preview/_diag/_{name}_src_vs_matte.png")
rgb=np.asarray(crop).reshape(-1,3)
print("master rgb mean",rgb.mean(0).round(1),"p10",np.percentile(rgb,10,axis=0))
al=np.asarray(crop2)[...,3]
print("matte alpha mean",al.mean().round(1),"max",al.max(),"frac>=128",(al>=128).mean().round(3))
