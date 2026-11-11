# 新角色「黑框 / 黑缝」审计（第 2 轮 t2）

生成时间：2026-11-09 08:09:44　口径实现：`preview/_diag/_audit/`（README §3 是阈值唯一真源）

取图：`preview/probe.html?scale=1.0` + `renderer.extract.base64(app.stage,'image/png')`，2048×2048 带 alpha，**没有用缩放截图**。姿态：静止 / 待机(stage_pose) / AngleX−6 / +6 / −10 / +10 / AX6+AY4。

> 本文件只做体检，**没有改任何资产**。修改建议见每节末尾。

> **快照**：v2 口径读数生成于 2026-11-09T00:50:07。t5 正在并发重建这批 rig（glm 00:40、qwen 00:43、dounai 00:45），每个 rig 的数字只对它自己那版 build 成立 —— 每节开头的「读数指纹」给出 layout/model3 的 mtime 与字节数，别把不同版本的数字混着比。


## 0. 结论速览

| 角色 | 判定 | 一句话 |
|---|---|---|
| `dounai` | **待确认** | 00:45 重建版：双手已补（neutral truth 165→23），脸缘环缝 66→5 px；stage_pose 的 truth 4967 是静态母图与头部位移的伪差（红环沿发际 2–3 px），不是缺件 |
| `glm` | **待确认** | 00:40 重建版：脸缘环缝 1619→19 px 基本修好（各姿态 ≤34，仅 anglex_m10 211 略超 200）；truth 仍因母图宽 172 px 置 n/a，右侧竖直裁切线需看叠加图确认是否还在 |
| `kimi-prop` | **有黑框** | 与 kimi 同源（发丝空隙 + 脸缘缝），道具变体只是多一层道具 |
| `kimi` | **有黑框** | 发丝交叉/发梢的封闭空隙为主（豁免母图负空间后 162 px/…，原 1410）+ 脸缘细缝 |
| `mimo-prop` | **有黑框** | 与 mimo 同源；neutral「1222 px 最大域」同为母图负空间，豁免后见下表 |
| `mimo` | **有黑框** | 原「1276 px 实心空洞」经母图 alpha 豁免后只剩 97 px（该块是母图发丝↔身体负空间）；剩余为脸缘环缝 |
| `minimax-prop` | **有黑框** | 与 minimax 同源，豁免后见下表 |
| `minimax` | **有黑框** | 封闭空洞豁免后 244 px，落在发丝-皮肤交界与衣领边；舞台暗像素 0；窗框不实心，open 不作判据 |
| `qwen` | **干净** | 00:43 重建版：封闭洞 1078→0 px，neutral/stage_pose 都干净；其余姿态见下方 v1 行（旧 build） |

## dounai

