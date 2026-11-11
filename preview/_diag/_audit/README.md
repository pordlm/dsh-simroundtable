# 缝 / 黑框 审计口径（第 2 轮）

一套可复跑的度量脚本，用来判「角色身上有没有缝、有没有黑框」。
口径与 `preview/_evidence/t5/README_t5.md`、`preview/_evidence/t7/README_t7.md` 的历史验收一致，
其中两条（黑缝、平涂边 ΔL*）在本轮被重写成 **更严且可归因** 的形式，见 §3。

```
preview/_diag/_audit/
  common.py       模型发现 / matte 映射 / 抓帧（1:1 带 alpha）/ 颜色工具
  metrics.py      五个指标 + 阈值常量（本文件 §3 的唯一真源）
  run_audit.py    跑矩阵 -> out/audit.json + out/audit.md + 失败帧叠加图
  cubism_probe.py 定位 Live2D Cubism Editor 并写 cubism.json
  out/            运行产物（json / md / 叠加图 / 日志）
```

---

## 1. 怎么跑

前置：仓库根起一个静态服务（`probe.html` 需要同源加载 moc3/texture）：

```powershell
cd D:\dsh_simroundtable
C:\dev\python` 3.12.0\python.exe -m http.server 8848
```

然后：

```powershell
# 单个角色、单个姿态，最快的一次体检（约 20 s）
C:\dev\python` 3.12.0\python.exe preview\_diag\_audit\run_audit.py `
    --chars gemini --poses neutral --bg none

# 全角色 × 7 姿态 + 背景敏感性（这是发布前该跑的那条）
C:\dev\python` 3.12.0\python.exe preview\_diag\_audit\run_audit.py --chars all
```

退出码：任何一条判据 FAIL 则 `1`（加 `--no-gate` 只看数不拦）。产物：

- `out/audit.md` —— 人读的逐角色表（姿态 × 指标 × 判据）
- `out/audit.json` —— 机器读，含每个指标的分量、连通域、阈值块
- `out/<char>_<pose>_defects.png` —— 只在 FAIL 的姿态写：红=母图真值缺口、
  青=黑缝、洋红=长平涂边所在列

> 注意：`--chars all` 才写 `out/audit.md` / `out/audit.json`；`--chars glm,qwen`
> 这类局部跑会落到 `out/runs/<chars>/`，避免覆盖整批表。
> 只想看数不写判定用 `--no-gate`；想按历史阈值 1:1 复现（gemini）用
> `--chars gemini --poses all`。

角色清单来自 `assets/build/**/*.model3.json` 自动发现，`--chars` 用角色前缀
（`gemini glm qwen kimi mimo minimax dounai grok claude`）。姿态见 §4。

---

## 2. 唯一的取图方式：1:1 带 alpha

历史教训（t5 README §7）：早期用放大截图下结论，把 0.14111 的真实舞台比例
当成 0.379，所有像素数都不可比。本套脚本因此：

- 通过 `preview/probe.html?scale=1.0&model=..&p=Param:val,..` 定帧，
  等 `document.title === 'READY'`（页面自己 `model.update(16.6)` + 一次 render，
  关掉 autoUpdate 和眨眼），
- 用 `window.__app.renderer.extract.base64(window.__app.stage, 'image/png')` 取图层，
  **保留 alpha，2048×2048**，并断言输出边长 == `2048*scale`；
- `common.grab(..., scale=1.0)` 在 `scale != 1.0` 时直接抛错，必须显式
  `allow_scaled=True` 才放行 —— 免得又拿缩放图当证据。

舞台比例常数（用于把 1:1 像素折算成观众看到的 CSS px）：
`K_STAGE_5 = 0.14111`（五席布局）、`K_STAGE_2 = 0.15605`（两席布局），
取自 t5 README §7 实测 `window.__models[i].scale.x`。报告里像素同时给
1:1 与 `px * K²`（CSS px²）两个数。

---

## 3. 判据（阈值在 `metrics.py` 顶部，改那里唯一生效）

### 3.1 母图真值缺口 `truth` —— 该画的没画

`defect = (REF_A > 0.85) & (A < 0.60)`，只数脸框 ±30 px 窗口内，单位 2048² 画布像素。
`REF_A` 是把 `<char>-parts/matte.png` 的 alpha 按布局映射到 2048² 的结果。

