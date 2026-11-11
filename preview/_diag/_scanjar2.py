import zipfile, re
jar = r"D:\dsh_simroundtable\tools\psd2live\app\app\psd2live-3.6.7-2f4e52fc169babc7af76c77ea6fff78.jar"
z = zipfile.ZipFile(jar)
pat = re.compile(rb"23871|agent[._-]?port|psd2live[._-]agent|PSD2LIVE_[A-Z_]+", re.I)
hits = []
for n in z.namelist():
    if not n.endswith(".class"): continue
    b = z.read(n)
    for m in set(x.group(0) for x in pat.finditer(b)):
        hits.append((n, m.decode("latin1")))
print(len(hits))
for h in hits[:40]: print(h)
