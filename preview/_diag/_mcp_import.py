import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
st = c.rpc("tools/call", {"name":"workspace_inspect","arguments":{"request":{"scope":"project"}}})["structuredContent"]["data"]["state"]
print("state:", st)
r = c.rpc("tools/call", {"name":"project","arguments":{"op":"import_layout","request":{"path":"D:/dsh_simroundtable/assets/build/gemini-layout/gemini.layout.json","state":st,"discard_unsaved":True,"request_id":"gemini-import"},"wait_ms":30000}})
print("isError:", r.get("isError"))
print(json.dumps(r)[:1500])
