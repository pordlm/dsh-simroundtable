> 本文件复制自 `D:\lnu-seat` 工作区（原项目：控制工程教材分册流水线）。
> 文中出现的绝对路径（`D:\lnu-seat\...`、`G:\控制工程\...`、`results\...`）属于原项目，
> 在新工作区请按需替换；与本工具链无关的章节（教材流水线、PDF 切分）可忽略。
>
# PlusAI 中转站（ns01.plusai.io）浏览器操作手册

> **日常入口**见 [../RELAY.md](../RELAY.md) 与 `tools\relay.ps1`（`up/status/ask/chats/down`）。
> 本文件是**实测细节**：选择器清单、菜单结构、踩坑记录与证据，供排查与扩展时查阅。

> 全部结论均为 2026-09-23 在本机实测得出，不是按 ChatGPT 通用印象推测。

## 0. 运行前提（踩过的坑，别再踩）

| 约束 | 现象 | 处理 |
|---|---|---|
| DSH 沙箱禁止命名管道 | Chromium 启动即崩：`FATAL:mojo platform_channel ... 拒绝访问` | 浏览器进程必须在沙箱外启动（后台任务 + 一次性授权） |
| 沙箱临时目录不可写 | playwright `mkdtemp EPERM` | 观察类命令前设 `$env:TEMP="D:\lnu-seat\.tmp"; $env:TMP=...` |
| 回环 TCP 在沙箱内可用 | `ws connected` 正常 | 授权只需一次（启动），之后观察/操作免授权 |
| 按进程名杀进程会误伤 | `Get-Process msedge \| Stop-Process` 会关掉用户自己的 Edge | **禁止**。只用 CDP `Browser.close` 关自己端口，或 kill 自己的 PID |
| 保活任务结束会带走浏览器 | 任务进程树被回收 → 浏览器窗口被关闭 | **已改为脱离托管启动**（见 1.2），不再有这个风险 |

## 1.1 标签页归属（重要）

用户会在同一个浏览器实例里做自己的活（工程会话、下载附件）。因此**所有自动化只操作带标记的标签页**：

- 标记方式：该标签页的 `window.name = 'dsh-automation'`（同标签内导航后依然保留，跨进程可再识别）
- 辅助模块：`tools/relay-tab.mjs` → `getMyTab(ctx)` / `describeTabs(ctx)`
- 默认行为：没有我的标签就**新开一个**并打标记；已有则复用
- **绝不**导航、输入或关闭不属于我的标签；`edge-drive.mjs --user-tab` 是唯一的例外，且仅用于只读查看

每次运行都会打印 `TABS: [{i,mine,url}]` 与 `MY_TAB:`，可据此确认没有碰到用户的标签。

> 历史教训：早期脚本用 `ctx.pages()[0]` / 第一个 plusai.io 标签，那正是**用户的**标签。

## 1.2 进程生命周期（脱离任务托管）

浏览器**不再**是后台保活任务的子进程。`Start-Process` 的子进程会随任务进程树被回收，曾因此在保活到点时把用户正在工作的窗口一起关掉。

启动方式改为 WMI 创建（父进程为 WmiPrvSE，不属于任何任务进程树）：

```powershell
$exe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$cmd = "`"$exe`" --remote-debugging-port=9223 --remote-allow-origins=* --no-first-run " +
       "--no-default-browser-check --user-data-dir=D:\lnu-seat\.edge-ai --new-window `"<url>`""
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
```

已实测：启动命令退出后进程依然存活。副作用是它现在也会比 DSH 活得更久，**只能显式关闭**：

```powershell
node D:\lnu-seat\tools\edge-close.mjs --endpoint http://127.0.0.1:9223   # 仅关闭该端口的实例
```

重启该实例后 Edge 可能因会话恢复产生重复标签，用下面的脚本查看与去重：

```powershell
node D:\lnu-seat\tools\relay-tabs.mjs  --endpoint http://127.0.0.1:9223   # 逐页只读诊断
node D:\lnu-seat\tools\relay-prune.mjs --endpoint http://127.0.0.1:9223   # 默认 dry-run
node D:\lnu-seat\tools\relay-prune.mjs --endpoint http://127.0.0.1:9223 --apply
```

`relay-prune.mjs` 的安全规则：同一 URL 分组，**优先保留带标记的标签**，其次保留第一个；绝不关掉最后一个标签。


## 1. 实例标识