映射公式（与 `assets/_raw/make_layout_manifest_gemini.py` 同源）：
取 matte alpha>64 的包围盒 `(x0,y0,x1,y1)`，`k = 1836/(y1-y0)`、
`dx = 1024 - k*(x0+x1)/2`、`dy = 106 - k*y0`。每个角色的 `k/dx/dy` 见各次报告的
`matte map` 行；映射后用布局各部件的 alpha 并集包围盒核对，左/上残差 0–3 px。

| 姿态 | 阈值 (px @2048²) | t5 历史实测 |
|---|---|---|
| neutral | < 60 | 56 |
| stage_pose | < 200 | 136 |
| anglex_m6 / anglex_p6 | < 200 | — |
| anglex_m10 / anglex_p10 | < 600 | 187 |
| ax6ay4 | < 200 | 94 |

母图只能当 **alpha 真值**：它的颜色是成品 0.55–0.78 倍，不能拿颜色比对。

**上一道保险**：若映射后的母图包围盒与布局部件并集包围盒在任一边相差
>8 px，说明这份 matte 与 build 不是同一张图、同一比例（glm 右 −172 px、
qwen 右 −141 px），此时 `truth` 直接置 `n/a` 并在报告里写明
`truth disabled: matte/layout bbox mismatch ...`，避免把映射误差报成缺图。
grok/glm/qwen 的 `truth` 数字因此不可用，但 `holes`/`dark` 只依赖渲染，仍然有效。

### 3.2 被围住的非模型像素 `holes` —— 洞

整张 2048² 画布上取 `alpha < 0.5`，8 连通标记；与画布外框相连的连通域算
「open」（角色轮廓外的空气，正常），其余算「enclosed」（模型内部的洞）。
只统计脸框 ±30 px 窗口内的像素，单域 ≥4 px 才计入。

| 项 | 阈值 |
|---|---|
| enclosed 总面积 | < 200 px |
| 单个 enclosed 连通域 | < 120 px |
| open 连通域 | 必须为 0（仅当脸框整圈落在不透明像素上时才判） |

历史锚点：4 姿态 5–6 个连通域 / 39–177 px（柔边残留）判 PASS，open 恒为 0。
单域上限取 120：t5 成品最大域 44 px，取 120 既不误杀历史合格品，又能拦住
「一整块空腔」。open 只在**脸框四条边全是不透明像素**时才判 —— 否则窗口里
本来就有角色外的空气，那个 open 数衡量的是脸框位置，不是轮廓破洞
（结果 JSON 里 `window_solid=false` 表示未判）。

**v2 母图 alpha 豁免**（2026-11-09，见 §8.1 第 6 条）：调用
`holes(rgba, win, ref_a=C.ref_alpha(rig), exempt_below=128/255)` 时，母图本身
透明的像素（`alpha<128/255`）不计入；域内豁免后 <4 px 的整块剔除。
注意 `ref_a` 是 0..1，阈值必须写 `128/255`。旧口径（不传参）仍保留，
报告里同时给「原 N px」以便对比。

### 3.3 黑缝 `dark_seam` —— 缝在深色舞台上显成黑线

历史定义（HANDOFF §6.3）：`alpha > 200 && RGB < 24`，Gemini 11–337 px、
连通域全部 <20 px。**该数是在舞台比例下数的**（2048×0.14111 ≈ 289 px 画布），
在 1:1 下同一个定义会把角色自己的线稿数成 10,225 px —— 两者不可比，所以这里
先按面积平均降采样到 289²、再做 alpha 合成、再判黑：

1. 预乘 alpha 后 BOX 降采样到 289²（直接 resize 会让透明黑渗进边缘，凭空造缝）；
2. 合成到舞台底色 `(18,24,38)`；
3. `dark = (A*255 >= 200) & (max(R,G,B) < 24)`；
4. `skin = (A > 0.90) & (45 < L* < 92)`；
5. **缝** = 左右（或上下）3 px 内两侧都有 skin 的 dark 像素。

第 5 条是本轮加严的地方：它把「填充色和发际之间那条夹在皮肤里的黑线」与
「线稿 / 头发大块 / 下巴投影」区分开，后者只有一侧是皮肤，不计数。

