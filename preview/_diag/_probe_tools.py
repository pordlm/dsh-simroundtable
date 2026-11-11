import json, sys
sys.path.insert(0,"assets/_raw")
import psd2live_mcp as M
c=M.Client(); c.initialize()
res=c.rpc("tools/list",{})
tools={t["name"]:t for t in res["result"]["tools"]}
for n in ["project_import_layout","rig_generate","physics_put","project_export_model","job_wait","workspace_inspect"]:
    t=tools.get(n)
    print("==",n, "MISSING" if not t else "")
    if t: print(json.dumps(t.get("inputSchema"),ensure_ascii=False)[:1200])
