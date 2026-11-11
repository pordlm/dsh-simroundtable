p=r"preview\_diag\_t4_face_measure.py"
s=open(p,encoding="utf-8").read()
s=s.replace('default=str(ROOT / "assets/build/gemini-v1.bak.2026-11-07T2242")','default=str(ROOT / "assets/build/gemini-v1.bak")')
open(p,"w",encoding="utf-8").write(s)
print("ref build -> gemini-v1.bak (original, pre-fill)")
