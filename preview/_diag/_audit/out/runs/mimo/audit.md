# seam / black-frame audit -- 2026-11-10 02:45:45

## mimo  (PASS)
- build `assets/build/mimo-v1`  layout `assets/build/mimo-v1.t12-prebackup/mimo.layout.json`  matte `assets/build/mimo-parts/matte.png`
- matte map k=1.3152 dx=351.28 dy=8.68
- plate: yes  fill reference: mimo-v1.bak2/mimo.layout.json
- note: layout picked by bbox residual: mimo-v1.t12-prebackup/mimo.layout.json (12.2 px) over mimo-v1/mimo.layout.json=13.2, mimo-layout/mimo.layout.json=13.2
- note: matte-map residual: left -5 top -6 right +4 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 9 (60) | 4/1/0 | 2/1 | 9/3 | 0.0 (0 long) | 56.37 | PASS |
| stage_pose | 17 (200) | 150/4/0 | 0/0 | n/a | 0.0 (0 long) | 50.80 | PASS |

