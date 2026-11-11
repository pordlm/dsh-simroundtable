import zipfile, re
jar = r"D:\dsh_simroundtable\tools\psd2live\app\app\psd2live-3.6.7-2f4e52fc169babc7af76c77ea6fff78.jar"
z = zipfile.ZipFile(jar)
for n in ["io/github/psd2live/HeadlessMcp.class","io/github/psd2live/MainKt.class"]:
    print("==", n)
    b = z.read(n)
    for s in re.findall(rb"[\x20-\x7e]{3,}", b):
        t = s.decode("latin1")
        if any(k in t.lower() for k in ["port","headless","mcp","host","token","127"]):
            print("   ", t[:110])
