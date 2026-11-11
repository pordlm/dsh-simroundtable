p=r"preview\_diag\_t4_face_measure.py"
s=open(p,encoding="utf-8").read()
s=s.replace('''    ap.add_argument("--size", type=int, default=2048)''','''    ap.add_argument("--size", type=int, default=2048)
    ap.add_argument("--ref-build", default=str(ROOT / "assets/build/gemini-v1.bak.2026-11-07T2242"),
                    help="pre-fill build: the pixels that are opaque now and transparent there are the fill")''')
s=s.replace('''    fop = face[..., 3] >= 250
    df = ndimage.distance_transform_edt(~(face[..., 3] > 0))
    # plate pixels the face does not cover: the fill is what the viewer sees there
    fill = (plate[..., 3] >= 250) & (face[..., 3] < 128)''','''    fop = face[..., 3] >= 250
    df = ndimage.distance_transform_edt(~(face[..., 3] > 0))
    # The fill is exactly what the builder added: opaque now, transparent in the
    # build that came before it.  Using "plate opaque & face transparent" instead
    # would pull in the plate's own hair pixels under the bangs and compare them
    # to skin, which measures nothing.
    ref_build = Path(args.ref_build)
    if ref_build.exists():
        old_man = json.loads((ref_build / "gemini.layout.json").read_text(encoding="utf-8"))
        old_layers = {l["name"]: l for l in old_man["layers"]}
        old_plate = canvas_rgba(ref_build, old_layers["head base"], args.size)
        fill = (plate[..., 3] >= 250) & (old_plate[..., 3] < 8)
    else:
        fill = (plate[..., 3] >= 250) & (face[..., 3] < 128)''')
s=s.replace('print(f"face opaque  {int(fop.sum())} px   fill exposed {int(fill.sum())} px")',
            'print(f"face opaque  {int(fop.sum())} px   fill added {int(fill.sum())} px")')
open(p,"w",encoding="utf-8").write(s)
print("metric uses pre-fill build as the fill mask")
