from pathlib import Path
ROOT = Path("preview/_diag/_t10_shots.py").resolve().parents[2]
print("ROOT", ROOT)
for k in ("mimo","mimo-prop"):
    live = ROOT / f"assets/build/{k}"
    bak = ROOT / f"assets/build/{k}.bak2"
    print(k, live.exists(), bak.exists(), live, bak)
