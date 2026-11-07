p=r"assets\_raw\make_layout_manifest_gemini.py"
s=open(p,encoding="utf-8").read()
obj="""        out = np.clip(np.maximum(
            np.maximum(fr["left"] + 2 - xx, xx - (fr["left"] + fr["width"] - 2)),
            np.maximum(fr["top"] + 2 - yy, yy - (fr["top"] + fr["height"] - 2))), 0, None)
        taper = np.clip(1.0 - out / 10.0, 0.0, 1.0)"""
new="""        od = np.clip(np.maximum(
            np.maximum(fr["left"] + 2 - xx, xx - (fr["left"] + fr["width"] - 2)),
            np.maximum(fr["top"] + 2 - yy, yy - (fr["top"] + fr["height"] - 2))), 0, None)
        taper = np.clip(1.0 - od / 10.0, 0.0, 1.0)"""
assert obj in s
s=s.replace(obj,new)
open(p,"w",encoding="utf-8").write(s)
print("patched")
