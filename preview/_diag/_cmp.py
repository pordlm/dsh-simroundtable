import json
from pathlib import Path
d=json.loads(Path("preview/_diag/_audit/out/runs/dounai/audit.json").read_text(encoding="utf-8"))
p=d["rigs"]["dounai"]["poses"]["neutral"]
print("json truth", p["truth"], "holes", p["holes"])