- 可执行文件：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（Edge 153.0.4234.48）
- 独立配置目录：`D:\lnu-seat\.edge-ai`（与用户日常 Edge 隔离，登录态存于此）
- 调试端点：`http://127.0.0.1:9223`（仅回环）
- 保活：后台任务循环，`D:\lnu-seat\.edge-stop` 出现即优雅关闭（`--close`）

## 2. 已验证的 UI 结构与选择器

| 元素 | 选择器 | 备注 |
|---|---|---|
| 输入框 | `#prompt-textarea`（contenteditable） | 用 `keyboard.insertText` 写中文最稳 |
| 发送 | **无 data-testid**，回车提交 | `press('Enter')` 实测有效 |
| 模型 chip | composer `<form>` 内、**有文本且 aria 不属于功能按钮**的那个 | 文本随模型变：`5.6 Sol 极高` / `6 Pro` / `Auto [点此可切换模型]`。**禁止**用模型名关键词匹配 |
| 新建对话 | `a[data-testid="create-new-chat-button"]` | 有**两个**：折叠图标版（被侧栏遮挡，点不到）+ 文字版。用页内派发点文字版 |
| 附件输入 | `input[type="file"]`（页面有 5 个，取第一个） | `setInputFiles` 直接可用，不用点 "+" 菜单 |
| 附件卡片 | `[class*="file-tile"]` | 文本形如 `upload-probe.txt 文档` |
| 移除附件 | 卡片容器内**宽度最小**的 button，aria=`移除文件1：<文件名>` | 16×20 px |
| 助手消息 | `[data-message-author-role="assistant"]` | 取最后一个 |
| 消息级"切换模型" | `button[aria-label="切换模型"]` | 属于**消息操作行**（要求更改回复），不是 composer 的模型选择器 |
| 浮层 | `[data-state="open"][role="menu"]` | 只认 `data-state="open"`，否则会 dump 到隐藏菜单 |

## 3. 模型与推理强度（实测清单）

composer 模型菜单（`GPT-5.6 Sol` 与 `GPT-5.6 Pro` 带子菜单，`Auto`/`GPT-6 Pro` 无）：

| 菜单项 | 标识 | 子菜单 |
|---|---|---|
| Auto | `gpt-5.6-sol (auto)` | — |
| GPT-5.6 Sol | `gpt-5.6-sol` | 推理强度 |
| GPT-6 Pro | `gpt-6-astra (pro)` | — |
| GPT-5.6 Pro | `gpt-5.6-sol (pro)` | `延长` |
| 更多模型 | — | 展开 |

`GPT-5.6 Sol` 的推理强度（`role="menuitemradio"` + `aria-checked`）：

- `中` — 思考与速度平衡
- `高` — 为复杂问题思考更久
- `极高` — 为最难的问题做最深入的分析

**关键行为：模型与推理强度是"按会话"保存的。** 新建对话默认 `GPT-5.6 Sol` + `中`（实测新草稿 chip = `5.6 Sol 中`，原会话 = `5.6 Sol 极高`）。派任务时若要 `极高`，必须在会话内显式设置。

## 4. 命令配方

```powershell
$env:TEMP="D:\lnu-seat\.tmp"; $env:TMP=$env:TEMP
$EP="http://127.0.0.1:9223"

# 只读：当前模型 chip / composer 文本
node D:\lnu-seat\tools\relay-controls.mjs chips --endpoint $EP

# 切换模型 + 推理强度（锚定匹配，避免误选 Auto）
node D:\lnu-seat\tools\relay-controls.mjs select --model "GPT-5.6 Sol" --effort 极高 --endpoint $EP
node D:\lnu-seat\tools\relay-controls.mjs select --model "GPT-6 Pro" --endpoint $EP

# 新建对话（会跳到 /，返回新草稿）
node D:\lnu-seat\tools\relay-controls.mjs new-chat --endpoint $EP

# 上传附件并校验卡片（--remove 会验证移除）
node D:\lnu-seat\tools\relay-controls.mjs upload "D:\path\file.txt" --remove --endpoint $EP

# 清理 composer 里残留的附件
node D:\lnu-seat\tools\relay-controls.mjs untile --endpoint $EP

# 发消息并读回答（默认不改浏览器状态）
node D:\lnu-seat\tools\relay-chat.mjs --message "…" --out D:\lnu-seat\reply.png --timeout 240 --endpoint $EP

# 只读观察：标签页 / 正文 / 截图（我的标签）
node D:\lnu-seat\tools\edge-drive.mjs - D:\lnu-seat\state.png --tabs --text --endpoint $EP

# 只读查看"用户的"标签（唯一允许碰非己方标签的入口，仅观察）
node D:\lnu-seat\tools\edge-drive.mjs - D:\lnu-seat\user.png --user-tab --text --endpoint $EP

# 关闭整个独立实例（我自己的端口）
node D:\lnu-seat\tools\edge-close.mjs --endpoint $EP
```

