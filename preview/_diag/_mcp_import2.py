import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
st = c.rpc("tools/call", {"name":"workspace_inspect","arguments":{"request":{"scope":"project"}}})["structuredContent"]["data"]
print("state:", st["state"], "pid:", st.get("project_id"))
r = c.rpc("tools/call", {"name":"project_import_layout","arguments":{"request":{
  "path":"D:/dsh_simroundtable/assets/build/gemini-layout/gemini.layout.json",
  "state":st["state"],"project_id":st.get("project_id"),"discard_unsaved":True,"request_id":"gemini-import"}}})
print("isError:", r.get("isError"))
d = r.get("structuredContent", {})
print("keys:", list(d.keys()))
print(json.dumps(d, ensure_ascii=False)[:1200])
