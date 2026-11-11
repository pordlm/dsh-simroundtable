import zipfile, re
jar = r"D:\dsh_simroundtable\tools\psd2live\app\app\psd2live-3.6.7-2f4e52fc169babc7af76c77ea6fff78.jar"
z = zipfile.ZipFile(jar)
opts=set(); props=set(); envs=set()
for n in z.namelist():
    if not n.endswith(".class"): continue
    b = z.read(n)
    for s in re.findall(rb"[\x20-\x7e]{4,}", b):
        t = s.decode("latin1")
        if re.fullmatch(r"cli\.[a-zA-Z.]*", t): opts.add(t)
        if "getProperty" in t or "getenv" in t: props.add((n.split("/")[-1], t[:80]))
        if re.fullmatch(r"--?[a-z][a-z0-9-]{2,}", t): envs.add(t)
print("CLI i18n keys:", sorted(opts)[:40])
print("flags:", sorted(envs)[:40])
print("sysprop refs:", sorted(props)[:15])
