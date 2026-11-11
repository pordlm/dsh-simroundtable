p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
anchor = """            if nm.split("-")[0] in {"face", "neck"} and args.clean_rim:"""
add = """            if nm == "face":
                # (t7-5) The cut leaves the face's lower edge as a dotted alpha
                # fringe: clean_rim strips the dark jaw outline, so the remaining
                # alpha pixels alternate and the plate shows through them as a grey
                # dotted line at 6x.  Close the 1 px dash gaps in the alpha itself
                # rather than covering them with the plate, and harden the fringe
                # so the silhouette has no semi-transparent speckle left.
                fa = np.asarray(im).astype(np.float64)
                m = fa[..., 3] > 24
                m2 = ndimage.binary_closing(m, ndimage.generate_binary_structure(2, 1))
                m2 = ndimage.binary_closing(m2, ndimage.generate_binary_structure(2, 2))
                hard = m2 & (fa[..., 3] >= 24)
                soft = m2 & ~hard
                if soft.any():
                    fa[soft, 3] = 0
                fa[hard, 3] = 255
                im = Image.fromarray(np.clip(fa, 0, 255).astype(np.uint8))
"""
assert anchor in s
s = s.replace(anchor, add + anchor, 1)
open(p,"w",encoding="utf-8").write(s)
print("face alpha de-dashed")
