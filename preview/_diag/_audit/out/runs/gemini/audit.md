# seam / black-frame audit -- 2026-11-10 02:38:10

## gemini  (PASS)
- build `assets/build/gemini-v1`  layout `assets/build/gemini-v1/gemini.layout.json`  matte `assets/build/gemini-parts/matte.png`
- matte map k=1.2601 dx=378.82 dy=68.20
- plate: yes  fill reference: gemini-v1.bak/gemini.layout.json
- note: layout picked by bbox residual: gemini-v1/gemini.layout.json (3.6 px) over gemini-layout/gemini.layout.json=3.6, gemini-v1.t11-backup/gemini.layout.json=3.6
- note: matte-map residual: left +3 top -1 right -1 bottom +0 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 56 (60) | 39/5/0 | 0/0 | 4/1 | 0.07 (2 long) | 27.22 | PASS |
| stage_pose | 136 (200) | 110/5/0 | 0/0 | n/a | 0.07 (2 long) | 16.70 | PASS |
| anglex_m6 | 83 (200) | 57/6/0 | 0/0 | n/a | 0.07 (2 long) | 18.41 | PASS |
| anglex_p6 | 84 (200) | 66/5/0 | 0/0 | n/a | 0.07 (2 long) | 28.93 | PASS |
| anglex_m10 | 187 (600) | 177/6/0 | 0/0 | n/a | 0.07 (2 long) | 19.04 | PASS |
| anglex_p10 | 186 (600) | 170/4/0 | 0/0 | n/a | 0.07 (2 long) | 27.59 | PASS |
| ax6ay4 | 94 (200) | 79/5/0 | 0/0 | n/a | 0.07 (2 long) | 19.14 | PASS |

