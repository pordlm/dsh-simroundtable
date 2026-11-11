import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
tools = {t["name"]: t for t in c.rpc("tools/list", {})["tools"]}
for n in ["project_import_layout","rig_generate","physics_put","project_export_model","workspace_apply_edits"]:
    t = tools.get(n)
    print("==", n)
    print(json.dumps(t.get("inputSchema"), ensure_ascii=False)[:900])
