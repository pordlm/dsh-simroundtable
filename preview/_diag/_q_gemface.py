from PIL import Image
im=Image.open("preview/_diag/_q_stage_gem.png").convert("RGB")
im.crop((250,250,640,700)).resize((390*3,450*3), Image.NEAREST).save("preview/_diag/_q_gem_face.png")
print(im.size)
