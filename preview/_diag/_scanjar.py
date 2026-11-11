import glob, re
files = glob.glob(r"D:\dsh_simroundtable\tools\psd2live\app\app\*.jar")
print("jars:", len(files))
pat = re.compile(rb"(2387\d|agent[._-]?port|PSD2LIVE_[A-Z_]+|mcp[._-]?port)", re.I)
for f in files:
    data = open(f,"rb").read()
    hits = set(m.group(0) for m in pat.finditer(data))
    if hits:
        print(f.split("\\")[-1], sorted(h.decode("latin1") for h in hits)[:10])
