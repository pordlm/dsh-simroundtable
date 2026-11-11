import sys
from pathlib import Path
sys.path.insert(0, str(Path("preview/_diag").resolve()))
from _audit import common as C
rigs = C.discover_rigs()
print(" ".join(sorted(rigs)))