| 项 | 阈值 |
|---|---|
| 缝像素总数（脸框窗口内，舞台比例） | < 20 px |
| 单个缝连通域 | < 10 px |
| 两侧皮肤搜索半径 | 3 px |

同时报 `dark_px_fullres`（1:1 下的原始黑像素数）作参考，不参与判据。

### 3.4 平涂边 ΔL* `edge` —— 填色与发际/原画的直边

这是第 2 轮的 **主目标缺陷**：Gemini 右颚那条 26 CSS px 长、ΔL* 8.1 的直边。
口径就是 t5/t7 的 `pale_edge`（静态比较，不看渲染）：

- `new` = 当前 build 的 `parts/head_base.png` 贴回 2048²；
- `old` = 修复前备份额（`<build>.bak*` / `.prev*`）的同名部件；
- `fill = (new_a >= 250) & (old_a < 200)`，即「新填出来、原来没有」的区域，
  逐连通域要求 ≥300 px，否则当噪声；
- 每个连通域取左右边：左侧 `x <= bx0+2` 的行、右侧 `x >= bx1-2` 的行；
  里面取 6 列（`bx0+1..bx0+6` / `bx1-6..bx1-1`），外面取 6 列
  （`bx0-9..bx0-4` / `bx1+4..bx1+9`），各需 ≥20 个不透明样本；
- `ΔL* = mean(L*_inside) - mean(L*_outside)`，L* 用 sRGB→Y→CIE L*（与 t5 同一实现）；
- 行数 ≥50（≈7 CSS px）算「长边」，只有长边参与判据。

| 项 | 阈值 |
|---|---|
| 任一长边 \|ΔL*\| | < 3.0 |
| 长边判定行数 | ≥ 50 行（≈7 CSS px） |
| 连通域最小面积 | ≥ 300 px |

附带三个「形状不像矩形补丁」的证据（不设硬阈值，供人判断）：
`bbox_fill_ratio`（t5 成品 0.431/0.382，t4 约 1.0）、
`boundary_on_bbox_side`（t5 成品 5.1%/6.3%，t4 约 100%）、
`inner_std_l` vs `ring_std_l`（内部平整度应和外围同一量级，t5 为 16.5/16.6 vs 30.4/32.0）。
另有一条 `flatness` 汇总：内部 L* std / 外圈 10 px 环 L* std < 1.5。

`edge_render`（同一套列比较，但读合成后的画面）作为参考输出，不参与判据 ——
渲染里含抗锯齿、发丝覆盖和受光，数值天然大于静态板。

注意 `edge` 比较的是**静态部件图**，所以同一角色各姿态的数会完全相同；
表里每个姿态都列一次只是为了并排看，判据本身只需成立一次。

### 3.5 背景敏感性 `bg` —— 半透明毛边

同一姿态分别合成到 `#ffffff` 与 `#ff00ff`，两图颜色有变化的皮肤像素
`|Δ| > 8` 即半透明；取最大连通域。

| 项 | 阈值 |
|---|---|
| 最大连通域 | < 20 px |
| 另报 | `extract` 里 `alpha < 250` 的皮肤像素数与占比 |

历史锚点：3–31 px 总量、最大域 3–14 px；`alpha<250` 35 px / 20943 = 0.167%。

---

## 4. 姿态矩阵

`metrics.py` 之上，`common.POSES` 定义 7 个姿态，覆盖「静止 / 待机 / 转头 / 转头+抬头」：

| pose | 参数 |
|---|---|
| `neutral` | 全 0（默认） |
| `stage_pose` | AngleX −6, AngleY −3, BodyAngleX −2.3, HairFront −0.118, Breath 1.0 |
| `anglex_m6` / `anglex_p6` | AngleX ∓6（BodyAngleX 0, HairFront 0, Breath 0.5） |
| `anglex_m10` / `anglex_p10` | AngleX ∓10（同上） |
| `ax6ay4` | AngleX 6, AngleY 4（同上） |

`common.pose_params(pose, supported)` 只下发该 rig 的 `.cdi3.json` 里真实声明的参数
（现网 20 个：AngleX/Y/Z、EyeLOpen/ROpen、EyeBallX/Y/Form、BrowLY/RY、
MouthForm/MouthOpenY、BodyAngleX/Y/Z、BodyLean、Proportion、Breath、HairFront、HairBack），
不认识的参数不会偷偷塞进去。

