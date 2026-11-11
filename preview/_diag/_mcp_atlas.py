import json, os, sys
sys.path.insert(0, r"assets/_raw")
import psd2live_mcp as M

c = M.Client(); c.initialize()
tools = c.rpc("tools/list", {})["tools"]
names = sorted(t["name"] for t in tools)
print("total", len(names))
for pat in ("atlas","padding","texture","export","import_layout","rig_generate"):
    print(f"[{pat}]", [n for n in names if pat in n][:14])
for t in tools:
    if t["name"] in ("project_export_model","project_import_layout"):
        print("---", t["name"], "---")
        print(json.dumps(t.get("inputSchema",{}).get("properties",{}), ensure_ascii=False)[:1600])
