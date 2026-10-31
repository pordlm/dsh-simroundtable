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

## 3. Live2D 舞台（进行中）

- 方案已从「圆桌 8 方向立绘」改为**长桌**：8 个座位一字排开、全部朝屏幕，避免侧/背视角（Live2D 只能小幅转头，模型没有背面）。
- `preview/longtable.html`：1400×920，桌子 `assets/table-long.png` 满幅铺在 `top:585`，角色基线 `BASE_Y=668`，椅子 `assets/chairs/chair-long-back.png`（压暗 + 下沉）。
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
| GUI | http://127.0.0.1:55314 （宿主 2026-10-30 08:58 启动，PID 90320） |
| profile | `C:\Users\pordl\.dsh\profiles\web\package.json`，`"@local/dsh-roundtable": "link:D:/dsh_simroundtable/deployed/dsh-roundtable"` |
| Python | `C:\dev\python 3.12.0`（Pillow / numpy / scipy / cv2 / onnxruntime；**rembg 未装**） |
| PSD2Live | `D:\dsh_simroundtable\tools\psd2live\app\PSD2Live.exe`（自带 JRE） |

常用命令：

```powershell
# 测试（仓库根）
npm test           # 42/42
npm run check      # node --check 9 个模块

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

## 7. 授权（重要）

- 代码：**GPL-3.0-or-later**（0.1.0–0.3.0 曾是 MIT，已在 README/CHANGELOG 注明）。
- `assets/models/whale-girl/**`：**CC BY-NC-SA 4.0 非商业**，署名 上善无形（OC 溟月）/ ZipZipPipe / 氵六青，详见 `assets/models/whale-girl/LICENSE-ASSETS.md` 与 `NOTICE.md`。
- 运行时：pixi 6.5.10 MIT、pixi-live2d-display 0.4.0 MIT、Live2D Cubism Core 按 Live2D SDK 条款。

## 8. 下一步（建议顺序）

1. **接入插件**：把 `preview/longtable.html` 的逻辑搬进 `lib/client.js` 的 DetailView —— 按会议成员排座、谁发言切统一动作 + 气泡展示该模型回答摘要（摘要从 `transcript`/`answers` 取，60–80 字截断）。
2. 决定是否给 `assets/` 下的长桌/椅子/模型做懒加载（8 个 moc3 实例内存不小，页面只在详情页挂载）。
3. 可选：给「非发言」座位加低频小动作（歪头/点头），不要用内置道具动作。
4. 已完成并提交：长桌素材（`assets/table-long.png`、`assets/chairs/chair-long-back.png`）、`docs/art-requirements-longtable.md`、`preview/longtable.html`、`preview/guides/`；如尚未推送，执行 `git push`。
5. 若要 8 个模型都有立绘：按 `docs/art-requirements-psd2live.md` 出部件，跑同一条管线。

## 9. 硬性约束（用户明确要求过）

- 不自动整机重启 DSH；插件更新只走官方「插件」页 off→on（仅本插件获得过授权）。
- 用户已暂停 **GLM5.3-FlashX**（成员与测试都不要用）。
- 浏览器自动化只操作 `window.name === 'dsh-automation'` 的标签页；禁止按进程名杀浏览器、不自动关闭浏览器（见 `D:\lnu-seat\RELAY.md` / `AGENTS.md`）。
- 不再反复截图取证；用户对"只改不验证"和"只验证不改"都不耐烦，改动后给一张关键截图即可。