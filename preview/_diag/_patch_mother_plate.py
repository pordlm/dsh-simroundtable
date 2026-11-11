import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")

s = s.replace('''    plate = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))''',
'''    mother = ROOT / "assets/build/gemini-parts/matte.png"
    plate = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    if mother.exists():
        # The artwork itself, mapped the same way the cut mapped it: the plate then
        # carries the mother's own chin/jaw line instead of a nearest-colour guess.
        mt = Image.open(mother).convert("RGBA")
        big = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        big.alpha_composite(mt.resize((round(mt.width * 1.2601), round(mt.height * 1.2601)),
                                      Image.LANCZOS), (379, 68))
        plate = big''')

s = s.replace('''    for l in stack:
        im = Image.open(out / Path(l["image"]["path"]).as_posix()).convert("RGBA")
        plate.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
    a = np.asarray(plate).copy()
    solid = a[..., 3] > 0''',
'''    mask = Image.new("L", (canvas, canvas), 0)
    for l in stack:
        im = Image.open(out / Path(l["image"]["path"]).as_posix()).convert("RGBA")
        mask.paste(Image.new("L", im.size, 255), (l["rect"]["left"], l["rect"]["top"]),
                   im.getchannel("A"))
    a = np.asarray(plate).copy()
    solid = np.asarray(mask) > 0
    a[~solid, 3] = 0''')
s = s.replace('''    ys, xs = np.where(a[..., 3] > 0)''',
'''    holes = filled & ~solid
    if holes.any():
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[holes, :3] = a[idx[0][holes], idx[1][holes], :3]
        a[holes, 3] = 255
    ys, xs = np.where(a[..., 3] > 0)''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
