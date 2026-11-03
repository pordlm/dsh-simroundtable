# Live2D 角色制作手册（playbook）

这份手册是「从一张设定图到舞台上会动、会眨眼、会说话、会抱书的角色」的完整流程，
按本项目（鲸鱼娘 / GPT / 小 Claude 三个 rig）实际跑通的路径写。所有路径、命令、数值都是
本机实测，不写「理论上可以」。踩过的坑单独放在 `docs/live2d-pitfalls.md`。

---

## 0. 产出物长什么样

一个能上舞台的角色 = 一个**目录**，里面三件套：

| 文件 | 作用 |
| --- | --- |
| `*.moc3` | 模型本体（网格、变形器、参数、物理引用都在里面，二进制、不可手改） |
| `*.model3.json` | 入口描述：`FileReferences` 指向 moc3 / 纹理 / 物理 / 动作 / 表情 |
| `texture_NN.png` | 图集（1–6 张，4096² 或 2048²，RGBA） |

外加可选 `*.physics3.json`、`*.motion3.json`、`*.exp3.json`、`*.cdi3.json`。

本项目的三个 rig：

| 角色 | 目录 | 画布 | 图集 | moc3 |
| --- | --- | --- | --- | --- |
| 鲸鱼娘 | `assets/models/whale-girl/` | — | 2 页 | — |
| GPT | `assets/build/gpt-half-atlas2048/` | 1024 | 6 页 2048² | 285 KB |
| 小 Claude | `assets/build/claude-v3/model/` | 2048 | 1 页 4096² | 344 KB |
| 小 Claude（抱书） | `assets/build/claude-book-model/` | 2048 | 1 页 4096² | — |

---

## 1. 环境

```powershell
# Python：必须是这个解释器，装了 PIL / numpy / scipy / opencv / psd_tools
C:\dev\python 3.12.0\python.exe

# PSD2Live（CLI 与 GUI 是同一个 exe，参数不同）
D:\dsh_simroundtable\tools\psd2live\app\PSD2Live.exe

# Cubism Editor 5.3（目前只用于人工检查，外部 API 未接通）
G:\Live2D Cubism\Live2D Cubism 5.3\
```

> `pwsh` 工具在本机常因沙箱 ACL 失败（`SetNamedSecurityInfoW ... Win32 5`），
> 一律改用 `mcp__windows__PowerShell`。

---

## 2. 素材从哪来

### 2.1 设定图规范（让生成模型能直接用）

- **1024×1536、半身、纯平涂背景 `#00FF00`**（透明 PNG 与 2048² 都不可靠：模型侧给不出 alpha，
  放大后绿边也更粗）。
- 人物墨迹（ink）bbox 要留统一边距，后续所有坐标都靠它对齐。
- 要局部改一处（例如「把眼睛改成睁开」）时，让模型**只改那一块**，其余像素不动，
  ink bbox 漂移控制在 2 px 内 —— 否则整条管线要为新的构图重算映射。

### 2.2 中转站（网页版出图）

`relay-kit/tools/` 下有一套脚本，直连网页版模型：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\relay.ps1 up
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\relay.ps1 ask --new `
  --file assets\incoming\claude-parts\P0-master.png `
  --message "只把双眼改成完全睁开，其余像素保持不变" --timeout 120
