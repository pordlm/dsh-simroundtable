# dsh-simroundtable 交接文档

> 写给下一个对话/接手者。当前时间 2026-10-31 晚。中文为主，命令可直接复制。

## 0. 一句话现状

DeepSeek Harness 插件 **dsh-simroundtable**（圆桌会议：多模型独立作答 → 互评 → 仲裁 + 议题附件 + Web 页面 + Markdown 导出）已经完成并通过测试；目前在做**第二个功能：圆桌/长桌的 Live2D 可视化舞台**，预览已跑通，尚未接进插件页面。

- 仓库根：`D:\dsh_simroundtable`（git，`main`，origin `https://github.com/pordlm/dsh-simroundtable`）
- 已安装副本：`D:\dsh_simroundtable\deployed\dsh-roundtable`（profile 的 `link:` 已指到这里）
- GPU/渲染：PIXI 6.5.10 + pixi-live2d-display 0.4.0 + Live2D Cubism Core，模型为 whale-girl `c_0120`（moc3 v4）

## 1. 目录结构

```
D:\dsh_simroundtable\
  lib\                 # 插件本体（9 个模块）
    index.js           # apply()：命令 /roundtable、roundtable 工具、API 注册
    engine.js          # runDeliberation：作答 → 讨论 → 评审 → 裁决
    meetings.js        # MeetingManager：记录、恢复、取消、超时、导出
    api.js             # /api/roundtable/* 路由（connection.fetch）
    core.js            # 配置、目录、摘要、Markdown 格式化
    prompts.js         # 各阶段 prompt
    attachments.js     # 附件：上传、校验、落盘、文本内联、图片能力探测
    copy.js            # 中英文案
    client.js          # Web 页面（sidebar.panellist + main key）
  test\                # core / apply / meetings / client / attachments（42 个用例）
    manual\            # 真模型 E2E 脚本（需环境变量，默认不跑）
  assets\
    characters\deepseek\   # 早期 2D 差分（5 姿势 × 4 帧），非当前方案
    models\whale-girl\     # Live2D 模型 c_0120（CC BY-NC-SA 4.0，见 LICENSE-ASSETS.md）
    vendor\                # pixi / cubism4 / live2dcubismcore（浏览器端）
    table*.png  chair*.png # 家具素材
    _raw\ incoming\ build\ # 美术中间产物（已 gitignore）
  preview\
    longtable.html     # ★ 当前舞台方案：长桌 + 8 个 Live2D 实例
    stage.html         # 旧圆桌 + 2D 差分方案（保留参考）
    *.png              # 历史截图（gitignore 忽略）
  docs\
    art-requirements-psd2live.md   # ★ 人物部件规范（GPT 出图用，已实测可跑通）
    art-requirements-face.md       # 脸部三态规范（烘焙方案用）
    art-requirements-longtable.md  # 长桌/椅子素材规范
  tools\psd2live\       # PSD2Live 3.6.7（本机工具，gitignore）
  deployed\             # 已安装插件副本 + 备份（gitignore）
  HANDOFF.md            # 本文件
```

## 2. 插件功能（0.4.0，已完成）

三个入口：

1. `/roundtable <议题>` 命令
2. `roundtable` 模型工具（`{topic, panel}`）
3. 左侧导航「圆桌会议」页面（`sidebar.panellist` + `main` 面板，不替换侧栏）

流程：2–8 个回答者独立作答 → 讨论轮修订 → 匿名评审排序 → 仲裁给出最终答案；支持座位/评审/裁决配置、取消、超时、部分失败、历史记录。

**议题附件（0.3.0 起）**：

- 图片：只发给声明 `image` 模态的模型（`llm.resolveModelInfo().inputModalities`），未知模态按乐观处理；纯文本模型会被跳过并记一条 limitation。
- 文本（代码/表格/文档）：内联进 prompt（子代理只有 web_search/web_fetch，FileBlock 读不到），有单文件/总字数上限。
- 路由：`POST /api/roundtable/upload`、`POST /api/roundtable/upload/remove`、`GET /api/roundtable/capabilities`。
- 文件落盘：`<workspace>/.roundtable/uploads/<id>/`，创建会议时移入 `attachments/<meetingId>/`。

**导出**：优先浏览器下载；失败则写 `<workspace>/.roundtable/exports/roundtable-<id>.md`，页面展示路径 + 只读 Markdown + 复制。

