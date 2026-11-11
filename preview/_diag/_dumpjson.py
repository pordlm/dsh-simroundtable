import json
from pathlib import Path
d = json.loads(Path("preview/_diag/_audit/out/runs/dounai/audit.json").read_text(encoding="utf-8"))
def walk(o, depth=0):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, (dict, list)):
                print("  " * depth + k)
                walk(v, depth + 1)
            else:
                print("  " * depth + f"{k} = {str(v)[:80]}")
    elif isinstance(o, list):
        print("  " * depth + f"[{len(o)} items]")
        if o: walk(o[0], depth + 1)
walk(d)
