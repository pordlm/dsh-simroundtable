import re
p=r"preview\_diag\_t4_face_measure.py"
s=open(p,encoding="utf-8").read()
s=s.replace('''        sel = fill[ys, xs]''','''        # only the pixels that actually border the skin: further in the fill is
        # allowed to be hair colour (that is what the master shows under the jaw)
        sel = fill[ys, xs] & (df[ys, xs] <= 5.0)''')
s=s.replace('''    fop = face[..., 3] >= 250''','''    fop = face[..., 3] >= 250
    df = ndimage.distance_transform_edt(~(face[..., 3] > 0))''')
open(p,"w",encoding="utf-8").write(s)
print("metric now band-limited to <=5px from skin")
