import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace('''    solid = ndimage.binary_dilation(solid, ndimage.generate_binary_structure(2, 2), iterations=8)''',
'''    outline = Image.new("L", (canvas, canvas), 0)
    for l in layers:
        im = Image.open(out / Path(l["image"]["path"]).as_posix()).convert("RGBA")
        outline.paste(Image.new("L", im.size, 255), (l["rect"]["left"], l["rect"]["top"]),
                      im.getchannel("A"))
    # The plate may slide a few px past the head (a turned face opens a sliver that
    # lies outside the head outline) but it must never pass the character's
    # silhouette, or it shows up as a pale halo on the backdrop.
    silhouette = np.asarray(outline) > 0
    solid = ndimage.binary_dilation(solid, ndimage.generate_binary_structure(2, 2), iterations=6)
    solid &= silhouette''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
