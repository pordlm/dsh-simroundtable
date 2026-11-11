import json, pathlib
p = pathlib.Path("preview/_diag/_audit/out/audit.json")
d = json.loads(p.read_text(encoding="utf-8"))
rigs = d.get("rigs") or d
for r in (rigs if isinstance(rigs, list) else rigs.values()):
    name = r.get("name") or r.get("rig")
    if name and "mimo" in str(name).lower():
        print(name, "->", r.get("model3") or r.get("model") or r.get("path"))
