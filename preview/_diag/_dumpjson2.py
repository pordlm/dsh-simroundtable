import json
from pathlib import Path
d = json.loads(Path("preview/_diag/_audit/out/runs/dounai/audit.json").read_text(encoding="utf-8"))
r = d["rigs"]["dounai"]
print("window", r["window"])
print("union_bbox", r["union_bbox"])
print("notes", r["notes"])
for pose, p in r["poses"].items():
    print("==", pose, {k: v for k, v in p.items() if not isinstance(v, (list, dict))})
    for k in ("truth", "holes", "seams"):
        v = p.get(k)
        if isinstance(v, dict):
            items = {kk: vv for kk, vv in v.items() if not isinstance(vv, list)}
            print("  ", k, items)
            for comp in (v.get("components") or [])[:4]:
                print("     comp", comp)
