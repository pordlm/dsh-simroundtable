# seam / black-frame audit -- 2026-11-10 01:47:06

## mimo  (PASS)
- build `assets/build/mimo-v1`  layout `assets/build/mimo-v1/mimo.layout.json`  matte `assets/build/mimo-parts/matte.png`
- matte map k=1.3152 dx=351.28 dy=8.68
- plate: yes  fill reference: mimo-v1.bak2/mimo.layout.json
- note: layout picked by bbox residual: mimo-v1/mimo.layout.json (12.2 px) over mimo-layout/mimo.layout.json=13.2
- note: matte-map residual: left -5 top -6 right +4 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 9 (60) | 4/1/0 | 2/1 | 0.0 (0 long) | 51.89 | PASS |
| stage_pose | 17 (200) | 150/4/0 | 0/0 | 0.0 (0 long) | 50.80 | PASS |

## mimo-prop  (PASS)
- build `assets/build/mimo-prop-v1`  layout `assets/build/mimo-prop-v1/mimo-prop.layout.json`  matte `assets/build/mimo-prop-parts/matte.png`
- matte map k=1.3171 dx=350.32 dy=7.22
- plate: yes  fill reference: mimo-prop-v1.bak2/mimo-prop.layout.json
- note: layout picked by bbox residual: mimo-prop-v1/mimo-prop.layout.json (12.2 px) over mimo-prop-layout/mimo-prop.layout.json=13.2
- note: matte-map residual: left -5 top -6 right +3 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 0 (60) | 0/0/0 | 2/1 | 0.0 (0 long) | 58.06 | PASS |
| stage_pose | 0 (200) | 130/1/0 | 2/1 | 0.0 (0 long) | 47.87 | PASS |

