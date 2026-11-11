import json, sys
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
tools = {t["name"]: t for t in c.rpc("tools/list", {})["tools"]}
jobs = [n for n in tools if "job" in n or "wait" in n or "poll" in n]
print(jobs)
for n in jobs[:4]:
    print("==", n, json.dumps(tools[n]["inputSchema"], ensure_ascii=False)[:400])
