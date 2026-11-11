import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
tools = {t["name"]: t for t in c.rpc("tools/list", {})["tools"]}
sch = tools["physics_put"]["inputSchema"]["properties"]["request"]
print("required:", sch.get("required"))
print("props:", list(sch.get("properties", {}).keys()))
print(json.dumps(sch.get("properties", {}).get("id"), ensure_ascii=False)[:200])
print(json.dumps(sch.get("properties", {}).get("output_scale"), ensure_ascii=False)[:300])
print(json.dumps(sch.get("properties", {}).get("mobility"), ensure_ascii=False)[:300])
print(json.dumps(sch.get("properties", {}).get("delay"), ensure_ascii=False)[:300])
print(json.dumps(sch.get("properties", {}).get("acceleration"), ensure_ascii=False)[:300])
