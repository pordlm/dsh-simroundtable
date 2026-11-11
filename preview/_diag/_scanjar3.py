import zipfile, re
jar = r"D:\dsh_simroundtable\tools\psd2live\app\app\psd2live-3.6.7-2f4e52fc169babc7af76c77ea6fff78.jar"
z = zipfile.ZipFile(jar)
for n in ["io/github/psd2live/agent/AgentMcpServiceKt.class",
          "io/github/psd2live/agent/AgentMcpService$start$actualPort$1.class",
          "io/github/psd2live/agent/AgentMcpClientConfigs.class"]:
    b = z.read(n)
    strs = re.findall(rb"[\x20-\x7e]{4,}", b)
    print("==", n)
    for s in strs:
        t = s.decode("latin1")
        if any(k in t.lower() for k in ["port","host","agent","endpoint","token","127.0","bind","mcp","2387"]):
            print("   ", t[:100])
