import glob, os
hits=[]
for pat in ["tools/psd2live/app/*.jar","tools/psd2live/app/**/*.jar"]:
    for f in glob.glob(pat, recursive=True):
        try:
            data=open(f,"rb").read()
        except Exception as e:
            continue
        if b"23871" in data:
            hits.append((f, data.count(b"23871")))
print(hits)
