import zipfile, re
jar = r"D:\dsh_simroundtable\tools\psd2live\app\app\psd2live-3.6.7-2f4e52fc169babc7af76c77ea6fff78.jar"
z = zipfile.ZipFile(jar)
for n in ["io/github/psd2live/CliOptions.class","io/github/psd2live/CliOptions$Companion.class","io/github/psd2live/HeadlessMcp.class","io/github/psd2live/MainKt.class"]:
    b = z.read(n)
    print("==", n)
    for s in re.findall(rb"[\x20-\x7e]{2,}", b):
        t = s.decode("latin1")
        if len(t) >= 2: print("   ", t[:120])
