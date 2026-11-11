from PIL import Image
im = Image.open("preview/_diag/_stage_after.png").convert("RGB")
im.crop((150,360,660,880)).resize((1530,1560), Image.LANCZOS).save("preview/_diag/_stage_gem_head.png")
print("ok")
