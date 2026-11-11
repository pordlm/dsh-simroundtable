from pathlib import Path
files = ["mimo_to_canvas.py","mimo_prop_to_canvas.py","kimi_to_canvas.py","kimi_prop_to_canvas.py",
         "minimax_to_canvas.py","minimax_prop_to_canvas.py","dounai_to_canvas.py","qwen_to_canvas.py"]
for name in files:
    p = Path("assets/_raw") / name
    t = p.read_text(encoding="utf-8")
    if "overlap(canvas, ov, p.stem)" in t:
        print("already", name); continue
    if "canvas = overlap(canvas, ov)" not in t:
        print("MISS", name); continue
    t = t.replace("canvas = overlap(canvas, ov)", "canvas = overlap(canvas, ov, p.stem)")
    p.write_text(t, encoding="utf-8")
    print("patched", name)
