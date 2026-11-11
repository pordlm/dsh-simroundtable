# seam / black-frame audit -- 2026-11-10 02:46:07

## mimo-prop  (PASS)
- build `assets/build/mimo-prop-v1`  layout `assets/build/mimo-prop-v1.t12-prebackup/mimo-prop.layout.json`  matte `assets/build/mimo-prop-parts/matte.png`
- matte map k=1.3171 dx=350.32 dy=7.22
- plate: yes  fill reference: mimo-prop-v1.bak2/mimo-prop.layout.json
- note: layout picked by bbox residual: mimo-prop-v1.t12-prebackup/mimo-prop.layout.json (12.2 px) over mimo-prop-v1/mimo-prop.layout.json=13.2, mimo-prop-layout/mimo-prop.layout.json=13.2
- note: matte-map residual: left -5 top -6 right +3 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 0 (60) | 0/0/0 | 2/1 | 3/2 | 0.0 (0 long) | 58.06 | PASS |
| stage_pose | 0 (200) | 130/1/0 | 2/1 | n/a | 0.0 (0 long) | 47.87 | PASS |

