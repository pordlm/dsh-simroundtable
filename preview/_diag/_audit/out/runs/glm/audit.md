# seam / black-frame audit -- 2026-11-09 00:40:46

## glm  (PASS)
- build `assets/build/glm-v1`  layout `assets/build/glm-v1/glm.layout.json`  matte `assets/build/glm-parts/matte.png`
- matte map k=1.3825 dx=308.54 dy=-18.43
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: glm-v1/glm.layout.json (6.7 px) over glm-layout/glm.layout.json=7.8
- note: matte-map residual: left -3 top -3 right -1 bottom -1 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 20 (60) | 17/1/0 | 6/2 | n/a | 66.34 | PASS |
| stage_pose | 75 (200) | 35/4/0 | 2/1 | n/a | 53.07 | PASS |

