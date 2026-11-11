from pathlib import Path

p = Path(r"D:\dsh_simroundtable\.gitignore")
text = p.read_text(encoding="utf-8")

old = "assets/build/\n"
assert old in text, "expected assets/build/ line"

new_block = """# Live2D 构建产物：默认不入库，只白名单要发布的角色（含 .cmo3 可编辑源）
assets/build/*
!assets/build/glm-v1/
!assets/build/qwen-v1/
!assets/build/kimi-v1/
!assets/build/mimo-v1/
!assets/build/minimax-v1/
!assets/build/dounai-v1/
!assets/build/gemini-v1/
!assets/build/grok-v1/
!assets/build/claude-v2/
!assets/build/claude-v3/
!assets/build/gpt-v1/
"""
text = text.replace(old, new_block, 1)

extra = """
# 体积过大的证据与调试产物（已入库的旧文件保留，新增的不再提交）
preview/_evidence/_raw/
preview/_evidence/**/_raw/
preview/_evidence/final2/
preview/_evidence/t3/
preview/_evidence/t4/
preview/_evidence/t5/
preview/_evidence/t6/
preview/_evidence/t7/
preview/_evidence/t1/
preview/_evidence/t11/
preview/_evidence/t12/
preview/_evidence/t10/
preview/_evidence/t8/
preview/_evidence/t9/
preview/_diag/*.png
preview/_diag/**/*.png
preview/_diag/__pycache__/
.agent-teams/
"""
if "preview/_evidence/_raw/" not in text:
    text = text.rstrip("\n") + "\n" + extra

p.write_text(text, encoding="utf-8")
print("patched .gitignore")
print(text)
