from PIL import Image
for tag in ("before","after"):
    im = Image.open(f"preview/_diag/_{tag}_full.png").convert("RGB")
    im.crop((600,120,1420,860)).resize((1640,1480), Image.LANCZOS).save(f"preview/_diag/_{tag}_head.png")
print("ok")
