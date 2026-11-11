from PIL import Image
im = Image.open("assets/build/gemini-parts/matte.png").convert("RGBA")
bg = Image.new("RGBA", im.size, (18, 25, 39, 255))
bg.alpha_composite(im)
c = bg.convert("RGB").crop((380, 300, 680, 640))
c.resize((c.width*2, c.height*2), Image.LANCZOS).save("preview/_diag/_mother_face.png")
print(im.size, c.size)
