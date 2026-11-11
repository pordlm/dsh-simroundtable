# seam / black-frame audit -- 2026-11-10 00:35:37

## gemini  (PASS)
- build `assets/build/gemini-v1`  layout `assets/build/gemini-v1/gemini.layout.json`  matte `assets/build/gemini-parts/matte.png`
- matte map k=1.2601 dx=378.82 dy=68.20
- plate: yes  fill reference: gemini-v1.bak/gemini.layout.json
- note: layout picked by bbox residual: gemini-v1/gemini.layout.json (3.6 px) over gemini-layout/gemini.layout.json=3.6
- note: matte-map residual: left +3 top -1 right -1 bottom +0 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 56 (60) | 39/5/0 | 0/0 | 0.94 (2 long) | 27.22 | PASS |
| stage_pose | 136 (200) | 110/5/0 | 0/0 | 0.94 (2 long) | 16.02 | PASS |

## dounai  (PASS)
- build `assets/build/dounai-v1`  layout `assets/build/dounai-v1/dounai.layout.json`  matte `assets/build/dounai-parts/matte.png`
- matte map k=1.2839 dx=367.28 dy=41.80
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: dounai-v1/dounai.layout.json (8.9 px) over dounai-layout/dounai.layout.json=8.9
- note: matte-map residual: left -4 top -3 right +5 bottom +2 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 23 (60) | 5/1/32122 | 0/0 | n/a | 5.48 | PASS |
| stage_pose | 91 (200) | 25/4/35060 | 0/0 | n/a | 5.71 | PASS |

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

## qwen  (PASS)
- build `assets/build/qwen-v1`  layout `assets/build/qwen-v1/qwen.layout.json`  matte `assets/build/qwen-parts/matte.png`
- matte map k=1.3180 dx=349.17 dy=7.15
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: qwen-v1/qwen.layout.json (5.8 px) over qwen-layout/qwen.layout.json=5.8
- note: matte-map residual: left -1 top -4 right +2 bottom +1 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 0 (60) | 0/0/0 | 0/0 | n/a | 26.31 | PASS |
| stage_pose | 0 (200) | 0/0/0 | 0/0 | n/a | 29.26 | PASS |

## kimi  (PASS)
- build `assets/build/kimi-v1`  layout `assets/build/kimi-v1/kimi.layout.json`  matte `assets/build/kimi-parts/matte.png`
- matte map k=1.2706 dx=374.09 dy=41.20
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: kimi-v1/kimi.layout.json (7.6 px) over kimi-layout/kimi.layout.json=7.6
- note: matte-map residual: left -2 top -4 right +1 bottom +3 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 35 (60) | 69/1/59 | 0/0 | n/a | 31.69 | PASS |
| stage_pose | 2 (200) | 67/1/0 | 0/0 | n/a | 31.40 | PASS |

## mimo  (FAIL)
- build `assets/build/mimo-v1`  layout `assets/build/mimo-v1/mimo.layout.json`  matte `assets/build/mimo-parts/matte.png`
- matte map k=1.3152 dx=351.28 dy=8.68
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: mimo-v1/mimo.layout.json (10.7 px) over mimo-layout/mimo.layout.json=10.7
- note: matte-map residual: left -4 top -5 right +5 bottom +3 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 5 (60) | 4/1/0 | 2/1 | n/a | 55.98 | PASS |
| stage_pose | 45 (200) | 523/11/0 | 1/1 | n/a | 53.17 | FAIL |

## minimax  (PASS)
- build `assets/build/minimax-v1`  layout `assets/build/minimax-v1/minimax.layout.json`  matte `assets/build/minimax-parts/matte.png`
- matte map k=1.2671 dx=383.49 dy=52.78
- plate: yes  fill reference: no backup build with a plate
- note: layout picked by bbox residual: minimax-v1/minimax.layout.json (5.4 px) over minimax-layout/minimax.layout.json=5.4
- note: matte-map residual: left +0 top -4 right +1 bottom +4 px

| pose | truth px (limit) | holes px/n/open | seam px/max | fill dL* | advisory step max | verdict |
|---|---|---|---|---|---|---|
| neutral | 27 (60) | 5/1/576 | 0/0 | n/a | 11.01 | PASS |
| stage_pose | 13 (200) | 193/5/941 | 0/0 | n/a | 16.78 | PASS |

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

