import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")

s = s.replace('''        im = Image.open(OUT / "parts" / Path(l["file"]).name).convert("RGBA")''',
'''        im = Image.open(OUT / l["image"]["path"].replace("parts/", "parts/")).convert("RGBA")
        im = Image.open(OUT / Path(l["image"]["path"]).as_posix()).convert("RGBA")''')
s = s.replace('''        im = Image.open(OUT / l["image"]["path"].replace("parts/", "parts/")).convert("RGBA")
        im = Image.open(OUT / Path(l["image"]["path"]).as_posix()).convert("RGBA")''',
'''        im = Image.open(OUT / Path(l["image"]["path"]).as_posix()).convert("RGBA")''')

s = s.replace('''    manifest = {
        "format": "psd2live-layout",''',
'''    base = head_base(layers)
    if base:
        bip = Image.open(OUT / "parts" / "head_base.png")
        idx = next((i for i, l in enumerate(layers) if l["name"] == "tail"), 0) + 1
        layers.insert(idx, {
            "name": base["name"],
            "image": {"path": "parts/head_base.png", "width": bip.width, "height": bip.height},
            "rect": base["rect"],
        })
        print(f"head base: rect={base['rect']}")

    manifest = {
        "format": "psd2live-layout",''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("patched + syntax ok")
