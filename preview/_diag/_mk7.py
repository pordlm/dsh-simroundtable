from PIL import Image, ImageDraw, ImageFont
def font(sz): return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)
STAGE=r"preview/_diag/_t7_stage.png"; NEW=r"preview/_diag/_t7_gem_head.png"; OLD=r"preview/_diag/_t4_gem_head.png"
OUT=r"preview/_evidence/t7_delivery.png"
full=Image.open(STAGE).convert("RGB"); stage=full.resize((900,int(full.height*900/full.width)),Image.LANCZOS)
old=Image.open(OLD).convert("RGB"); new=Image.open(NEW).convert("RGB")
Hh=600
fit=lambda im: im.resize((int(im.width*Hh/im.height),Hh),Image.LANCZOS)
old,new=fit(old),fit(new)
W=960; pad=24
H=70+stage.height+40+40+Hh+80
sh=Image.new("RGB",(W,H),(11,15,24)); d=ImageDraw.Draw(sh)
f_t,f_s,f_b=font(30),font(17),font(20)
d.text((pad,18),"Gemini 黑框终版（t7）· 圆桌舞台实测",font=f_t,fill=(232,238,246))
y=70; sh.paste(stage,((W-stage.width)//2,y)); y+=stage.height+6
d.text((pad,y),"真舞台 stage-760 五座（DPR3，tpin=7000 定格）",font=f_s,fill=(140,158,180)); y+=34
gap=40; total=old.width+new.width+gap; x0=(W-total)//2
sh.paste(old,(x0,y)); sh.paste(new,(x0+old.width+gap,y))
d.text((x0,y+Hh+8),"t4：白亮带 + 硬边矩形平涂",font=f_b,fill=(248,176,176))
d.text((x0+old.width+gap,y+Hh+8),"t7：无光晕 / 无矩形 / 无黑线",font=f_b,fill=(160,226,182))
sh.save(OUT); print(OUT,sh.size,old.size,new.size)
