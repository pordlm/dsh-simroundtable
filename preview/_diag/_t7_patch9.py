p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
old = """        d_face = ndimage.distance_transform_edt(~face_op)
        forced = (d_face <= 60.0) & head"""
new = """        d_face = ndimage.distance_transform_edt(~face_op)
        # The cheek gaps sit 70-90 px away from anything the face cut owns, so a
        # tight band misses them and the seam comes back.  What the fill really
        # has to cover is the head's own interior: the plate already paints every
        # hair pixel there, so only the gaps are affected, and their boundary is
        # the gap's irregular outline -- never a rectangle.
        forced = (d_face <= 120.0) & head"""
assert old in s
s=s.replace(old,new)
open(p,"w",encoding="utf-8").write(s)
print("forced = head interior within 120px of the face")
