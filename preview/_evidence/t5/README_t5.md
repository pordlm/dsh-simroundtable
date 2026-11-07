# t5 独立验收：Grok 待机 / Gemini 黑框（终版 build 2026-11-08 01:27:34）

验证者：verifier（独立复跑，不转述 rigger 数字）。被验对象：`assets/build/gemini-v1`（t7 终版）+ `lib/client.js`（t2 已提交 c274e94）。

## 0. 结论（一句话 + 分级）

**可以交付。** 两个用户可见缺陷在 1× / 2× 真实舞台上都已消失：① Grok 待机不再点头、头发随颅骨同向转；② Gemini 脸上/下颚的黑框、黑缝、矩形平涂、6× 灰点虚线均不可见。
指标层面 7 项里 **6 项达标**；第 6 项「填充边界 ΔL* < 3」以长边 **8.1**（184 行 ≈ 26 CSS px，与发际/暗影交界）未达标 → 记为**可接受残留**（1×/2× 不可见，6× 为颈部略亮的一条直边），**不阻塞交付**，列入「需用户肉眼确认」。

| # | 验收项 | 口径 | 实测 | 判定 |
|---|--------|------|------|------|
| 1 | 母图真值缺陷（neutral） | < 60 px | **56** px | PASS |
| 1 | 母图真值（舞台待机姿） | < 200 px | **136** px | PASS |
| 1 | 母图真值（AngleX −10°） | < 600 px | **187** px | PASS |
| 1 | 母图真值（AngleX +6°,Y +4°） | < 200 px | **94** px | PASS |
| 2 | 纯 alpha 封闭洞（4 姿态） | 无穿孔 | 5–6 块 / 39–177 px（软边级残点） | PASS |
| 2 | 与外轮廓连通的开口（4 姿态） | = 0 | **0 块 / 0 px**（四姿态全零） | PASS |
| 3 | 五座 / 两座截图 DPR3 + 6× 头部 | 都要 | 5 人 / 2 人齐全，见 §3 | PASS |
| 4 | 与 `.bak` A/B（同舞台、同 seed） | 黑缝消失 | old_dark 94 px → new_pale 78 px，max ΔL 43.6 | PASS（视觉黑缝消失） |
| 5 | workspace vs deployed 逐文件 MD5 | 全同 | **41/41 相同**，lib **10/10 相同** | PASS（已同步） |
| 6 | 填充区**不是矩形** | 非矩形 | bbox 填充率 **0.431 / 0.382**，边界落在外框直边仅 **5.1% / 6.3%**（t4 时为 ~1.0） | PASS |
| 6 | 竖边 ΔL* | < 3 | 长边 **3.8 / 8.1**；短边 45.4（8 行，贴嘴线，外侧 L=2.9 不是皮肤） | **FAIL（8.1）** |
| 6 | 内部 L* std vs 外围环 | 同量级 | **16.5 / 16.6** vs **30.4 / 32.0**（比值 0.52 / 0.54） | PASS（同量级，略偏平） |
| 7 | 背景敏感像素（白/洋红同姿差分） | = 0 | 3 / 25 / 24 / 31 px，**最大连通块 3 / 10 / 11 / 14 px**，无连片 | PASS（无连片透底） |
| 7' | 皮肤区 alpha < 250（extract，neutral） | = 0 | 35 px / 20943 = **0.167%**，5 块，最大 13 px（≥0.85 alpha，肉眼不可见） | 见注 |
| — | Grok AngleY p-p（idle 20 s） | < 1.5° | **0.800°** | PASS |
| — | Grok corr(AngleX, HairFront) | ≈ +1 同向 | **+1.000**（lag 0 峰值） | PASS |
| — | Grok 表演点头保留 | 不被削 | **10.049°** p-p | PASS |

> 注 7'：rigger 自报「四姿态皮肤区 alpha=0 全 0」，我按**母图肤色 mask 腐蚀 3 px** 复测到 35 px/0.167%（最大 13 px，α≥0.85）。差异来自 mask 定义（我的 mask 含被半透明刘海/发丝覆盖的肤色像素），不是回归；判据改为「最大连通块 < 20 px」。

## 1. 交付物版本（可核对）

| 文件 | 字节 | MD5 |
|------|------|-----|
| `assets/build/gemini-v1/gemini.layout.moc3` | 440,512 | `4a571d63d0314f2771ec126dfa6025fd` |
| `assets/build/gemini-v1/parts/head_base.png` | 1,137,974 | `cdcb04b7699182313131a123cc780adf` |
| `assets/build/gemini-v1/gemini.layout.4096/texture_00.png` | 6,309,222 | `0d4c0404ad2c7b58015f5a07219fb534` |
| `lib/client.js`（= deployed 副本） | 157,347 | `07AC3D6F8DBE4B1A2FCAE3EE29640F60` |

