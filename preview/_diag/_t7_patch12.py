p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
anchor = "    a[~solid, 3] = 0"
assert anchor in s, "anchor missing"
add = """    # 2026-11-08 (t7-2): below the chin the plate reaches well past the head and
    # the plate's own blurred colours there are much lighter than the master's
    # dark jaw/neck shading, which read as a pale bar with a straight edge.  Where
    # no semi-transparent front hair is drawn on top, the master's finished colour
    # is the correct one, so use it there with a 2 px feather inward so the fill
    # can never show a hard boundary of its own.
    fh = np.zeros((canvas, canvas), np.float64)
    fhl = next((l for l in layers if l["name"] == "front hair"), None)
    if fhl is not None:
        fim = Image.open(out / Path(fhl["image"]["path"]).as_posix()).convert("RGBA")
        ftmp = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        ftmp.paste(fim, (fhl["rect"]["left"], fhl["rect"]["top"]), fim)
        fh = np.asarray(ftmp)[..., 3].astype(np.float64)
    if ref is not None and holes.any():
        exposed = holes & (ref[..., 3] > 128) & (fh < 20)
        if exposed.any():
            dfill = ndimage.distance_transform_edt(holes)
            fe = np.clip((dfill - 1.0) / 2.0, 0.0, 1.0)
            m = exposed & (fe > 0)
            a[m, :3] = (1.0 - fe[m, None]) * a[m, :3] + fe[m, None] * ref[m, :3]
"""
s = s.replace(anchor, add + anchor, 1)
open(p,"w",encoding="utf-8").write(s)
print("master colour restored where no front hair covers the fill")
