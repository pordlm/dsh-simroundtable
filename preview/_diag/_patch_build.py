import re, pathlib
p = pathlib.Path("assets/_raw/gemini_build.py")
s = p.read_text(encoding="utf-8")

# atlas padding step, flat branch
s = s.replace('''        d = run("project_export_model", {"request": {"state": state, "project_id": pid,
                                                     "output_directory": OUT,
                                                     "request_id": "gemini-export"}})''',
'''        d = run("atlas_set_budget", {"request": {"state": state, "project_id": pid,
                                                 "padding": int(pad_value), "page_size": 4096,
                                                 "max_pages": 1, "auto": True,
                                                 "request_id": "gemini-atlas"}})
        state, pid = d["state"], d.get("project_id")
        print(f"atlas: padding={pad_value} page=4096 pages=1 auto")

        d = run("project_export_model", {"request": {"state": state, "project_id": pid,
                                                     "output_directory": out_value,
                                                     "request_id": "gemini-export"}})''')

# composite branch
s = s.replace('''        job = call("project", {"op": "export_model", "request": {"state": state, "output_directory": OUT},''',
'''        job = call("workspace_call", {"operation": "atlas_set_budget",
                                      "request": {"state": state, "padding": int(pad_value),
                                                  "page_size": 4096, "max_pages": 1, "auto": True},
                                      "wait_ms": 30000})
        state = job["result"]["state"]

        job = call("project", {"op": "export_model", "request": {"state": state, "output_directory": out_value},''')
s = s.replace('print(f"exported {len(files)} files -> {OUT}")', 'print(f"exported {len(files)} files -> {out_value}")')
p.write_text(s, encoding="utf-8")
print("patched", s.count("atlas_set_budget"))
