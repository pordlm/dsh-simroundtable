import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace('''    solid = ndimage.binary_dilation(solid, ndimage.generate_binary_structure(2, 2), iterations=6)
    solid &= silhouette''',
'''    solid = ndimage.binary_dilation(solid, ndimage.generate_binary_structure(2, 2), iterations=6)''')
s = s.replace('''    holes = solid & (a[..., 3] < 250)
    a[holes, :3] = blur[holes]
    a[holes, 3] = 255''',
'''    holes = solid & (a[..., 3] < 250)
    # Interior gaps take the blurred neighbourhood colour (skin, smooth); the ring
    # that laps outside the head takes the nearest opaque part colour, so it reads
    # as skin at the chin instead of a pale glow.
    a[holes, :3] = blur[holes]
    a[holes, 3] = 255
    ring = holes & ~inner
    if ring.any():
        idx = ndimage.distance_transform_edt(a[..., 3] < 250, return_distances=False,
                                             return_indices=True)
        a[ring, :3] = a[idx[0][ring], idx[1][ring], :3]''')
s = s.replace('''    alpha = a[..., 3] / 255.0''',
'''    inner = ndimage.binary_fill_holes((a[..., 3] > 0))
    alpha = a[..., 3] / 255.0''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
