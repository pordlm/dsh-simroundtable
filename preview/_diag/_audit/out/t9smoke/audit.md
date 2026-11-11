# seam / black-frame audit -- 2026-11-09 08:17:41

## gemini  (FAIL)
- build `assets/build/gemini-v1`  layout `assets/build/gemini-v1/gemini.layout.json`  matte `assets/build/gemini-parts/matte.png`
- matte map k=1.2601 dx=378.82 dy=68.20
- plate: yes  fill reference: gemini-v1.bak/gemini.layout.json
- note: layout picked by bbox residual: gemini-v1/gemini.layout.json (3.6 px) over gemini-layout/gemini.layout.json=3.6, _gemini-based/gemini.layout.json=3.6, _t4-ctl/gemini.layout.json=3.6, _t4-ctl2/gemini.layout.json=3.6, _t4-layout/gemini.layout.json=3.6, _t4-try/gemini.layout.json=3.6, gemini-v1.t4-backup/gemini.layout.json=3.6, gemini-v1.t4-backup2/gemini.layout.json=3.6, _gemini-layout-g2/gemini.layout.json=4.4
- note: matte-map residual: left +3 top -1 right -1 bottom +0 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 71 (60) | 52/5/0 | 0/0 | 0.94 (2 long) | 27.22 | FAIL |
| stage_pose | 145 (200) | 117/5/0 | 0/0 | 0.94 (2 long) | 16.02 | PASS |

