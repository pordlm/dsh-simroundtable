# seam / black-frame audit -- 2026-11-10 23:41:00

## minimax  (PASS)
- build `assets/build/minimax-v1`  layout `assets/build/minimax-v1/minimax.layout.json`  matte `assets/build/minimax-parts/matte.png`
- matte map k=1.2671 dx=383.49 dy=52.78
- plate: yes  fill reference: minimax-v1.bak3/minimax.layout.json
- note: layout picked by bbox residual: minimax-v1/minimax.layout.json (5.4 px) over minimax-layout/minimax.layout.json=5.4
- note: matte-map residual: left +0 top -4 right +1 bottom +4 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 27 (60) | 5/1/576 | 0/0 | 0/0 | 0.0 (0 long) | 11.01 | PASS |
| stage_pose | 13 (200) | 193/5/941 | 0/0 | n/a | 0.0 (0 long) | 16.78 | PASS |

