# -*- coding: utf-8 -*-
"""Locate the Live2D Cubism Editor install and record it for the team.

    C:\\dev\\python 3.12.0\\python.exe preview\\_diag\\_audit\\cubism_probe.py

Writes preview/_diag/_audit/out/cubism.json.  The rigs in this repo are exported by
PSD2Live, but the user asked for the real editor to be used for hands-on checks
-- this file is the single place that records where it lives, so later tasks do
not have to search again.

External-app integration (once, in the GUI): File > Settings > "External
application integration" so the editor listens on port 22033; then
`assets/_raw/cubism_api.py status|params|values|set` can drive it (token in
assets/_raw/.cubism-token, see HANDOFF §7).
"""
from __future__ import annotations

import glob
import json
import time
import winreg
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)


def from_registry() -> list[dict]:
    out = []
    for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        for sub in (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                    r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"):
            try:
                key = winreg.OpenKey(root, sub)
            except OSError:
                continue
            for i in range(winreg.QueryInfoKey(key)[0]):
                try:
                    name = winreg.EnumKey(key, i)
                    k = winreg.OpenKey(key, name)
                    disp = winreg.QueryValueEx(k, "DisplayName")[0]
                    if "cubism" not in str(disp).lower():
                        continue
                    out.append({"display_name": disp,
                                "version": winreg.QueryValueEx(k, "DisplayVersion")[0]
                                if _has(k, "DisplayVersion") else None,
                                "location": winreg.QueryValueEx(k, "InstallLocation")[0]
                                if _has(k, "InstallLocation") else None})
                except OSError:
                    continue
    return out


def _has(key, name) -> bool:
    try:
        winreg.QueryValueEx(key, name)
        return True
    except OSError:
        return False


def find_editors() -> list[str]:
    cands = glob.glob(r"G:\Live2D Cubism\*\CubismEditor5.exe")
    cands += glob.glob(r"C:\Program Files\Live2D Cubism*\*\CubismEditor5.exe")
    cands += glob.glob(r"D:\Live2D Cubism\*\CubismEditor5.exe")
    return sorted(set(cands))


def main() -> int:
    editors = find_editors()
    info = {
        "checked_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "editors": [{"exe": e,
                     "dir": str(Path(e).parent),
                     "viewer": str(Path(e).parent / "CubismViewer5.exe")
                     if (Path(e).parent / "CubismViewer5.exe").exists() else None,
                     "size": Path(e).stat().st_size} for e in editors],
        "registry": from_registry(),
        "external_api": {"port": 22033,
                         "helper": "assets/_raw/cubism_api.py",
                         "token": "assets/_raw/.cubism-token"},
    }
    (OUT / "cubism.json").write_text(json.dumps(info, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    for e in info["editors"]:
        print(f"editor: {e['exe']}  ({e['size']} B)")
    for r in info["registry"]:
        print(f"registry: {r['display_name']} {r['version']} at {r['location']}")
    if not editors:
        print("WARNING: no CubismEditor5.exe found -- update find_editors()")
    print(f"-> {OUT / 'cubism.json'}")
    return 0 if editors else 1


if __name__ == "__main__":
    raise SystemExit(main())