## 3. Live2D 舞台（已接入插件 0.5.0）

- 方案已从「圆桌 8 方向立绘」改为**长桌**：8 个座位一字排开、全部朝屏幕，避免侧/背视角（Live2D 只能小幅转头，模型没有背面）。
- `preview/longtable.html`：1400×920 设计稿版，桌子 `assets/table-long.png` 满幅铺在 `top:585`，角色基线 `BASE_Y=668`，椅子 `assets/chairs/chair-long-back.png`（压暗 + 下沉）。
- **插件内实现**（0.5.0，`lib/client.js` 的 `StageCard`/`StageCanvas`，插在会议详情页头部卡片之后）：
  - 设计单位固定 **760×430**（详情页正文列 `maxWidth:760px`），容器窄于 760 时整层 `transform: scale(k)` 缩放，高度同步，所以铭牌字号不会被压到看不清；
  - 座位 = `meeting.progress.members` 里 `role==="answerer"` 的前 8 位；间隙预算沿用设计稿算法（`gapChair≈step*0.13`、`gapChar≈step*0.06`，椅子与人物各留缝，n=8 时 charH=99，n=3 时 166，n=2 时 178）；
  - 发言者 = `transcript` 里 `role==="answerer"` 且无 text、无 error 的最后一条 → 该座位切统一发言动作 + 上浮 3px，其余按各自随机节奏待机；
  - 气泡只给「当前发言者」和「点击选中的座位」，文本取该座位最近一条回答经 `stageSummary()` 清洗（去代码块/标题符号/合并空白，截断 80 字）；点击铭牌可切换查看别人的回答；
  - 模型自带 `idle` 与所有道具动作都被 `stageDropPhonePose()` 压掉（`stopAllMotions()` + 手机部件透明度 0 + 手机参数清零）。
- **资源怎么进浏览器**：插件没有静态目录 URL，所以新增 `lib/stage.js`，用 `connection.fetch.register` 逐条开精确路由（前缀 `/api/roundtable/stage`）：3 个 vendor 脚本、`art/table.png`、`art/chair.png`、`model/model3.json`（服务端把原 model3.json 精简成只留 Moc/Textures/Physics/EyeBlink）、`model/c_0120.moc3`、`model/c_0120.physics3.json`、`model/textures/texture_0{0,1}.png`。二进制带 `cache-control: public, max-age=604800`，描述符 `no-store`。
- 独立设计校验页 `preview/stage-760.html`（`?n=3&active=1&topic=…`，经 8848 预览服务器取真实素材）：改布局数学先在这里试，不用重装插件。
- 动作（已按用户要求）：
  - 待机：每座位随机节奏（呼吸周期 3.0–5.2 s、浮动 1.1–2.4 px、摇摆 0.7–1.8°、转头 2.2–6.2°），互不同步；
  - 发言：所有发言者统一动作（`ParamAngleY` ±7°、`ParamBodyAngleZ` ±3.2°、`ParamAngleX` ±1.5°、整体上抬 3 px），由全局时钟驱动；
  - **不再播放模型自带 `idle`**（原版是掏手机/看手机，用户明确说不要）；内置动作库（selfie/ketchup/bubble/splash…）都带道具，别随机播。
- 模型能力限制：`c_0120` 只把 `ParamAngleX/Y/Z`、`ParamBodyAngle*` 绑到几何；`ParamMouthOpenY`、`ParamMouthForm`、眼睛参数**没有任何视觉变化**，所以「说话」只能靠点头/前倾 + 气泡，不能做口型。
- 视口参数：`?static=1` 冻结、（`?idle=1` 可对比旧手机动作）、`?n=2..8`、`?h=`、`?freeze=1` 确定性渲染、`?nochairs=1`。

## 4. 环境与运行

