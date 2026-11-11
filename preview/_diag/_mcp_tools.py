import json, sys, re
sys.path.insert(0, r"D:\dsh_simroundtable\assets\_raw")
import psd2live_mcp as M
c = M.Client(); c.initialize()
tools = c.rpc("tools/list", {})["tools"]
names = [t["name"] for t in tools]
for kw in ["project","rig","physics","export","workspace","import"]:
    m = [n for n in names if kw in n]
    print(kw, len(m), m[:14])
