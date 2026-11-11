import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
print("endpoint:", M.ENDPOINT)
c = M.Client()
try:
    r = c.initialize()
    print("init:", json.dumps(r)[:400])
except Exception as e:
    print("init failed:", type(e).__name__, e)
    sys.exit(1)
try:
    r = c.rpc("tools/list", {})
    tools = r.get("tools", [])
    print("tools:", len(tools), [t.get("name") for t in tools][:12])
except Exception as e:
    print("tools/list failed:", type(e).__name__, e)