---

## 5. 已知边界（读结果前先看这段）

- **`edge` 只对带 `head_base` 平涂板的角色成立**。当前只有 `gemini-v1` 有
  `parts/head_base.png`；`kimi/mimo/minimax/dounai` 的布局里声明了 head base
  图层但图片文件缺失；`glm/qwen/grok/claude` 根本没有这一层。这些角色
  `edge` 报 `null`，判据列表里只出现 truth / holes / dark / bg。
- **`dark_seam` 依赖 289² 舞台比例**。若某天舞台布局变成两席（k=0.15605），
  用 `metrics.stage_composite(..., k=K_STAGE_2)`，否则像素数会系统性偏大。
- **`holes` 的 open 判定**用画布外框连通性。角色若被故意裁到画布边缘
  （半身构图），轮廓外的空气会与画布外相连仍是 open，判定不受影响；
  但若角色真的伸出画布，需要改用部件 alpha 并集做 mask。
- 母图映射对 `glm`/`qwen` 的右/下包围盒有 141–172 px 缺口（这两家的部件
  没铺满轮廓），只影响 `truth` 窗口边缘，脸框内的数不受影响；但记住这两家
  的 `make_layout_manifest` 没传 `--ink`，其 head_base 颜色参考用的是
  Gemini 的 matte —— 是潜在色偏来源，属于另一个 bug，不在本套判据内。

---

## 6. Live2D Cubism Editor

用户要求多用 Cubism。本机安装：