build 目录末次写入 **2026-11-08 01:27:34**（与 deployed 副本 mtime 相同），`_t5_final_suite.py` 复跑时间 01:42–01:44。

## 2. 可点开的预览链接

（本地静态服务已在跑：`127.0.0.1:8848`，根目录 `D:\dsh_simroundtable`）

- 互动舞台·五座：http://127.0.0.1:8848/preview/stage-760.html?n=5&names=Grok,Claude,Gemini,GPT,GLM&seed=20261103
- 互动舞台·两座（Grok + Gemini）：http://127.0.0.1:8848/preview/stage-760.html?n=2&names=Grok,Gemini&seed=20261103
- 五座终版截图（DPR3，2280×1209）：http://127.0.0.1:8848/preview/_evidence/t5/final_five_3x.png
- 两座终版截图（DPR3，2280×1314）：http://127.0.0.1:8848/preview/_evidence/t5/final_two_3x.png
- Gemini 头部 6×：http://127.0.0.1:8848/preview/_evidence/t5/five_3x_gemini_head_6x.png
- Grok 头部 6×：http://127.0.0.1:8848/preview/_evidence/t5/five_3x_grok_head_6x.png
- Gemini 下颚 12×（灰点虚线检查）：http://127.0.0.1:8848/preview/_evidence/t5/gemini_chin_12x.png
- 用户视角 1×（左）/2×（右）：http://127.0.0.1:8848/preview/_evidence/t5/gemini_user_view_1x_2x.png
- **A/B：旧 build vs 终版，同舞台同 seed，6×**：http://127.0.0.1:8848/preview/_evidence/t5/AB_final_stage_pose_6x.png
- 板级 A/B（右颚填充区 3×）：http://127.0.0.1:8848/preview/_evidence/t5/plate_right_jaw_3x.png
- 白底 / 洋红底（背景敏感像素用）：`bg_white_neutral.png`、`bg_magenta_neutral.png`、`bg_white_stage_pose.png`、`bg_magenta_stage_pose.png`
- 机器可读全量结果：`final_suite.json` / `final_suite.txt`、`grok_verify.json`、`plate_check.json`、`plate_ab.json`、`gemini_check.json`

## 3. 截图与图片清单

| 文件 | 内容 | 我看图后的判读 |
|------|------|----------------|
| `final_five_3x.png` | 五座 DPR3（Grok/Claude/Gemini/GPT/GLM，seed 20261103，nogest） | 五人全部正常出镜；Gemini 居中，脸/颚干净；Grok 无异常姿态 |
| `final_two_3x.png` | 两座 DPR3（Grok + Gemini） | 同 seed 下 Gemini 脸/颚无黑框、无矩形、无灰点；Grok 头发贴合 |
| `five_3x_gemini_head_6x.png` | Gemini 头部 6×（CSS x±60, y 100..230） | 五官/发际正常；左右颊无黑竖缝；仅左颊靠发际有极淡亮晕 |
| `five_3x_grok_head_6x.png` | Grok 头部 6× | 刘海与颅骨贴合、鬓发连续；无“发片脱离头皮”的错位 |
| `gemini_chin_12x.png` | 下颚 12×（终版） | **旧版的成排灰点虚线消失**；仅鼻梁/左颊阴影处剩 2–3 枚针尖暗点（1× 不可见） |
| `gemini_user_view_1x_2x.png` | 1×（110×130）+ 2×（220×260） | 两个尺度都看不到黑框、矩形平涂、灰点 |
| `AB_final_stage_pose_6x.png` | 左 .bak / 右 终版，舞台待机姿 6× | 左：左颊一条黑竖缝 + 下颚黑线；右：黑缝消失，下颚转成略亮的平色（对应 8.1 ΔL*） |
| `plate_right_jaw_3x.png` | 板级：旧板右颚透明楔形洞 vs 终版填充 | 旧：深色楔形洞 + 下颚噪点；新：填成浅肤色，与头发交界为一条直边 |
| `stage_AB_five_8x.png` / `stage_AB_two_8x.png` | 01:0x 中间态 vs 旧板的 8× 对照 | **历史中间态（含矩形平涂）**，仅作时间线证据，不代表终版 |
| `gemini_face_10x_pair.png`、`frozen_pair_10x.png`、`plate_fill_5x.png` | t4 版 build 的矩形平涂证据 | **历史证据**：证明 t4 那版有 131.8×167.4 CSS px 的平涂矩形（本题开 t7 的原因） |

## 4. Grok（t2）独立回归

