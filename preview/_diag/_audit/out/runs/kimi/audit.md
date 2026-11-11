# seam / black-frame audit -- 2026-11-09 07:52:35

## kimi  (FAIL)
- build `assets/build/kimi-v1`  layout `assets/build/kimi-v1/kimi.layout.json`  matte `assets/build/kimi-parts/matte.png`
- matte map k=1.2706 dx=374.09 dy=41.20
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: kimi-v1/kimi.layout.json (7.6 px) over kimi-layout/kimi.layout.json=7.6
- note: matte-map residual: left -2 top -4 right +1 bottom +3 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 35 (60) | 1150/3/59 | 0/0 | n/a | 31.69 | FAIL |
| stage_pose | 71 (200) | 67/1/0 | 0/0 | n/a | 31.40 | PASS |

