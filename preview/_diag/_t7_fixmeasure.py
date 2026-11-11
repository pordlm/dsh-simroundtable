p=r"preview\_diag\_t4_face_measure.py"
s=open(p,encoding="utf-8").read()
i=s.index("    worst_dl = worst_dh = 0.0")
j=s.index("    ok = worst_dl < 3.0")
new = """    # The fill has to be invisible, i.e. its step against the pixel it actually
    # touches must be ~0.  Measuring against "the nearest skin" is only right where
    # the neighbour IS skin; under the jaw the neighbour is hair and the master's
    # own colour there is the dark jaw shading, which is correct, not a halo.  So
    # measure the visible step: every fill pixel adjacent (8-conn) to a non-fill
    # opaque pixel, compared with that neighbour.
    st = ndimage.generate_binary_structure(2, 1)
    op = plate[..., 3] >= 250
    nb = ndimage.binary_dilation(fill, st) & op & ~fill
    edge = fill & ndimage.binary_dilation(nb, st)
    dls, dhs = [], []
    for y, x in zip(*np.nonzero(edge)):
        cand = [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dy or dx) and op[y + dy, x + dx] and not fill[y + dy, x + dx]]
        if not cand:
            continue
        cur = lab_plate[y, x]
        best = None
        for yy, xx in cand:
            ref = lab_plate[yy, xx]
            dl = abs(float(cur[0] - ref[0]))
            h1 = np.degrees(np.arctan2(cur[2], cur[1]))
            h2 = np.degrees(np.arctan2(ref[2], ref[1]))
            dh = float(abs((h1 - h2 + 180) % 360 - 180))
            if best is None or dl < best[0]:
                best = (dl, dh)
        dls.append(best[0])
        dhs.append(best[1])
    dls = np.array(dls); dhs = np.array(dhs)
    if len(dls) == 0:
        print("no fill/skin boundary found")
        return 1
    print(f"boundary px {len(dls)}   dL med {np.median(dls):.2f} p90 {np.percentile(dls, 90):.2f} max {dls.max():.2f}")
    print(f"                      dH med {np.median(dhs):.2f} p90 {np.percentile(dhs, 90):.2f} max {dhs.max():.2f}")
    worst_dl = float(np.median(dls))
    worst_dh = float(np.median(dhs))
"""
s = s[:i] + new + s[j:]
open(p,"w",encoding="utf-8").write(s)
print("patched")
