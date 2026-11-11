import json
from pathlib import Path
for k in ("mimo","mimo-prop"):
    d=json.loads(Path(f"preview/_diag/_audit/out/runs/{k}/audit.json").read_text(encoding="utf-8"))
    r=d["rigs"][k]
    print("==",k,"window",r["window"])
    for pose,p in r["poses"].items():
        h=p["holes"]
        print(" ",pose,h)
        for c in (h.get("components") or [])[:6]:
            print("    comp",c)