| 项 | 值 |
|---|---|
| DSH | 0.2.1-rc.4，安装在 `C:\Users\pordl\AppData\Roaming\DSH\data\versions\0.2.1-rc.4` |
| GUI | http://127.0.0.1:55314 （宿主 PID 68096，2026-10-31 23:35 启动；token 会随每次启动变化，见第 6 节） |
| profile | `C:\Users\pordl\.dsh\profiles\web\package.json`，`"dsh-simroundtable": "link:D:/dsh_simroundtable/deployed/dsh-roundtable"`（**键必须是包名，不能用 `@local/...` 别名**，见第 6 节；`node_modules\dsh-simroundtable` 是指向 deployed 的 junction） |
| Python | `C:\dev\python 3.12.0`（Pillow / numpy / scipy / cv2 / onnxruntime；**rembg 未装**） |
| PSD2Live | `D:\dsh_simroundtable\tools\psd2live\app\PSD2Live.exe`（自带 JRE） |
| 旧路径兼容 | `D:\lnu-seat\plugins\dsh-roundtable` 现在是指向 `deployed\dsh-roundtable` 的目录联接（junction），给迁移时正在运行的宿主用；重启后可删 |

常用命令：

```powershell
# 测试（仓库根）
npm test           # 45/45，含 test/stage.test.mjs
npm run check      # node --check 7 个模块（含 api.js、stage.js）

# 预览服务器（长桌）
python -m http.server 8848 --bind 127.0.0.1 --directory D:\dsh_simroundtable
# 打开 http://127.0.0.1:8848/preview/longtable.html?static=1

# 无头截图（profile 必须放 D 盘并在用完后删除）
msedge --headless=new --disable-gpu --hide-scrollbars `
  --user-data-dir=D:\dsh_simroundtable\.edge-tmp\<随机> `
  --window-size=1400,920 --virtual-time-budget=4000 `
  --screenshot=D:\dsh_simroundtable\preview\shot.png `
  "http://127.0.0.1:8848/preview/longtable.html?static=1"

# PSD2Live：PSD → moc3
PSD2Live.exe --input parts.psd --output build\model
PSD2Live.exe export parts.psd --target web --output build\web
PSD2Live.exe export parts.psd --target png-sequence --set clip=Idle --set fps=10 --set size=700
```

## 5. 美术管线（PSD2Live，已实测）

1. GPT 按 `docs/art-requirements-psd2live.md` 出**同一 2048×2048 画布**的分层 PNG（17 个必需部件，隐藏区域要补画）。
2. `assets/_raw/build_psd2live_psd.py` 合成 PSD（图层名必须是 ASCII：`back hair` / `front hair` / `face` / `mouth close|open` / `eyewhite-l|r` 等）。
3. PSD2Live 自动绑定 → `.moc3` + `model3.json`（生成 20 个参数、idle/nod/shake 等动作、表情）。
4. 预览/接入：PIXI + pixi-live2d-display 加载 `model3.json`。

已知限制：PSD2Live 自动绑定**不生成手臂参数**，也没有手臂动作；独立眼层会被重排（所以目前把五官烘焙进脸，只保留张口/闭嘴两个图层）。

## 6. 已踩过的坑（省时间）

- 无头 Edge 的 `--user-data-dir` 要放 D 盘并逐个删除；C 盘曾被几十个 profile 塞满（0.06 GB，ENOSPC）。
- `--virtual-time-budget` 配合长 `setInterval` 会让无头 Edge 挂起。
- `file://` 页面不能 fetch 模型；`http://` 页面不能加载 `file://` 脚本 —— 全部走同一个 http 源。
- PSD 图层名经 psd_tools 写出是 MacRoman，中文会 `UnicodeEncodeError`。
- 部件逐件 trim 会丢失共同画布 → 五官错位；必须整张 2048 画布导出（或本机按坐标重排）。
- 本地脚本不要叫 `inspect.py`，会遮蔽 stdlib 导致 scipy 崩。
- 插件代码更新后要在官方「插件」页把 dsh-roundtable 关→开（只授权了这个插件）；本实例的 client negative cache 有时需要整机重启。
- **profile 依赖键必须等于包名**（2026-10-31 踩过）：前端 `lib/client.js` 用 `window.__ModuleLoader__.load({ id: "dsh-simroundtable" })` 注册，而 boot 清单里 entry 的 `name` 来自**插件自带 `cordis.patch.yml` 的 `insert[].name`**（不是 `dsh.profile.bundles`）。迁移时为了兼容旧路径把依赖写成 `"@local/dsh-roundtable": "link:..."` 之后，patch 里的 `name` 仍是别名 → 模块解析失败 → 整个插件被**静默跳过**（无 API 路由、boot 清单里连条目都没有，日志里只有一行 skip）。
  - 诊断：`C:\Users\pordl\AppData\Roaming\DSH\data\versions\0.2.1-rc.4\node_modules\.bin\dsh.cmd --profile web --dump-config`（用宿主自己的 dsh，别用 PATH 上的旧版），它会直接打印 `dsh: skipping profile bundle "…": Error: …` 以及最终组合树；正确时能看到 `# == dsh-simroundtable` / `- id: dsh-simroundtable` / `  name: dsh-simroundtable`。
  - 修法：profile `package.json` 依赖键与 `dsh.profile.bundles` 都改回 `dsh-simroundtable`，`node_modules\dsh-simroundtable` 用 junction 指向 deployed，`pnpm-lock.yaml` 同步（或干脆重跑 `pnpm install`），**并且把仓库根正确的 `cordis.patch.yml` 覆盖到 deployed**。改完必须重启应用。
  - 改完先确认 deployed 与仓库的 `cordis.patch.yml` 一致（曾因 deployed 留着旧拷贝而多折腾两轮重启）。
