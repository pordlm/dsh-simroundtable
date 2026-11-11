import json, sys
sys.path.insert(0,"assets/_raw")
import psd2live_mcp as M
c=M.Client(); c.initialize()
res=c.rpc("tools/call",{"name":"workspace_inspect","arguments":{"request":{"scope":"layers"}}})
d=res["structuredContent"]["data"]
for it in d["items"]:
    print(f'{it["name"]:14s} vis={it.get("visible")} op={it.get("opacity")} role={it.get("role"):12s} type={it.get("type")}')
