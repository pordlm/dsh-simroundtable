import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
r = c.rpc("tools/call", {"name": "workspace_inspect", "arguments": {"request": {"scope": "project"}}})
print(json.dumps(r)[:1200])