- 读数指纹：`dounai.layout.json` @2026-11-09T00:45:07 (4132 B)；`dounai.layout.model3.json` @2026-11-09T00:45:12 (1112 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/dounai-v1`　layout `assets/build/dounai-v1/dounai.layout.json`　matte `assets/build/dounai-parts/matte.png`
- 脸窗 (725,391)–(1393,1041)（2048 画布）
　head_base（当前 layout `assets\build\dounai-v1\dounai.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: dounai-v1/dounai.layout.json (8.9 px) over dounai-layout/dounai.layout.json=8.9；matte-map residual: left -4 top -3 right +5 bottom +2 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 1 / 5 px / 5（原 13） | 23 | 0 / 0 | n/a² | 15.33 | (620,1361)–(746,1557) | pass |
| stage_pose² | 4 / 26 px / 9（原 75） | 4967 | 0 / 0 | n/a² | 16.15 | (1120,732)–(1439,961) | FAIL |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`dounai_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 5 px @ (956,991)–(958,992)

**修法**：补双手部件（或把 matte 的双手区域从 alpha 真值里去掉）；脸缘按下面统一做法。

## glm

- 读数指纹：`glm.layout.json` @2026-11-09T00:40:14 (5242 B)；`glm.layout.model3.json` @2026-11-09T00:40:37 (1076 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/glm-v1`　layout `assets/build/glm-v1/glm.layout.json`　matte `assets/build/glm-parts/matte.png`
- 脸窗 (788,387)–(1295,845)（2048 画布）
　head_base（当前 layout `assets\build\glm-v1\glm.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: glm-v1/glm.layout.json (6.7 px) over glm-layout/glm.layout.json=7.8；matte-map residual: left -3 top -3 right -1 bottom -1 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 1 / 19 px / 19（原 17） | 22 | 6 / 2 | n/a² | 93.65 | (931,506)–(944,557) | pass |
| stage_pose² | 4 / 34 px / 16（原 35） | 76 | 2 / 1 | n/a² | 72.42 | (929,388)–(958,567) | pass |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`glm_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 17 px @ (842,731)–(849,734)

**修法**：① 脸部件 1–2 px 形态学外扩/闭运算后把 α≥24 硬化为 255（同 README_t7 的做法）；② 右侧竖直裁切线来自部件被矩形裁切，需把被裁的部件补回或让相邻部件覆盖过裁切线。

## kimi-prop

- 读数指纹：`kimi-prop.layout.json` @2026-11-08T13:18:04 (5255 B)；`kimi-prop.layout.model3.json` @2026-11-08T13:18:10 (1148 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/kimi-prop-v1`　layout `assets/build/kimi-prop-v1/kimi-prop.layout.json`　matte `assets/build/kimi-prop-parts/matte.png`
- 脸窗 (727,387)–(1254,855)（2048 画布）
　head_base（当前 layout `assets\build\kimi-prop-layout\kimi-prop.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: kimi-prop-v1/kimi-prop.layout.json (7.6 px) over kimi-prop-layout/kimi-prop.layout.json=7.6；matte-map residual: left -2 top -4 right +1 bottom +3 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 4 / 151 px / 86（原 1121） | 85 | 0 / 0 | n/a² | 74.62 | (726,703)–(745,757) | FAIL |
| stage_pose² | 3 / 77 px / 54（原 42） | 103 | 0 / 0 | n/a² | 84.51 | — | pass |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`kimi-prop_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 69 px @ (716,704)–(744,777)

**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；发丝交叉处的空隙用同法在对应部件上补 1–2 px。

## kimi

- 读数指纹：`kimi.layout.json` @2026-11-08T03:50:34 (5027 B)；`kimi.layout.model3.json` @2026-11-08T03:50:36 (1088 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/kimi-v1`　layout `assets/build/kimi-v1/kimi.layout.json`　matte `assets/build/kimi-parts/matte.png`
- 脸窗 (727,387)–(1254,855)（2048 画布）
　head_base（当前 layout `assets\build\kimi-layout\kimi.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: kimi-v1/kimi.layout.json (7.6 px) over kimi-layout/kimi.layout.json=7.6；matte-map residual: left -2 top -4 right +1 bottom +3 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 5 / 162 px / 87（原 1150） | 111 | 0 / 0 | n/a² | 74.62 | (726,703)–(745,757) | FAIL |
| stage_pose² | 4 / 120 px / 79（原 67） | 145 | 0 / 0 | n/a² | 86.42 | (728,684)–(734,712) | pass |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`kimi_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 69 px @ (716,704)–(744,777)

**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；发丝交叉处的空隙用同法在对应部件上补 1–2 px。

## mimo-prop

- 读数指纹：`mimo-prop.layout.json` @2026-11-08T13:22:05 (5468 B)；`mimo-prop.layout.model3.json` @2026-11-08T13:22:10 (1148 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/mimo-prop-v1`　layout `assets/build/mimo-prop-v1/mimo-prop.layout.json`　matte `assets/build/mimo-prop-parts/matte.png`
- 脸窗 (755,467)–(1282,775)（2048 画布）
　head_base（当前 layout `assets\build\mimo-prop-layout\mimo-prop.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: mimo-prop-v1/mimo-prop.layout.json (10.7 px) over mimo-prop-layout/mimo-prop.layout.json=10.7；matte-map residual: left -4 top -5 right +4 bottom +3 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 1 / 12 px / 12（原 1884） | 4 | 2 / 1 | n/a² | 84.74 | (1236,723)–(1278,775) | pass |
| stage_pose² | 3 / 768 px / 595（原 2143） | 667 | 1 / 1 | n/a² | 90.75 | (1224,713)–(1274,775) | FAIL |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`mimo-prop_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；发丝交叉处的空隙用同法在对应部件上补 1–2 px。

## mimo

- 读数指纹：`mimo.layout.json` @2026-11-08T03:49:52 (5238 B)；`mimo.layout.model3.json` @2026-11-08T03:49:54 (1088 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/mimo-v1`　layout `assets/build/mimo-v1/mimo.layout.json`　matte `assets/build/mimo-parts/matte.png`
- 脸窗 (755,467)–(1282,775)（2048 画布）
　head_base（当前 layout `assets\build\mimo-layout\mimo.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: mimo-v1/mimo.layout.json (10.7 px) over mimo-layout/mimo.layout.json=10.7；matte-map residual: left -4 top -5 right +5 bottom +3 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 7 / 97 px / 23（原 2137） | 98 | 2 / 1 | n/a² | 84.50 | (771,723)–(818,775) | FAIL |
| stage_pose² | 10 / 1146 px / 548（原 2558） | 1038 | 1 / 1 | n/a² | 94.02 | (760,710)–(810,775) | FAIL |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`mimo_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 4 px @ (1279,745)–(1279,748)

**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；发丝交叉处的空隙用同法在对应部件上补 1–2 px。

## minimax-prop

- 读数指纹：`minimax-prop.layout.json` @2026-11-08T13:18:55 (5498 B)；`minimax-prop.layout.model3.json` @2026-11-08T13:18:57 (1184 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/minimax-prop-v1`　layout `assets/build/minimax-prop-v1/minimax-prop.layout.json`　matte `assets/build/minimax-prop-parts/matte.png`
- 脸窗 (773,437)–(1342,822)（2048 画布）
　head_base（当前 layout `assets\build\minimax-prop-layout\minimax-prop.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: minimax-prop-v1/minimax-prop.layout.json (5.4 px) over minimax-prop-layout/minimax-prop.layout.json=5.4；matte-map residual: left +0 top -4 right +1 bottom +4 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 6 / 232 px / 88（原 94） | 256 | 0 / 0 | n/a² | 28.78 | (1216,805)–(1232,820) | FAIL |
| stage_pose² | 8 / 495 px / 231（原 190） | 1350 | 0 / 0 | n/a² | 50.65 | (1223,783)–(1288,847) | FAIL |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`minimax-prop_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 5 px @ (776,722)–(777,725)

**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；发丝交叉处的空隙用同法在对应部件上补 1–2 px。

## minimax

- 读数指纹：`minimax.layout.json` @2026-11-08T03:54:52 (5270 B)；`minimax.layout.model3.json` @2026-11-08T03:54:54 (1124 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/minimax-v1`　layout `assets/build/minimax-v1/minimax.layout.json`　matte `assets/build/minimax-parts/matte.png`
- 脸窗 (773,437)–(1342,822)（2048 画布）
　head_base（当前 layout `assets\build\minimax-layout\minimax.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: minimax-v1/minimax.layout.json (5.4 px) over minimax-layout/minimax.layout.json=5.4；matte-map residual: left +0 top -4 right +1 bottom +4 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 8 / 244 px / 89（原 98） | 266 | 0 / 0 | n/a² | 16.94 | (1216,805)–(1232,820) | FAIL |
| stage_pose² | 10 / 542 px / 263（原 240） | 1411 | 0 / 0 | n/a² | 52.61 | (1203,802)–(1225,822) | FAIL |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`minimax_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

neutral 最大的几个封闭域（2048 坐标）：
- 5 px @ (776,722)–(777,725)

**修法**：脸部件 1–2 px 闭运算 + α≥24 硬化为 255；发丝交叉处的空隙用同法在对应部件上补 1–2 px。

## qwen

- 读数指纹：`qwen.layout.json` @2026-11-09T00:43:36 (5030 B)；`qwen.layout.model3.json` @2026-11-09T00:43:57 (1088 B)　（口径 v2 生成于 2026-11-09T00:50:07）
- build `assets/build/qwen-v1`　layout `assets/build/qwen-v1/qwen.layout.json`　matte `assets/build/qwen-parts/matte.png`
- 脸窗 (801,413)–(1293,806)（2048 画布）
　head_base（当前 layout `assets\build\qwen-v1\qwen.layout.json`）：有，图像存在
- 备注：layout picked by bbox residual: qwen-v1/qwen.layout.json (5.8 px) over qwen-layout/qwen.layout.json=5.8；matte-map residual: left -1 top -4 right +2 bottom +1 px

| 姿态 | 封闭洞 数/面积/最大域 | truth px | 舞台暗像素 数/最大域 | 竖边 ΔL* | 直步代理 max | 可疑部位 (2048) | 判定 |
|---|---|---|---|---|---|---|---|
| neutral² | 0 / 0 px / 0（原 0） | 0 | 0 / 0 | n/a² | 75.43 | (1083,765)–(1104,775) | pass |
| stage_pose² | 0 / 0 px / 0（原 0） | 0 | 0 / 0 | n/a² | 76.49 | (1195,717)–(1225,804) | pass |

¹ 竖边 ΔL* 的实现是「新旧 head_base 静态板对比」：`pale_edge` 里 L_in 取 new_plate、L_out 取 ref_plate，量的是**新填色相对旧板**的落差。按当前 layout 判定：9 个 rig 里 **8 个有 head_base**（只有 qwen 没有），但**都没有修复前版本可对比**，所以判据不适用（能力边界，不是通过）；我还试了两种自足替代（板内/渲染 ±3 与 6v6 色度直步），在 gemini 锚点上（真值 8.1）都返回 0，复现不出缺陷，因此不升为判据。　本 rig 备注：有 head base，但无修复前参考板（pale_edge 需 new_plate vs ref_plate），新 rig 无从对比；自足替代探测在 gemini 锚点上复现不出 8.1，故不作判据
² 母图 alpha 豁免（第 2 轮口径 v2）：`alpha<128/255`（= 母图本来就透明的发丝↔身体负空间）的像素不计入「实心洞」，整个域若没有 ≥4 px 落在母图不透明处则整块剔除；括注「原 N px」是未豁免的旧值。只有 neutral / stage_pose 两行按 v2 重算，其余姿态保留 v1 值（未豁免，偏保守）。
**6× 放大**：`qwen_zoom6x.png` —— 第一行 = neutral 最大封闭域，第二行 = 最靠近脸缘的封闭域；每行左=1:1 渲染裁切、右=叠加图（黄=封闭洞、红=母图缺口、青=黑缝）。

**修法**：① 脸部件 1–2 px 形态学外扩/闭运算后把 α≥24 硬化为 255（同 README_t7 的做法）；② 右侧竖直裁切线来自部件被矩形裁切，需把被裁的部件补回或让相邻部件覆盖过裁切线。

## 附录 A. 注册与可上座状态（核对过源码，不引用旧说法）

| 角色 | `lib/stage.js` | `lib/client.js` `STAGE_CHARACTERS` | 能上座？ |
|---|---|---|---|
| dounai | 有（177 行起 `dounai: {dir:'build/dounai-v1'…}`） | **有**（1993 行，`scale 1.45 / dy 83 / dyCharH 182`） | 能 |

> 任务书里的说法「豆包已注册但还没接进 `STAGE_CHARACTERS`」与当前源码不符：`lib/client.js:1940` 的 `STAGE_CHARACTERS` 里已经有 `dounai`（1993 行）。本轮审计仍然按 probe 单模型做（与上座路径无关），但如果要写「不能上座」请以源码为准。

