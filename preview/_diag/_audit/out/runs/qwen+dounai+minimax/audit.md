# seam / black-frame audit -- 2026-11-11 00:25:53

## qwen  (PASS)
- build `assets/build/qwen-v1`  layout `assets/build/qwen-v1/qwen.layout.json`  matte `assets/build/qwen-parts/matte.png`
- matte map k=1.3180 dx=349.17 dy=7.15
- plate: yes  fill reference: qwen-v1.bak3/qwen.layout.json
- note: layout picked by bbox residual: qwen-v1/qwen.layout.json (5.8 px) over qwen-layout/qwen.layout.json=5.8
- note: matte-map residual: left -1 top -4 right +2 bottom +1 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 0 (60) | 0/0/0 | 0/0 | 2/1 | 0.0 (0 long) | 26.31 | PASS |
| stage_pose | 0 (200) | 0/0/0 | 0/0 | n/a | 0.0 (0 long) | 29.30 | PASS |

## dounai  (PASS)
- build `assets/build/dounai-v1`  layout `assets/build/dounai-v1/dounai.layout.json`  matte `assets/build/dounai-parts/matte.png`
- matte map k=1.2839 dx=367.28 dy=41.80
- plate: yes  fill reference: dounai-v1.bak3/dounai.layout.json
- note: layout picked by bbox residual: dounai-v1/dounai.layout.json (8.9 px) over dounai-layout/dounai.layout.json=8.9
- note: matte-map residual: left -4 top -3 right +5 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | bleed px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|---|
| neutral | 23 (60) | 5/1/32122 | 0/0 | 6/6 | 0.0 (0 long) | 5.48 | PASS |
| stage_pose | 91 (200) | 25/4/35072 | 0/0 | n/a | 0.0 (0 long) | 5.71 | PASS |

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

