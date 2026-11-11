import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
start = s.index("def head_base(")
end = s.index("def main() -> int:")
new = '''def head_base(layers, out, canvas=CANVAS):
    """Opaque head plate behind the face and the hair.

    The parts are cut tight, so neighbouring pieces only touch: at 1:1 the
    front-hair strands and the face leave 115 holes totalling 1427 px between
    them, and a dark stage turns those into black specks.  The plate is built
    from the head parts themselves (so it is aligned by construction) and the
    gaps are filled with a premultiplied blur of the surroundings, which keeps
    the colour continuous instead of picking up the dark outline next door.
    """
    stack = [l for l in layers if l["name"] in HEAD_PARTS]
    if not stack:
        return None
    plate = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    mask = Image.new("L", (canvas, canvas), 0)
    for l in stack:
        im = Image.open(out / Path(l["image"]["path"]).as_posix()).convert("RGBA")
        pos = (l["rect"]["left"], l["rect"]["top"])
        plate.alpha_composite(im, pos)
        mask.paste(Image.new("L", im.size, 255), pos, im.getchannel("A"))

    a = np.asarray(plate).astype(np.float64)
    solid = (np.asarray(mask) > 0) | (a[..., 3] > 0)
    solid = ndimage.binary_fill_holes(ndimage.binary_closing(solid, np.ones((5, 5))))
    solid = ndimage.binary_dilation(solid, ndimage.generate_binary_structure(2, 2), iterations=8)

    alpha = a[..., 3] / 255.0
    premul = a[..., :3] * alpha[..., None]
    sigma = (7, 7, 0)
    num = ndimage.gaussian_filter(premul, sigma)
    den = ndimage.gaussian_filter(alpha, sigma)
    blur = np.zeros_like(premul)
    ok = den > 1e-4
    blur[ok] = num[ok] / den[ok, None]

    holes = solid & (a[..., 3] < 250)
    a[holes, :3] = blur[holes]
    a[holes, 3] = 255
    a[~solid, 3] = 0

    a8 = np.clip(a, 0, 255).astype(np.uint8)
    ys, xs = np.where(a8[..., 3] > 0)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    im = Image.fromarray(a8, "RGBA").crop(box)
    im.save(out / "parts" / "head_base.png")
    return {"file": "parts/head_base.png", "name": "head base",
            "rect": {"left": box[0], "top": box[1], "width": box[2] - box[0], "height": box[3] - box[1]}}


'''
s = s[:start] + new + s[end:]
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("rewritten ok")
