import json, sys
sys.path.insert(0,"assets/_raw")
import psd2live_mcp as M
c=M.Client(); c.initialize()
res=c.rpc("tools/call",{"name":"workspace_inspect","arguments":{"request":{"scope":"project"}}})
d=res["structuredContent"].get("data",res["structuredContent"])
print("project",d.get("project_id"),"state",d.get("state"))
print(json.dumps({k:v for k,v in d.items() if k not in ("state",)},ensure_ascii=False)[:1500])
