import json
d=json.load(open("assets/build/dounai-v1/dounai.layout.psd2live.json",encoding="utf-8"))
s=json.dumps(d,ensure_ascii=False)
for key in ("toggle","fade","mouth_open"):
    i=s.find(key)
    print("==",key,i)
    if i>=0: print(s[max(0,i-160):i+420])
