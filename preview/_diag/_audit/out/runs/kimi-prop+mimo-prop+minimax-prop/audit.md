# seam / black-frame audit -- 2026-11-10 00:52:07

## kimi-prop  (PASS)
- build `assets/build/kimi-prop-v1`  layout `assets/build/kimi-prop-v1/kimi-prop.layout.json`  matte `assets/build/kimi-prop-parts/matte.png`
- matte map k=1.2706 dx=374.09 dy=41.20
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: kimi-prop-v1/kimi-prop.layout.json (7.6 px) over kimi-prop-layout/kimi-prop.layout.json=7.6
- note: matte-map residual: left -2 top -4 right +1 bottom +3 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 16 (60) | 69/1/59 | 0/0 | n/a | 31.75 | PASS |
| stage_pose | 2 (200) | 42/1/0 | 0/0 | n/a | 18.16 | PASS |

## mimo-prop  (FAIL)
- build `assets/build/mimo-prop-v1`  layout `assets/build/mimo-prop-v1/mimo-prop.layout.json`  matte `assets/build/mimo-prop-parts/matte.png`
- matte map k=1.3171 dx=350.32 dy=7.22
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: mimo-prop-v1/mimo-prop.layout.json (10.7 px) over mimo-prop-layout/mimo-prop.layout.json=10.7
- note: matte-map residual: left -4 top -5 right +4 bottom +3 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 0 (60) | 0/0/0 | 2/1 | n/a | 57.85 | PASS |
| stage_pose | 1 (200) | 370/9/0 | 1/1 | n/a | 55.95 | FAIL |

## minimax-prop  (PASS)
- build `assets/build/minimax-prop-v1`  layout `assets/build/minimax-prop-v1/minimax-prop.layout.json`  matte `assets/build/minimax-prop-parts/matte.png`
- matte map k=1.2671 dx=383.49 dy=52.78
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: minimax-prop-v1/minimax-prop.layout.json (5.4 px) over minimax-prop-layout/minimax-prop.layout.json=5.4
- note: matte-map residual: left +0 top -4 right +1 bottom +4 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 27 (60) | 5/1/576 | 0/0 | n/a | 13.42 | PASS |
| stage_pose | 19 (200) | 132/3/956 | 0/0 | n/a | 18.56 | PASS |

