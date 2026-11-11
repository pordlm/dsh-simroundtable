from PIL import Image
im = Image.open("preview/_diag/_seam_orig.png").convert("RGB")
im.crop((820, 480, 1240, 900)).save("preview/_diag/_seam_face_11.png")
im.crop((820, 480, 1240, 900)).resize((840, 840), Image.LANCZOS).save("preview/_diag/_seam_face_11_2x.png")
print("ok")
