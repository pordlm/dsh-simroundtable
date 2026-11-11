import json, io, sys
path = sys.argv[1] if len(sys.argv) > 1 else r"preview/_diag/_audit/out/runs/qwen+dounai+minimax/audit.json"
d = json.load(io.open(path, encoding="utf-8"))
rigs = d.get("rigs")
print("rigs type:", type(rigs).__name__)
if isinstance(rigs, dict):
    for name, rig in rigs.items():
        print(f"== {name}  keys={list(rig)[:8] if isinstance(rig, dict) else rig}")
        poses = rig.get("poses") if isinstance(rig, dict) else None
        if isinstance(poses, dict):
            for pose, p in poses.items():
                print(f"   {pose:11s} {json.dumps(p, ensure_ascii=False)[:300]}")
        elif isinstance(poses, list):
            for p in poses:
                print(f"   {json.dumps(p, ensure_ascii=False)[:300]}")
elif isinstance(rigs, list):
    for rig in rigs:
        print("==", json.dumps(rig, ensure_ascii=False)[:400])