import json
from pathlib import Path
d=json.loads(Path("preview/_diag/_audit/out/runs/mimo+mimo-prop/audit.json").read_text(encoding="utf-8"))
for k,r in d["rigs"].items():
    print("==",k,"window",r["window"],"plate",r.get("plate"))
    for pose,p in r["poses"].items():
        h=p["holes"]
        print(" ",pose,{kk:vv for kk,vv in h.items() if not isinstance(vv,list)})
        for c in (h.get("components") or [])[:8]:
            print("    comp",c)
