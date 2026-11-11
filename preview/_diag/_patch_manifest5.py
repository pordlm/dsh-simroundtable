import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")

helper = '''
def clean_rim(im: Image.Image, ring_px: int = 7, dark: int = 150):
    """Drop the dark fringe the cut kept along a skin part's outline.

    The mother art draws the chin/jaw with a dark stroke that sits on the hair
    side.  The colour-based cut assigns those stroke pixels to the face, so the
    face part arrives with a ring of black teeth that reads as a torn outline.
    Everything within `ring_px` of the outer silhouette that is much darker than
    skin is removed; the head plate behind supplies the skin colour.
    """
    a = np.asarray(im).copy()
    solid = a[..., 3] > 0
    filled = ndimage.binary_fill_holes(solid)
    ring = filled & ~ndimage.binary_erosion(filled, ndimage.generate_binary_structure(2, 2),
                                            iterations=ring_px)
    lum = a[..., :3].astype(int).mean(axis=2)
    kill = ring & solid & (lum < dark)
    a[kill, 3] = 0
    return Image.fromarray(a, "RGBA"), int(kill.sum())

'''
s = s.replace("def head_base(", helper + "def head_base(", 1)
s = s.replace('''            im, pad = grow(im, 0 if nm.split("-")[0] in skip else args.grow)''',
'''            if nm.split("-")[0] in {"face", "neck"} and args.clean_rim:
                im, killed = clean_rim(im)
                if killed:
                    print(f"  {nm}: cleared dark rim {killed} px")
            im, pad = grow(im, 0 if nm.split("-")[0] in skip else args.grow)''')
s = s.replace('''    args = ap.parse_args()''',
'''    ap.add_argument("--clean-rim", type=int, default=1,
                    help="1 = strip the dark cut fringe from face/neck (0 keeps it)")
    args = ap.parse_args()''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
