p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
old = """        forced = (d_face <= 10.0)"""
new = """        # Cover the whole face rect (grown by the face's soft-edge width) so the
        # cheeks stay backed when the head turns, but keep the fill in the PLATE's
        # own colours: skin only in a 2 px band next to the cut, the plate's
        # hair/blur colours beyond it.  Filling the cheeks with skin (or with the
        # brighter master) is what produced the hard pale patch in t4.
        forced = np.zeros((canvas, canvas), bool)
        fr = face_layer["rect"]
        forced[fr["top"]:fr["top"] + fr["height"], fr["left"]:fr["left"] + fr["width"]] = True
        forced = ndimage.binary_dilation(forced, disk, iterations=12)"""
assert old in s
s=s.replace(old,new)
open(p,"w",encoding="utf-8").write(s)
print("rect coverage restored, colours stay local")
