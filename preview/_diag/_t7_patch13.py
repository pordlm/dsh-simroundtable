p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
i=s.index("        forced = np.zeros((canvas, canvas), bool)")
j=s.index("        solid |= forced", i)+len("        solid |= forced")
new = """        # (t7-3) No forced rectangle: a rect-shaped fill is what put a hard
        # right-angled patch on the lower cheek.  The seam is closed where it is
        # actually created instead: the face cut now grows 2 px outward with its
        # own edge colour (--grow), so the parts overlap, and the plate only seals
        # the outermost 2 px of a real gap that nothing else covers.
        _ = d_face"""
s = s[:i] + new + s[j:]
# rim-only fill
old = "    holes = solid & (a[..., 3] < 250)"
new2 = """    holes = solid & (a[..., 3] < 250)
    if holes.any():
        # keep only the rim: the outermost 2 px of every gap.  Filling deep into a
        # gap paints flat skin where the artwork has hair, which reads as a patch.
        holes &= ndimage.distance_transform_edt(holes) <= 2.0"""
assert old in s
s = s.replace(old, new2, 1)
open(p,"w",encoding="utf-8").write(s)
print("rect forced removed; rim-only fill (<=2px); face grows via --grow")
