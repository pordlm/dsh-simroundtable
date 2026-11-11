# seam / black-frame audit -- 2026-11-10 23:58:37

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

