p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
start=s.find("    # Where the master has content, half the fill comes from it")
end=s.find("    ring = holes & (~inner | (den < 0.02))")
assert start!=-1 and end!=-1 and start<end, (start,end)
new = '''    # 2026-11-08 (t7): do NOT take the fill colour from the master art.  The
    # master is 0.55-0.78x brighter than the finished texture (t3), so even after
    # a gain correction its copy reads as a pale halo along the jaw and the left
    # cheek on the dark stage -- more visible than the black seam it replaced.
    # The fill now keeps the plate's own colours: the blurred neighbourhood here,
    # nearest opaque part colour on the ring outside the head (below), and the
    # relaxation pass that follows.  The master stays an alpha reference only.
'''
s = s[:start] + new + s[end:]
open(p,"w",encoding="utf-8").write(s)
print("patched t7 colour")
