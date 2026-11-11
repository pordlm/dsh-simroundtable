import re, pathlib
p = pathlib.Path("preview/_diag/_t4_check.py")
s = p.read_text(encoding="utf-8")
s = s.replace('    names = [l["name"] for l in man["layers"]])', '    names = [l["name"] for l in man["layers"]])')
s = s.replace('    face = st["face"]\n    plate = st["head base"]\n    fb = face["rect"]',
              '    face = st["face"]\n    plate = st["head base"]\n    fb = next(l["rect"] for l in man["layers"] if l["name"] == "face")')
p.write_text(s, encoding="utf-8")
print("patched")