node tools\relay-grab-imagegen.mjs --chat <会话地址> --list
node tools\relay-grab-imagegen.mjs --chat <会话地址> --out assets\incoming\claude-parts\eyes
```

要点：出图 5–9 分钟；`relay.config.json` 必须纯 ASCII；`REPLY (0 chars)` / `正在处理图片…`
都是误报，按 `--list` 里是否出现新 `<img src="/backend-api/estuary/content?id=file_…">` 为准。

---

## 3. 管线 A：单张母图切件（小 Claude 走这条）

适合「只有一张完整设定图」，靠几何与颜色规则把 24 个部件切出来。

```
P0-master.png ──cut_claude.py──> assets/build/claude-parts/src/*.png   (1024² 坐标)
                             ──claude_to_canvas.py──> .../parts/*.png  (2048² 画布)
                             ──claude_v3_build.py --import──> assets/build/claude-v3/model/
```

### 3.1 部件清单与 tag

PSD2Live 靠**图层名**认部件（`docs/en/spec/PSD_LAYER_SPEC.md`），名称写错就等于没这个件：

```
back hair / front hair / headwear / face / face detail / irides / eyebrow / eyewhite /
eyelash / eye close / eyewear / ears / earwear / nose / mouth / mouth open / mouth close /
tooth-t / tooth-b / tongue / neck / neckwear / topwear / handwear / bottomwear / legwear /
footwear / tail / wings / objects
```

- **没有 `horn`**：角、发饰、兽耳都归 `headwear` / `earwear`。
- 左右后缀 `-l` / `-r`，语义是**角色自己的左右**（＝画面右边是 `-l`）。
- PSD2Live **不会**自动拆左右眼（实测 `side: "NONE"`）→ 自己切，且必须**按连通块**拆，
  硬切中轴会把一只眼劈成两半。

### 3.2 画布映射（2048 画布）

```python
INK = (129, 42, 894, 1494)          # 母图里人物的墨迹 bbox
TARGET_H = 1836                     # 希望在 2048 画布上占多高
scale = TARGET_H / (INK[3] - INK[1])
dx = 1024 - scale * (INK[0] + INK[2]) / 2
dy = 52.9                           # 让头顶离画布顶留一点余量
```

所有件共用**同一个** transform，逐件各自 trim 会让五官错位。

### 3.3 三个「必须做」的步骤

1. **`face` 层要把眼睛和嘴挖掉重填**（`cv2.INPAINT_TELEA` 或环形皮肤中位色）。不挖，
   母图自己的五官就"印"在脸上，所有部件叠上去会随头一起漂移 —— 这是最容易被当成
   「图层重叠 bug」的一条。
2. **眼四件共享同一个 footprint**：`eyewhite` / `irides` / `eyelash` / `eye_close` 必须用
   同一条外轮廓（先求 almond 再按颜色分工），否则眼球一动就露底。
3. **闭口与张口都要有**：`mouth close` 只在 `ParamMouthOpenY=0` 时露，`mouth open` 绑定同参数。

### 3.4 保存前的收尾

- **非眼嘴件 `binary_dilation(2) & body`**：1 px 修耳缝，2 px 才能闭合缎带锯齿；
  眼、嘴、笑眼**不能**外扩（`NO_GROW` 名单）。
- **色溢（bleed）**：透明区的 RGB 用 `distance_transform_edt` 从最近的不透明像素填满，
  否则缩放后每件边缘亮一圈。
- **覆盖率巡检**：`assets/_raw/audit_coverage.py`，看「没有被任何件覆盖的身体像素」，
  白缎带整段露绿就是这样发现的（8461 px）。

---

## 4. 管线 B：逐件源图（GPT 走这条）

如果生成模型能一次给出多张分件图，就不要切件：每张单独绿键、按同一个 transform 贴到画布，
`composite.png` 校验叠回来与原图逐像素一致（不一致就是抠图或映射有错）。

---

## 5. 构建：PSD2Live

### 5.1 两条入口，选哪个

| 入口 | 能力 | 用法 |
| --- | --- | --- |
| CLI | 吃 **PSD**，一次生成 | `PSD2Live.exe --input x.psd --output out --lang en --atlas 4096 --mesh-spacing 64` |
| GUI + MCP | 吃 **layout JSON**，可分步调参 | `http://127.0.0.1:23871/mcp` |

**CLI 不吃 manifest**（`--input x.layout.json` 会挂住且不产出）。要做姿势/参数/物理控制，
必须走 GUI 自带的 MCP。

### 5.2 GUI + MCP 流程

```powershell
Get-Process PSD2Live -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process 'D:\dsh_simroundtable\tools\psd2live\app\PSD2Live.exe'
Start-Sleep 2
Get-NetTCPConnection -LocalPort 23871 -State Listen   # 必须有 1 条，否则构建必失败
```

```powershell
# 客户端：assets/_raw/psd2live_mcp.py（tools | schema <tool> | ops <tool> <json> | call <tool> <json>）
python assets\_raw\psd2live_mcp.py tools
python assets\_raw\psd2live_mcp.py call import_layout '{\"request\":{\"path\":\"...layout.json\"}}'
python assets\_raw\psd2live_mcp.py call rig_generate '{\"request\":{}}'
python assets\_raw\psd2live_mcp.py call export_model '{\"request\":{\"outputDir\":\"...\"}}'
```

- 结果在 `structuredContent.data`；`notifications/initialized` 回 `-32601` 属正常。
- 长时间任务用 `wait_ms ≤ 30000` 轮询，别指望一次返回。
- **每次构建前杀 PSD2Live**；`WaitForExit` 会永久挂住，但产物已经写好。

### 5.3 图集大小只有一个杠杆

`--atlas` 是**页大小上限**，引擎自己在 256..16384 里挑：内容放不进 2048 就直接跳 4096，
传 `--atlas 1024` 也没用。唯一有效的是**降画布**（2048 → 1024）：
GPT 从 6 页 4096（403 MB 显存）降到 6 页 2048（96 MB）。

---

## 6. 验收

### 6.1 单帧确定性渲染

`preview/probe.html?model=<url>&scale=<n>&bg=%23ffffff&p=Param:Value,Param:Value`

- 必须 `autoStart:false` / `autoUpdate:false`，并 `model.internalModel.eyeBlink = undefined`，
  否则每帧自动眨眼会把你设的 `ParamEyeLOpen` 覆盖掉。
- 审计时**不要用默认绿底**：半透明件与纯绿混合会造出并不存在的绿边（假阳性）。

### 6.2 姿态压力测试

```powershell
python assets\_raw\audit_poses.py preview\_p39w_0.png preview\_p39w_1.png ...
```

判据：`holes`（被包围的背景色块 ≥40 px）、`white`（轮廓内 ≥250 纯白）、
`green`（轮廓内 `g > r+70 且 g > b+70`）。注意脚本**不喂图时打印 `0/0`**，那是没测。

### 6.3 座位尺度

舞台上一个座位高约 155–255 px，眼睛只有 ~20×14 px。判断五官细节必须回 1:1 的 probe，
在座位截图上量不出东西。

---

## 7. 接进舞台

### 7.1 开发页

`preview/longtable.html`（8 座位发展台）、`preview/claude-showcase.html`（单角色展示台）、
`preview/stage-760.html`（产品几何 760 px 校验）、`preview/probe.html`（单帧）。

### 7.2 产品（插件）

- `lib/stage.js`：`CHARACTERS` 表 + `characterDescriptor()` + 同步 `characterReady()`
  （`lib/api.js` 是同步调用，改 async 会 `SyntaxError: Unexpected reserved word`）。
  路由只在文件存在时注册；**描述符里的路径必须是裸文件名**（写成 `prefix/file` 会 404）。
- `lib/client.js`：`STAGE_CHARACTERS`（`scale` / `dx` / `dy` / `cut` / `book` / `mouth`）
  + `stageCharacterFor(seat)`（按座位 key/label 子串匹配，失败回落鲸鱼娘）。
- 新角色要同时更新：`test/stage.test.mjs` 的镜像表、`docs/art-requirements-*.md`、
  `HANDOFF.md` 的进度条目。

### 7.3 座位定标（重要）

`stageLayout()` 给每个座位 `charH`（760 舞台 182 px）与 `baseY`；模型 `anchor(0.5,1)`。
换算：

```
k = scale * charH / canvasHeight          # 画布像素 → 舞台像素
头顶 y  = baseY + dy - canvasInkTop * k
桌沿 y  = baseY - STAGE_PLATE_GAP(39)     # 桌子画在 canvas 之后，会遮住角色
腰线落在桌沿 ⇔ dy = (canvasH - waistY) * k - 39
```

小 Claude 是**全身像**，舞台上只要上半身 → `scale: 1.7, dy: 120`（产品）/ `1.8/160`（longtable），
再加 `cut: true` 的矩形遮罩（`PIXI.Graphics` + `model.mask`，比舞台大一圈；抱书层要**各自**一块遮罩）。

---

## 8. 新角色 checklist

1. 设定图按 §2.1 规范拿到（绿底、1024×1536、ink bbox 记录在案）。
2. 切件脚本产出 24 个部件，`composite` 叠回与原图 `mismatch=0`。
3. `face` 挖掉五官重填；眼四件共享 footprint；嘴有闭/开两件。
4. `claude_to_canvas.py` 式映射到 2048 画布，全件共用同一 transform + bleed。
5. `audit_coverage.py` 无未认领像素；`audit_poses.py`（白底）`holes=[]`、`green=0`。
6. `model3.json` 检查 `EyeBlink` / `LipSync` Groups 存在（有它才有自动眨眼）。
7. probe 1:1 看眼睛、嘴、发际线；差异对照原画并排贴图。
8. 760 校验页看座位落位（头宽与既有角色持平、腰/胸落在桌沿）。
9. `lib/stage.js` + `lib/client.js` 接入；`npm test` 46/46。
10. 文档 + `HANDOFF.md` 条目 + 提交（`assets/**` 在 .gitignore，只能提交 `preview/*.html`、
    `docs/*.md`、`lib/*.js`、`test/*.mjs`）。

---

## 9. 数值速查

| 项 | 值 |
| --- | --- |
| 母图 | `assets/incoming/claude-parts/P0-master.png`（1024×1536，ink `(129,42)-(894,1494)`） |
| 睁眼母图 | `P0-master-open.png`（中转站局部重画后嫁接，`diff>24` 3.88%） |
| 画布映射 | `scale=1.2645`、`dx=377.2`、`dy=52.9` |
| Claude 座位 | `scale 1.7`、`dy 120`（产品）／`1.8/160`（longtable） |
| GPT 座位 | `scale 0.85`、`dx 111`、`dy -25` |
| 桌沿 | `baseY - 39` |
| 眨眼 | PSD2Live `Groups.EyeBlink`，舞台不再手写 `ParamEyeLOpen` |
| 口型 | `ParamMouthOpenY = 0.10 + 0.90 * |0.72·sin(5.5sp) + 0.28·sin(8.9sp)|`，`sp = t/1000 + phase` |