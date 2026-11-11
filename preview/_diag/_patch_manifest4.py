import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace('''    filled = ndimage.binary_fill_holes(ndimage.binary_closing(solid, np.ones((5, 5))))
    holes = filled & ~solid
    if holes.any():
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[holes, :3] = a[idx[0][holes], idx[1][holes], :3]
        a[holes, 3] = 255''',
'''    filled = ndimage.binary_fill_holes(ndimage.binary_closing(solid, np.ones((5, 5))))
    # Lap the plate ~8 px past the head silhouette: when the head turns the face
    # edge and the hair edge slide apart by a few px, and that sliver is *outside*
    # the head outline.  Everything the plate overlaps is body/clothing, which is
    # drawn on top of it, so the extra ring is invisible there.
    filled = ndimage.binary_dilation(filled, ndimage.generate_binary_structure(2, 2), iterations=8)
    holes = filled & ~solid
    if holes.any():
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[holes, :3] = a[idx[0][holes], idx[1][holes], :3]
        a[holes, 3] = 255''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
