from pathlib import Path
t = Path("assets/_raw/glm_build.py").read_text(encoding="utf-8")
t = t.replace("GLM", "Qwen").replace("glm", "qwen")
t = t.replace('"--ink", "130,90,904,1416",', '"--ink", "98,74,926,1467",')
t = t.replace("~172 px off on the right", "~141 px off on the right")
Path("assets/_raw/qwen_build.py").write_text(t, encoding="utf-8")
print("wrote qwen_build.py", len(t))