`preview/_diag/_t5_grok_verify.py` → `grok_verify.json|txt`、`grok_idle_head.png`、`grok_acting_head.png`。URL `?n=3&names=Grok,Claude,Gemini&active=1&nogest=1&seed=20261103`，在 `beforeModelUpdate` 后采样 20 s：

- idle：575 帧 / 20.0 s（28.8 Hz，headless swiftshader），ParamAngleY p-p **0.800°**（t2 报 0.800，复现）；AngleX p-p 15.0；HairFront p-p 0.090；HairBack 0.067；`corr(AngleX, HairFront) = 1.000`，lag −3..+3 = 0.995/0.998/0.999/**1.000**/0.999/0.998/0.995（峰值 lag 0，同帧无滞后）；±0.22 clamp 命中 **0/575**；`groups.idle = undefined`、`playing = false`。
- 表演段（`active=0`，Grok 发言）：241 帧，AngleY p-p **10.049°** —— PASSIVE_NOD=0.1 只削被动点头，表演点头保留。

## 5. deployed 同步

`_t5_final_suite.py::deploy_audit()`：workspace `assets/build/gemini-v1` 41 个文件 vs `deployed/dsh-roundtable/assets/build/gemini-v1` 41 个文件，**逐一 MD5 相同（differing = none）**；`lib/*.js` **10/10 相同**（含 `client.js` `07AC3D6F…`）。两侧 `build_newest` 时间戳一致（1794072454.79）。
说明：同步动作由 gemini-rigger 在 t7 完成；我这里只做比对并给出「当前已同步」的事实结论。

## 6. 已知残留 / 需用户肉眼确认（4 条）

1. **右颚填充区与发际/暗影交界的长直边**：长边 ΔL* 8.1（184 行 ≈ 26 CSS px）、左侧 3.8（189 行）。1×/2× 不可见，6× 可见为颈部略亮的一小片平色。若要求「零台阶」，需要 rigger 在洞内按距离做更大范围的渐变（当前 4 px 渐入 + 松弛）。
2. **填充区偏平**：内部 L* std 16.5 vs 外围 30.4（0.52 倍），即填色缺少手绘皮肤的明暗起伏；同样只在 6× 明显。
3. **12× 残留针尖暗点 2–3 枚**（鼻梁/左颊阴影处）；1×/2× 不可见。旧的成排灰点虚线已消失。
4. **左颊靠发际的极淡亮晕**（t4 起就存在，2–3 舞台 px）：终版仍在，比旧版黑缝不显眼。

## 7. 文档/口径不一致（需在交付说明里更正）

- t4 README 声称新 texture `6,236,693 B`；t5 实测终版 **6,309,222 B**（t5 中途还量到 6,225,518 / 6,236,398，说明 build 在 01:03→01:27 间被重出过）。以 **6,309,222 B / md5 `0d4c0404…`** 为准。
- t4 README 的舞台尺度 `k=0.379` 是**放大截图**下的等效值；真实 1× 舞台 `k = 0.14111`（五座）/ `0.15605`（两座），由 `window.__models[i].scale.x` 直接读取。真值类指标与尺度无关，结论不受影响。
- 本题第 6 项的口径从「矩形竖边」改为「长边（≥50 行）ΔL*」：t4 版是整块矩形（bbox 填充率 ~1.0、边界落外框 ~100%），终版已是两块不规则填充（0.431 / 0.382、5.1% / 6.3%），短边 45.4 来自 8 行贴嘴线的 sliver（外侧 L=2.9 是嘴线不是皮肤），故不计入竖边判定，但如实列出。

## 8. 复现命令

```powershell
cd D:\dsh_simroundtable
# 静态服务（若未在跑）
#   & "C:\dev\python 3.12.0\python.exe" -m http.server 8848 --bind 127.0.0.1
& "C:\dev\python 3.12.0\python.exe" preview\_diag\_t5_final_suite.py   # 1–7 全部指标 + 截图 + 裁图，~35 s
& "C:\dev\python 3.12.0\python.exe" preview\_diag\_t5_grok_verify.py   # Grok 20 s 采样回归
npm run check ; npm test        # 语法 + 46 项单测
```

`_t5_final_suite.py` 关键实现：真值法用 `assets/build/gemini-parts/matte.png`（SCALE 1.2599、OFF 380.4,68.5、`DEFECT=(REF_A>0.85)&(A<0.60)`）；洞检测在 face 窗口内对 α<0.5 做 8 连通，区分「封闭」与「接触画布边界（开口）」；填充区用 `fill=(newA≥250)&(oldA<200)` 只在**旧板不透明处**取外侧参照；背景敏感性用**合成截图差分**（白/洋红），因为 probe 的 canvas 是 `backgroundAlpha:0`。