所有脚本的硬约束：**不传 `--close` 绝不关闭浏览器**；任何脚本都不按进程名杀进程。

## 5. 操作要点

- **页内派发事件**：Playwright 的 `click()` 经常被中转站自己的浮层拦截（`div.z-0.flex.min-h-[46px] intercepts pointer events`）。统一用「focus + 派发 pointerover/pointerenter/pointermove/pointerdown/mousedown/pointerup/mouseup/click」序列绕过命中检测。Radix 触发器认 `pointerdown`。
- **匹配式必须锚定**：`Sol|GPT|Auto` 曾命中第一项 `Auto`，把模型静默切成 Auto。一律用 `^` 锚定 + 转义。
- **回答完成判定**：`[data-testid="stop-button"]` 不存在，靠"文本稳定 + 无停止按钮"；长回答要复读两次比对，避免截断流式输出。
- **Markdown 保真**：`innerText` 会压平代码围栏与表格；需要原文应点回答下方"复制回复"（`data-testid="copy-turn-action-button"`）再读剪贴板。

## 5.1 出图（imagegen）流水线（2026-11-07 实测，双参考图母图 + 表情编辑）

给 imagegen 模型发「母图/表情编辑」请求并收割产出图的完整配方（Live2D 管线在用）：

```powershell
# ① 发 ask：--file 可重复传多张（双参考图 = 设定图 + 成年图）；prompt 文本用 --message-file，
#    不能只 --file（relay-ask 要求 --message/--message-file）
powershell -NoProfile -ExecutionPolicy Bypass -File ./tools/relay.ps1 ask --new ^
  --file <参考图1> --file <参考图2> --file <prompt.txt> ^
  --message-file <prompt.txt> --timeout 90 --json

# ② 核对消息真的落进会话（横幅 reload 会吞消息，delivered.ok 也照吞；还要确认
#    连续两次 --new 没有复用同一会话 —— 对比 chatUrl / 会话 id）
node tools/relay-conv-json.mjs --chat <chatUrl>      # 看 [user] 节点的 attachments 与文本

# ③ 轮询收图（reply「正在处理图片…」是误报，图在服务端继续生成）
node tools/relay-grab-imagegen.mjs --chat <chatUrl> --list
node tools/relay-grab-imagegen.mjs --chat <chatUrl> --out <dir>
```

实测数据：`reply 7 chars "正在处理图片…"`、`replyMatchesPrompt ratio 0` 都不代表失败；
双图附件上传 ~2 分钟，出图本体 1–2 分钟（快于旧的 5–9 分钟经验值）。
`ask` 的 JSON 输出里 `bannerSeen: true` 是重要的危险信号——那一次发送大概率要重发。
表情编辑（「只改闭眼+张口，其余像素不动」）返回的是**整图重绘**（diff 全身 5–7 万 px），
只能当取件源，不能当新母图。

## 6. 实测证据

| 操作 | 证据 |
|---|---|
| 打开站点 | 登录页 → 登录后 `/c/6ab3ba0c-…`「问候交流」 |
| 发消息 + 读回答 | 12s 往返，回复 `连接测试成功。` — `relay-3.png` |
| 模型菜单 | `composer-model-menu.png` |
| 推理强度子菜单 | `effort-menu.png` |
| 切换 极高→高→极高 | chip 依次 `5.6 Sol 极高` → `5.6 Sol 高` → `5.6 Sol 极高` |
| 切换到 GPT-6 Pro 并复原 | chip `6 Pro` → `5.6 Sol 中` |
| 新建对话 | URL `/c/6ab3ba0c-…` → `/`，助手消息 0，chip 变 `5.6 Sol 中` — `new-chat.png` |
| 上传文件 | 卡片 `upload-probe.txt 文档`，模型答出文件首行 `DSH-UPLOAD-PROBE-20260923` — `upload-chat.png` |
| 移除附件 | `tiles 0` — `after-untile.png` |
