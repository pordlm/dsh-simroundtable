p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
i=s.find("    # 2026-11-08 (t7): only a narrow band right next to the skin takes the face")
j=s.find("    # Relax the filled pixels toward their neighbourhood")
assert i!=-1 and j!=-1 and i<j
blk=s[i:j]
s=s[:i]+s[j:]
# tighten to 2 px and move after the relaxation
blk=blk.replace("over 4 px","over 2 px").replace("(4.0 - d_face) / 4.0","(2.0 - d_face) / 2.0")
k=s.find("    a[~solid, 3] = 0")
assert k!=-1
s=s[:k]+blk+s[k:]
open(p,"w",encoding="utf-8").write(s)
print("moved band blend after relaxation, radius 2px")
