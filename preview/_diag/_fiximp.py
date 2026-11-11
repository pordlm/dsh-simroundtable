from pathlib import Path
p = Path("preview/_diag/_holes_exempt.py")
t = p.read_text(encoding="utf-8")
t = t.replace('sys.path.insert(0, str(ROOT / "preview/_diag/_audit"))\n\nimport common as C\nimport metrics as M',
              'sys.path.insert(0, str(ROOT / "preview/_diag"))\n\nfrom _audit import common as C   # noqa: E402\nfrom _audit import metrics as M  # noqa: E402')
p.write_text(t, encoding="utf-8")
print("patched")
