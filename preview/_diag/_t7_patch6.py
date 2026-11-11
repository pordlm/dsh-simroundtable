p=r"preview\_diag\_t4_face_measure.py"
s=open(p,encoding="utf-8").read()
s=s.replace("(df[ys, xs] <= 5.0)","(df[ys, xs] <= 2.0)")
open(p,"w",encoding="utf-8").write(s)
print("metric band <=2px")
