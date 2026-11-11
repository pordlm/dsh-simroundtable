import json, sys
sys.path.insert(0,"assets/_raw")
import psd2live_mcp as M
c=M.Client(); c.initialize()
tools={t["name"]:t for t in c.rpc("tools/list",{})["tools"]}
sch=tools["view_render_model"]["inputSchema"]["properties"]["request"]
print("required:", sch.get("required"))
for k,v in sch["properties"].items():
    d=(v.get("description") or "")[:90].replace("\n"," ")
    print(f'  {k:22s} {v.get("type")} {d}')