| 项 | 值 |
|---|---|
| Editor | `G:\Live2D Cubism\Live2D Cubism 5.3\CubismEditor5.exe`（77,152 B） |
| Viewer | `G:\Live2D Cubism\Live2D Cubism 5.3\CubismViewer5.exe` |
| 版本 | 注册表 `Live2D Cubism 5.3.00`，DisplayVersion `5.3.00` |
| 随附 | `app\`（内置 JRE）、`tools\ffmpeg\ffmpeg.exe` |

`cubism_probe.py` 每次运行会重新扫一遍并写 `out/cubism.json`（含 registry 项）。

外部程序接口：`HANDOFF.md:534` 记录首次需在 Editor 里打开
「外部应用程序集成」一次，之后 `127.0.0.1:22033` 才会监听。
封装脚本 `assets/_raw/cubism_api.py status|params|values|set`，
token 在 `assets/_raw/.cubism-token`。用它可以在 Cubism 里改参数后
回读真实模型行为，与本套 1:1 抓帧互为交叉验证
（Cubism 里看到的 = 编辑器视角；`probe.html` 抓的 = 舞台最终合成，带 alpha）。

---

## 7. 与历史验收的对照

| 指标 | t5/t7 口径 | 本轮 | 关系 |
|---|---|---|---|
| truth | 母图 alpha 映射，4 姿态 | 同一实现，7 姿态 | 同口径 + 姿态更全 |
| holes | alpha<0.5，enclosed/open | 同一实现，脸窗 + 最小 4 px | 同口径 |
| dark | alpha>200 & RGB<24（舞台比例） | 同定义 + 两侧皮肤夹持 | **更严**（去线稿误报） |
| edge | pale_edge 静态板对比，长边 ≥50 行 | 同一实现，阈值 <3.0 不变 | 同口径（已复现 8.1/184 行） |
| bg | 白/洋红合成，最大域 <20 px | 同一实现 | 同口径 |

### 复现证据（gemini-v1，neutral，2026-11-08）

| 项 | 历史 (t5/t7) | 本轮实测 |
|---|---|---|
| truth 四姿态 | 56 / 136 / 187 / 94 | 56 / 136 / 187 / 94 |
| holes（anglex_m10） | 177 px | 177 px |
| 左颚填色边 | ΔL* 3.8，189 行 | ΔL* 3.84，189 行 |
| 右颚填色边 | ΔL* 8.1，184 行 = 26 CSS px | **ΔL* 8.15，184 行 = 26.0 CSS px** |
| 两块的 area bbox | 11334 / 9841 px | 11334 / 9841 px |
| bbox_fill_ratio | 0.431 / 0.382 | 0.431 / 0.382 |
| boundary_on_bbox_side | 5.1% / 6.3% | 0.051 / 0.063 |
| inner vs ring L* std | 16.5/16.6 vs 30.4/32.0 | 完全一致 |

即：第 2 轮要修的「右颚 26 CSS px、ΔL* 8.1 直边」在本套脚本下仍原样存在，
且 `left 3.84` 也已越过 <3 的判据 —— 两条都要修。
## 8. pass 1 实测（t2 的 9 个 rig，2026-11-09 00:01）

命令：`run_audit.py --chars all --bg neutral,stage_pose --no-gate`
（`all` = 除「已验收、本轮不复测」外、且带 layout/face 的 rig；本轮 9 个）

已验收、本轮不复测（表里只列不跑）：gemini、claude、claude-book、
claude-nomouthopen、gpt-half-atlas2048、grok-v1、deepseek-p2l*、whale-girl。

| 角色 | truth neutral | holes neutral | holes stage_pose | seam | 判定 | 主要线索（看 `out/<角色>_neutral_defects.png`） |
|---|---|---|---|---|---|---|
| dounai | **165** (60) | 66 | 290 | 1 | FAIL | 双手整块缺失（红=母图不透明、成品 alpha<0.6），另有发际少量红点 |
| glm | n/a（母图宽 172 px） | **1619** (79 域) | **8481** | 4 | FAIL | 脸部件一圈 1–2 px 透明缝（黄点虚线环）；右侧 x≈1287 一条全高竖直裁切线 |
| qwen | n/a（母图宽 141 px） | **1078** (55 域) | **4585** | 0 | FAIL | 额头/下颌脸缘同样一圈缝；右侧裙摆 x≈1265 呈竖直截断 |
| kimi | 110 (60) | **1419** (7 域，最大 623) → v2 豁免后 **162** (87) | 156 → **120** | 0 | FAIL | 发丝交叉处的封闭空隙 + 脸缘细缝 |
| mimo | 98 | **2585** (7 域，最大 1276) → v2 豁免后 **97** (23) | 3425 → **1146** (548) | 1 | FAIL | 脸缘环缝；原 1276 那块是母图发丝↔身体负空间，不是缺件 |
| minimax | **266** (60) | 389 (9 域) | 693 | 0 | FAIL | 脸缘缝 + 窗框不实心（open 770 不作判据） |

即：9 个 rig 在 pass 1 里没有一个是干净的；**共性缺陷 = 脸部件与头发/头部
之间 1–2 px 的透明缝**（正对深色舞台就是黑色虚线环），与 HANDOFF §6.3 里
Gemini 修掉的那类完全同源。第二个共性 = 右侧一条竖直裁切线（glm/qwen）。

### 8.1 假阳性判别规则（写死在这里，不要为此重跑矩阵）

1. **窗框不实心时 open 不算**：`window_solid=false` 的 rig（kimi、minimax、
   dounai）`open_px` 上千，是脸窗跨到了画布外/衣服外，不是破轮廓。只看
   `enclosed`。
2. **发丝软边**：域面积 <12 px、且 8 邻域里 `0<α<0.6` 像素占多数、域内不含
   任何 `α≥250` 的实心像素 —— 判为细发丝抗锯齿，不算缝。这类域在 kimi 里
   占多数；是否真缝以叠加图上的「成环/成线」为准。
3. **母图几何不符**（`|Δbbox|>8 px`）时 truth 置 n/a：glm/qwen 的母图比成品
   宽 141–172 px（缺肢体部件），truth 数字没有意义，只用 holes/seam。
4. **advisory step max 不是判据**：它是 ±3 px 直步扫描，量到的是线稿/高光
   （gemini 66、glm 67），只作「有没有可疑直边」的提示，判定看 `fill dL*`。
5. **fill dL* 需要「修复前参考板」，不是只需要 head_base**（2026-11-09 更正）：
   `pale_edge` 里 `L_in` 取 new_plate、`L_out` 取 ref_plate，量的是**新填色相对
   旧板**的落差，所以判据的两个输入是「当前板 + 修复前板」。更正：head_base
   并非 Gemini 独有 —— 按**当前 layout**（`assets/build/<name>-layout/<name>.layout.json`）
   判定，dounai / kimi / kimi-prop / mimo / mimo-prop / minimax / minimax-prop
   **都有** `head base` 层（图像存在）；glm / qwen 才真的没有。但这一批都**没有
   修复前版本**，`reference_plate()` 返回 "no backup build with a plate"，于是
   dL* 仍然 n/a —— 原因是缺参考板，不是缺板。
   注意区分：**build 内嵌 manifest**（旧，可能不含 head base）≠ **当前
   `<name>-layout/` 版本**（新）。判定一律以当前 layout 为准。
6. **母图 alpha 豁免（v2，2026-11-09 加入）**：`alpha < 128/255` 的像素是母图
   本身就透明的地方（发丝↔身体负空间），**不计入「实心洞」**；一个域若豁免后
   剩余 <4 px 就整块剔除。mimo 那个 1276 px「最大实心洞」豁免后只剩 23 px，
   证明它是母图负空间不是缺件；kimi 的 623 px 同理降到 87。用法：
   `metrics.holes(rgba, win, ref_a=C.ref_alpha(rig), exempt_below=128/255)`，
   报告里同时给「原 N px」。**注意 ref alpha 是 0..1**，阈值要写 `128/255`
   而不是 `128`（写成 128 会把全部像素豁免掉，得到假的 0）。

### 8.2 结论给下一阶段

- 修的顺序：先统一修「脸部件 1–2 px 外扩/硬化」（对所有 6 角色一次性起效，
  做法同 README_t7：形态学闭运算 1–2 px + α≥24 硬化到 255），再单独修
  dounai 的双手缺失、glm/qwen 的右侧竖直裁切线。
- 复测只需：`run_audit.py --chars glm,qwen,kimi,mimo,minimax,dounai --poses neutral,stage_pose`，
  改完后在叠加图上确认黄点环消失、`holes neutral` 回到 <200（**按 v2 口径**，
  即 `exempt_below=128/255`；kimi/mimo 的旧值含母图负空间，不能直接和修后比）。
- 修的顺序（2026-11-09 更正）：① 统一修「脸部件 1–2 px 外扩/硬化」（6 角色
  一次起效）；② dounai 补双手（manifest 只写 `handwear`，cut 输出是
  `handwear-l/r` —— 缺的是引用，不是切图）；③ glm/qwen 右侧竖直裁切线。
  mimo 的「1276 px 大洞」不再作为修复项（母图负空间）。

## 9. t9 口径收口（2026-11-10，已成为 `run_audit.py` 的默认行为）

这两条不再是可选开关，`run_audit.py` 直接按它们跑：

1. **封闭洞默认带母图豁免**：`M.holes(rgba, win, ref_a=ref, exempt_below=128)`。
   `metrics.holes` 里做了单位归一化（`>1` 视为 0..255，再除以 255），所以
   `exempt_below=128` 与 `128/255` 等价；`ref_a` 仍是 0..1。
   JSON 里同时给 `enclosed_px`（豁免后）和 `enclosed_px_raw`（同一 build、
   不豁免，用于和历史数字对照）。
   ⚠️ 历史坑：`preview/_diag/_holes_exempt.py` 早先打印的「kimi 0 / mimo 0」
   是单位 bug（阈值 128 落在 0..1 的 alpha 上，全部像素被豁免），已由上述
   归一化修好；真实值是 kimi 69 px、mimo 4 px（豁免后）。
2. **非中性姿态用对齐残差**：`M.aligned_truth(rgba, ref, win, max_shift=16)`
   先搜最优刚性平移（±16 px，粗 4 px 再 1 px），再算
   `(ref > 0.85) & (a < 0.60)`，阈值 = `max(TRUTH_LIMIT[pose], round(1.10 × 中性帧))`。
   JSON 里 `truth.raw_in_window` 保留未对齐数、`truth.shift` 记录最优平移、
   `truth.limit` 是这一帧实际用的上限。

出表：`python preview/_diag/_audit/final_table.py` →
`preview/_evidence/round2/README_final_table.md`（rig / neutral 洞（豁免后）/
raw 对照 / stage_pose 残差 / ΔL* / 结论）。

另外 `_layout_candidates` 现在会跳过 `_` 开头的实验目录和 `.t4-*` 备份，
避免 gemini-rigger 的 `_t4-*/gemini.layout.json` 被当成当前 layout。

