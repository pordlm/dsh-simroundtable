import re, sys
from pathlib import Path

raw = Path("assets/_raw")
files = ["dounai_to_canvas.py","qwen_to_canvas.py","kimi_to_canvas.py","mimo_to_canvas.py",
         "minimax_to_canvas.py","kimi_prop_to_canvas.py","mimo_prop_to_canvas.py","minimax_prop_to_canvas.py"]
for name in files:
    p = raw / name
    t = p.read_text(encoding="utf-8")
    if "canvas_overlap" in t:
        print("already", name); continue
    # 1) import after the PIL import
    t = t.replace("from PIL import Image\n", "from PIL import Image\n\nfrom canvas_overlap import overlap, parse_overlap\n", 1)
    # 2) parse args at the top of main()
    t = t.replace('def main() -> int:\n', 'def main() -> int:\n    ov = parse_overlap()\n', 1)
    # 3) overlap before saving
    t = t.replace('        out = DST / p.name\n', '        canvas = overlap(canvas, ov)\n        out = DST / p.name\n', 1)
    assert "parse_overlap(" in t and "overlap(canvas, ov)" in t and "from canvas_overlap" in t, name
    p.write_text(t, encoding="utf-8")
    print("patched", name)
