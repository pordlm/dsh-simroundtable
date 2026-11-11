from PIL import Image
im=Image.open("preview/_diag/_q_full.png").convert("RGB")
print(im.size)
im.crop((600,120,1420,860)).resize((1640,1480), Image.LANCZOS).save("preview/_diag/_q_full_head.png")
print("saved")
