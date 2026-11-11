import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace("def head_base(layers, canvas=CANVAS):", "def head_base(layers, out, canvas=CANVAS):")
s = s.replace('Image.open(OUT / Path(l["image"]["path"]).as_posix())', 'Image.open(out / Path(l["image"]["path"]).as_posix())')
s = s.replace('im.save(OUT / "parts" / "head_base.png")', 'im.save(out / "parts" / "head_base.png")')
s = s.replace("    base = head_base(layers)", "    base = head_base(layers, OUT)")
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
