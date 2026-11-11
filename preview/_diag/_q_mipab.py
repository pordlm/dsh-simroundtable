from PIL import Image
ims=[]
for tag in ["nomip","mip"]:
    im=Image.open(f"preview/_diag/_q_mip_{tag}.png").convert("RGB")
    w,h=im.size
    # head area: model ~ 328 px tall at dsf=4 -> head near top
    ims.append(im.crop((int(w*0.28),int(h*0.10),int(w*0.72),int(h*0.46))))
w,h=ims[0].size
out=Image.new("RGB",(w*2+20,h),(255,255,255)); out.paste(ims[0],(0,0)); out.paste(ims[1],(w+20,0))
out.save("preview/_diag/_q_mip_ab.png"); print(out.size)
