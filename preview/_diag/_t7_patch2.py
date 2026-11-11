p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()

old_forced_start = "    face_layer = next((l for l in layers if l[\"name\"] == \"face\"), None)\n    forced = np.zeros((canvas, canvas), bool)"
i = s.find(old_forced_start)
j = s.find("        solid |= forced\n", i)
assert i != -1 and j != -1 and j - i < 2000, (i, j)
j += len("        solid |= forced\n")
new_forced = '''    face_layer = next((l for l in layers if l["name"] == "face"), None)

    # 2026-11-08 (t7): the forced area must follow the head, not the face rect.
    # A rect-shaped fill (t4) left the fill's colour and its boundary pinned to
    # the rectangle, which showed up as a hard right-angled patch on the lower
    # cheek -- and it was independent of the backdrop, i.e. a colour leak rather
    # than an alpha seam.  Build the region from the head's own shape instead:
    # the closed union of the plate and the face cut, intersected with a curved
    # band around the face cut.  No straight edges can come out of that.
    fa = np.zeros((canvas, canvas, 4), np.float64)
    face_op = np.zeros((canvas, canvas), bool)
    if face_layer is not None:
        fimg = Image.open(out / Path(face_layer["image"]["path"]).as_posix()).convert("RGBA")
        fcanvas = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        fcanvas.paste(fimg, (face_layer["rect"]["left"], face_layer["rect"]["top"]), fimg)
        fa = np.asarray(fcanvas).astype(np.float64)
        face_op = fa[..., 3] > 0

    forced = np.zeros((canvas, canvas), bool)
    if face_layer is not None:
        disk = ndimage.generate_binary_structure(2, 2)
        head = (a[..., 3] > 0) | face_op
        head = ndimage.binary_closing(head, disk, iterations=11)
        head = ndimage.binary_fill_holes(head)
        d_face = ndimage.distance_transform_edt(~face_op)
        forced = (d_face <= 60.0) & head
        if ref is not None:
            character = ref[..., 3] > 128
            character = ndimage.binary_dilation(character, disk, iterations=2)
            forced &= character
        solid |= forced
'''
s = s[:i] + new_forced + s[j:]

marker = "    ring = holes & (~inner | (den < 0.02))"
k = s.find(marker)
assert k != -1
face_fill = '''    # 2026-11-08 (t7): take the fill colour from the face cut's own opaque pixels
    # -- the real finished texture -- and never from the master art (0.55-0.78x
    # brighter, it read as a pale halo under the jaw).  Nearest opaque face pixel
    # keeps the fill in the face's own palette; the relaxation pass below then
    # smooths the copy so the fill meets the skin without a step.
    if face_op.any():
        use = holes & (ref[..., 3] > 128 if ref is not None else True)
        if use.any():
            fidx = ndimage.distance_transform_edt(~face_op, return_distances=False,
                                                  return_indices=True)
            a[use, :3] = fa[fidx[0][use], fidx[1][use], :3]
'''
s = s[:k] + face_fill + s[k:]
open(p,"w",encoding="utf-8").write(s)
print("patched shape-driven forced + face colour")
