p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
old = """        disk = ndimage.generate_binary_structure(2, 2)
        head = (a[..., 3] > 0) | face_op
        head = ndimage.binary_closing(head, disk, iterations=11)
        head = ndimage.binary_fill_holes(head)
        d_face = ndimage.distance_transform_edt(~face_op)
        # The cheek gaps sit 70-90 px away from anything the face cut owns, so a
        # tight band misses them and the seam comes back.  What the fill really
        # has to cover is the head's own interior: the plate already paints every
        # hair pixel there, so only the gaps are affected, and their boundary is
        # the gap's irregular outline -- never a rectangle.
        forced = (d_face <= 120.0) & head"""
new = """        disk = ndimage.generate_binary_structure(2, 2)
        d_face = ndimage.distance_transform_edt(~face_op)
        # Only an offset band around the face cut is forced (t7).  The seam the
        # user sees is the face's own soft edge sliding off its backing, so the
        # backing only has to exist within a few px of the cut.  Filling the whole
        # cheek gap instead painted a flat skin rectangle over 34.8% of the face
        # rect (t6/t5 measured it as a hard-edged patch, L* std 11.5 vs 29.1).
        # The band's boundary is the face outline offset by 10 px -- curved, so no
        # straight edge or right angle can appear.
        forced = (d_face <= 10.0)"""
assert old in s
s=s.replace(old,new)
open(p,"w",encoding="utf-8").write(s)
print("forced = 10px offset band around the face cut")
