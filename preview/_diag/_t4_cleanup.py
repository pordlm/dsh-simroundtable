p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
start=s.find("    # 2026-11-08 (t4): ... but only where the master art actually has skin.")
end=s.find("    a8 = np.clip(a, 0, 255).astype(np.uint8)")
assert start!=-1 and end!=-1 and start<end, (start,end)
s=s[:start]+s[end:]
open(p,"w",encoding="utf-8").write(s)
print("removed dead block, chars now", len(s))
