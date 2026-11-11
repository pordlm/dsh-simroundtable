# seam / black-frame audit -- 2026-11-11 01:50:31

## dounai  (PASS)
- build `assets/build/dounai-v1`  layout `assets/build/dounai-v1/dounai.layout.json`  matte `assets/build/dounai-parts/matte.png`
- matte map k=1.2839 dx=367.28 dy=41.80
- plate: yes  fill reference: dounai-v1.bak3/dounai.layout.json
- note: layout picked by bbox residual: dounai-v1/dounai.layout.json (8.9 px) over dounai-layout/dounai.layout.json=8.9
- note: matte-map residual: left -4 top -3 right +5 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 24 (60) | 5/1/32122 | 0/0 | 6/6 | 0.0 (0 long) | 5.48 | PASS |
| stage_pose | 90 (200) | 28/4/35107 | 0/0 | n/a | 0.0 (0 long) | 5.63 | PASS |