- **GUI 的 token 在 `C:\Users\pordl\AppData\Roaming\DSH\manager.log` 里**：每次启动打一行 `[0.2.1-rc.4/web] dsh web: http://127.0.0.1:55314/?token=…`，用 `Select-String -Pattern 'dsh web: http'` 取最后一条即可，不必问用户；同一份日志里还会打 `页面自检：NN 个客户端插件包全部正常`（数目对不上就是有插件没激活）和 `DSH_X_RUNTIME_EVIDENCE`（`rows` 非空即失败条目）。
- 浏览器里验证插件 UI 可以用自建 CDP 驱动 `tools/cdp.mjs`（`targets | eval | nav | shot | logs`，连 9333），配 `msedge --headless=new --remote-debugging-port=9333 --user-data-dir=D:\dsh_simroundtable\.edge-tmp\<随机> "<带 token 的 URL>"`；PowerShell 传多行 JS 用 here-string（`$js = @' … '@` 再 `node tools\cdp.mjs eval $js`），直接内联引号会被吃掉。

## 7. 授权（重要）

- 代码：**GPL-3.0-or-later**（0.1.0–0.3.0 曾是 MIT，已在 README/CHANGELOG 注明）。
- `assets/models/whale-girl/**`：**CC BY-NC-SA 4.0 非商业**，署名 上善无形（OC 溟月）/ ZipZipPipe / 氵六青，详见 `assets/models/whale-girl/LICENSE-ASSETS.md` 与 `NOTICE.md`。
- 运行时：pixi 6.5.10 MIT、pixi-live2d-display 0.4.0 MIT、Live2D Cubism Core 按 Live2D SDK 条款。

## 8. 下一步（建议顺序）

1. ~~**接入插件**~~ **已完成（0.5.0）并在真实 GUI 验证过（2026-10-31 23:47）**：长桌舞台在会议详情页头部卡片之后渲染，2 个 aliyun 座位的实测会议（作答 → 互评 → 仲裁，2 分 52 秒）全程正常，见第 3 节。
2. 决定是否给 `assets/` 下的长桌/椅子/模型做懒加载（8 个 moc3 实例内存不小，页面只在详情页挂载；目前是首次打开详情页时才开始下载 2.1MB moc3 + 1.8MB 纹理）。
3. 可选：给「非发言」座位加低频小动作（歪头/点头），不要用内置道具动作。
4. 可选：`stage.js` 的 `files` 表可以合并成一条 `stage/*` 通配实现（现在按精确路由逐条注册，新增素材要手工加一行）。
5. 若要 8 个模型都有立绘：按 `docs/art-requirements-psd2live.md` 出部件，跑同一条管线。

## 9. 硬性约束（用户明确要求过）

- 不自动整机重启 DSH；插件更新只走官方「插件」页 off→on（仅本插件获得过授权）。
- 用户已暂停 **GLM5.3-FlashX**（成员与测试都不要用）。
- 浏览器自动化只操作 `window.name === 'dsh-automation'` 的标签页；禁止按进程名杀浏览器、不自动关闭浏览器（见 `D:\lnu-seat\RELAY.md` / `AGENTS.md`）。
- 不再反复截图取证；用户对"只改不验证"和"只验证不改"都不耐烦，改动后给一张关键截图即可。