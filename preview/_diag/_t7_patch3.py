p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
# remove the current face-fill block
i=s.find("    # 2026-11-08 (t7): take the fill colour from the face cut's own opaque pixels")
j=s.find("    ring = holes & (~inner | (den < 0.02))")
assert i!=-1 and j!=-1 and i<j
s = s[:i] + s[j:]
# insert after the ring block, before the relaxation
k=s.find("    # Relax the filled pixels toward their neighbourhood")
assert k!=-1
block = '''    # 2026-11-08 (t7): only a narrow band right next to the skin takes the face
    # cut's own colour.  Filling the whole area with skin is what turned the jaw
    # into a pale halo: the plate reaches ~60 px past the chin, and in the master
    # that area is hair, not skin.  So the blend is 1.0 at the face edge and fades
    # out over 4 px; further in the fill keeps the plate's own (hair) colours from
    # the blur / nearest-opaque passes above.  Product colours only -- never the
    # master, which is 0.55-0.78x brighter than the finished texture.
    if face_op.any():
        fidx = ndimage.distance_transform_edt(~face_op, return_distances=False,
                                              return_indices=True)
        skin = fa[fidx[0], fidx[1], :3]
        d_face = ndimage.distance_transform_edt(~face_op)
        near = np.clip((4.0 - d_face) / 4.0, 0.0, 1.0)[..., None]
        m = holes & (near[..., 0] > 0.0)
        if m.any():
            a[m, :3] = (1.0 - near[m]) * a[m, :3] + near[m] * skin[m]
'''
s = s[:k] + block + s[k:]
s = s.replace("        for _ in range(96):", "        for _ in range(24):")
open(p,"w",encoding="utf-8").write(s)
print("patched band blend + 24 iters")
