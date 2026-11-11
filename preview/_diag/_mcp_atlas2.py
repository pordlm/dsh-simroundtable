import json, sys
sys.path.insert(0, r"assets/_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
tools = {t["name"]: t for t in c.rpc("tools/list", {})["tools"]}
for n in ("atlas_get","atlas_pack","atlas_set_budget","atlas_set_tile","atlas_check_placement","rig_generate"):
    if n in tools:
        p = tools[n].get("inputSchema",{}).get("properties",{})
        print("==", n, "==")
        print(json.dumps(p, ensure_ascii=False)[:1500])
