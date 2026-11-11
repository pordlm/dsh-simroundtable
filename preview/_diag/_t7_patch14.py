p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
old = """        # (t7-3) No forced rectangle: a rect-shaped fill is what put a hard
        # right-angled patch on the lower cheek.  The seam is closed where it is
        # actually created instead: the face cut now grows 2 px outward with its
        # own edge colour (--grow), so the parts overlap, and the plate only seals
        # the outermost 2 px of a real gap that nothing else covers.
        _ = d_face"""
new = """        # (t7-4) The cheek gap is a real hole in the artwork -- the face is cut
        # around its own soft edge and the plate only ever had a sliver of skin
        # behind it -- so the alpha has to be backed across the face rect; a rim
        # alone leaves the neutral pose with 892 px of stage showing through.
        # What must NOT come from the rect is the COLOUR: see the master-colour
        # pass below, which is applied only where no front hair covers the fill.
        forced = np.zeros((canvas, canvas), bool)
        fr = face_layer["rect"]
        forced[fr["top"]:fr["top"] + fr["height"], fr["left"]:fr["left"] + fr["width"]] = True
        forced = ndimage.binary_dilation(forced, disk, iterations=12)
        if ref is not None:
            character = ndimage.binary_dilation(ref[..., 3] > 128, disk, iterations=2)
            forced &= character
        solid |= forced"""
assert old in s
s = s.replace(old, new, 1)
old2 = """    if holes.any():
        # keep only the rim: the outermost 2 px of every gap.  Filling deep into a
        # gap paints flat skin where the artwork has hair, which reads as a patch.
        holes &= ndimage.distance_transform_edt(holes) <= 2.0"""
assert old2 in s
s = s.replace(old2, "", 1)
open(p,"w",encoding="utf-8").write(s)
print("rect coverage back, no rim clamp, master colour kept")
