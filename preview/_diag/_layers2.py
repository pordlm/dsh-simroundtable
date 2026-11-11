import json, sys
sys.path.insert(0,"assets/_raw")
import psd2live_mcp as M
c=M.Client(); c.initialize()
for scope in ("layers","overview"):
    res=c.rpc("tools/call",{"name":"workspace_inspect","arguments":{"request":{"scope":scope}}})
    d=res.get("structuredContent",{}).get("data",{})
    print("==",scope,"err",d.get("error"))
    txt=json.dumps(d,ensure_ascii=False)
    print(txt[:900])
