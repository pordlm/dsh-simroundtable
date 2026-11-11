from pathlib import Path
for name in ("mimo_to_canvas.py", "mimo_prop_to_canvas.py"):
    p = Path("assets/_raw") / name
    t = p.read_text(encoding="utf-8")
    if "CANVAS_OVERLAP_MAP" in t:
        print("already", name); continue
    old = "    ov = parse_overlap()\n"
    new = ("    ov = parse_overlap()\n"
           "    # t10: the hair<->shoulder channel opens at stage_pose (AngleX -6).\n"
           "    # The jacket and the hands sit *under* the hair, so growing them from the\n"
           "    # body side closes the channel without moving the hairline; growing the\n"
           "    # hair instead would shave the silhouette.  Override with CANVAS_OVERLAP_MAP.\n"
           "    os.environ.setdefault(\"CANVAS_OVERLAP_MAP\", \"topwear=6,handwear=6\")\n")
    assert old in t, name
    t = t.replace(old, new, 1)
    if "\nimport os\n" not in t:
        t = t.replace("from pathlib import Path\n", "import os\nfrom pathlib import Path\n", 1)
    p.write_text(t, encoding="utf-8")
    print("patched", name)
