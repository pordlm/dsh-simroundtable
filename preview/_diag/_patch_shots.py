from pathlib import Path
p = Path("preview/_diag/_t10_shots.py")
t = p.read_text(encoding="utf-8")
t = t.replace('            live, bak = ROOT / f"assets/build/{key}", ROOT / f"assets/build/{key}.bak2"\n            tmp = ROOT / f"assets/build/{key}.live-tmp"',
              '            live = ROOT / f"assets/build/{key}-v1"\n            bak = Path(str(live) + ".bak2")\n            tmp = Path(str(live) + ".live-tmp")')
t = t.replace('        if int(m.sum()) < 4:\n            continue\n        keep |= m',
              '        if int(m.sum()) < 4:\n            continue\n        keep |= m\n    keep &= _win(win)')
t = t.replace('def hole_mask(', '''def _win(win):
    m = np.zeros((C.CANVAS, C.CANVAS), bool)
    m[win[1]:win[3], win[0]:win[2]] = True
    return m


def hole_mask(''')
p.write_text(t, encoding="utf-8")
print("patched shots")
