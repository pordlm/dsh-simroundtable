import pathlib, re
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")

helper = '''
HEAD_PARTS = ("neck", "face", "eye close", "eyewhite", "irides", "mouth close",
              "mouth open", "ears", "front hair", "headwear")


def head_base(layers, canvas=CANVAS):
    """Opaque head plate composited from the head parts themselves.

    The cuts are tight, so neighbouring parts only touch: at 1:1 a dozen 10-30 px
    holes open up between the front-hair strands and the face (115 holes, 1427 px
    measured on gemini-v1).  Against a dark stage those holes read as black
    blocks.  A plate of the artwork's own pixels behind the head turns them into
    skin/hair instead, without touching any silhouette.
    """
    plate = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    stack = [l for l in layers if l["name"] in HEAD_PARTS]
    if not stack:
        return None
    for l in stack:
        im = Image.open(OUT / "parts" / Path(l["file"]).name).convert("RGBA")
        plate.alpha_composite(im, (l["rect"]["left"], l["rect"]["top"]))
    a = np.asarray(plate).copy()
    solid = a[..., 3] > 0
    filled = ndimage.binary_fill_holes(ndimage.binary_closing(solid, np.ones((5, 5))))
    holes = filled & ~solid
    if holes.any():
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[holes, :3] = a[idx[0][holes], idx[1][holes], :3]
        a[holes, 3] = 255
    ys, xs = np.where(a[..., 3] > 0)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    im = Image.fromarray(a, "RGBA").crop(box)
    im.save(OUT / "parts" / "head_base.png")
    return {"file": "parts/head_base.png", "name": "head base",
            "rect": {"left": box[0], "top": box[1], "width": box[2] - box[0], "height": box[3] - box[1]}}

'''
s = s.replace("def main() -> int:", helper + "def main() -> int:", 1)
p.write_text(s, encoding="utf-8")
print("helper inserted")
