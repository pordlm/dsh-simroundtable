> 本文件复制自 `D:\lnu-seat` 工作区（原项目：控制工程教材分册流水线）。
> 文中出现的绝对路径（`D:\lnu-seat\...`、`G:\控制工程\...`、`results\...`）属于原项目，
> 在新工作区请按需替换；与本工具链无关的章节（教材流水线、PDF 切分）可忽略。
>
# RELAY.md — PlusAI 中转站 · 独立浏览器自动化

一个独立于你日常浏览器的 Edge 实例，专供脚本/对话调用 [ns01.plusai.io](https://ns01.plusai.io/)（PlusAI 中转站，内网 fake-IP 解析，必须走本机代理）。

---

## 0. 给新对话的 AI：30 秒速览

```powershell
cd D:\lnu-seat
.\tools\relay.ps1 status                                          # 先看浏览器在不在
.\tools\relay.ps1 ask --new --message "你的问题"                   # 提问（自动套默认模型+推理强度）
```

**三条铁律（务必遵守）**

1. **只操作带标记的标签页**：`window.name === 'dsh-automation'`。其余标签属于用户，绝不导航/输入/关闭。
2. **禁止按进程名杀进程**（`Get-Process msedge | Stop-Process` 会关掉用户自己的浏览器）。要关只关本实例：`.\tools\relay.ps1 down`。
3. **不要自动关闭浏览器**，也不要给它加"到点自动退出"的保活任务（它已脱离任务托管）。

**配置都在** [tools/relay.config.json](tools/relay.config.json)，路径/端口/默认模型都可改，脚本不写死。
**详细实测记录与踩坑**见 [tools/RELAY-RUNBOOK.md](tools/RELAY-RUNBOOK.md)。

---

## 1. 常用命令

```powershell
.\tools\relay.ps1 status                          # 浏览器状态 + 逐标签归属
.\tools\relay.ps1 up                              # 没跑就启动（脱离托管，不会被自动关闭）
.\tools\relay.ps1 down                            # 只关闭这个独立实例

.\tools\relay.ps1 ask --new --message "你好"       # 新会话提问（套用 defaultModel/defaultEffort）
.\tools\relay.ps1 ask --message "继续"             # 在当前（我的）会话里追问
.\tools\relay.ps1 ask --chat <url> --message "…"   # 在指定会话里提问
.\tools\relay.ps1 ask --new --message "…" --model "GPT-6 Pro" --effort 高
.\tools\relay.ps1 ask --new --message "读一下附件" --file D:\path\a.md --shot --json

.\tools\relay.ps1 chats                           # 列会话（标题+URL+序号）
.\tools\relay.ps1 chats --find TRPV               # 按关键词找会话
.\tools\relay.ps1 chats --open 3                  # 把我的标签切到第 3 个结果

.\tools\relay.ps1 chips                           # 当前模型/推理强度
.\tools\relay.ps1 model --model "GPT-5.6 Sol" --effort 极高
.\tools\relay.ps1 upload D:\path\a.txt --remove    # 只测附件上传+移除
.\tools\relay.ps1 clean                           # 清掉 composer 里残留的附件
.\tools\relay.ps1 tabs                            # 只读诊断所有标签
.\tools\relay.ps1 prune                           # 重复标签清理（默认 dry-run）
.\tools\relay.ps1 probe                           # 查看模型菜单结构（只读）
```

## 2. 配置项（tools/relay.config.json）

| 键 | 当前值 | 说明 |
|---|---|---|
| `endpoint` | `http://127.0.0.1:9223` | 独立实例的 CDP 端口（仅回环） |
| `edgePath` | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` | Edge 153 |
| `profileDir` | `D:\lnu-seat\.edge-ai` | 独立配置目录，**登录态存这里**（删掉就要重新登录） |
| `playwrightCorePath` | `G:\下载课程\node_modules\playwright-core` | 现成的 playwright-core 1.61.1，无需 npm install |
| `homeUrl` | `https://ns01.plusai.io/` | 起始页 |
| `tabMarker` | `dsh-automation` | 标签归属标记（`window.name`） |
| `defaultModel` / `defaultEffort` | `GPT-5.6 Sol` / `极高` | `ask --new` 时自动套用 |
| `replyTimeoutSec` | `300` | 等回答上限 |
| `screenshotDir` | `D:\lnu-seat\shots` | `--shot` 落盘位置 |

## 3. 实测能力

| 能力 | 状态 | 备注 |
|---|---|---|
| 登录态复用 | ✅ | 配置目录持久，跨重启免登录 |
| 新开会话 | ✅ | 侧栏有两个同名按钮，脚本点文字版 |
| 选择模型 | ✅ | `Auto` / `GPT-5.6 Sol` / `GPT-6 Pro` / `GPT-5.6 Pro` / `更多模型` |
| 推理强度 | ✅ | `中` / `高` / `极高`；**按会话保存**，新会话默认 `中` |
| 上传文件 | ✅ | 模型能读到文件内容（实测答出文件首行） |
| 读取回答 | ✅ | 稳定判定 + 复读校验（`verifiedStable`） |
| 会话列表/切换 | ✅ | `chats` / `chats --open N` |
| 标签诊断/去重 | ✅ | `tabs` / `prune`（默认 dry-run） |
| 截图 | ✅ | `--shot` 或 `--out` |

**延迟实测**：`极高` 强度下一次简短问答耗时 **约 207 秒**（含排队）。要快就传 `--effort 中` 或 `--effort 高`。

## 4. 安全设计（为什么不会误伤你的浏览器）

1. **标签归属**：`tools/relay-tab.mjs` 只认带标记的标签，没有就新开一个；`ctx.pages()[0]` 这种写法已被移除。唯一例外是 `edge-drive.mjs --user-tab`，仅用于只读查看。
2. **不杀进程**：全仓库没有按进程名 kill 的代码；关闭实例走浏览器级 CDP（`edge-close.mjs`）。
3. **脱离托管**：浏览器由 WMI 创建，不属于任何任务进程树，因此**不会**因任务结束/超时被连带关闭（这条曾导致用户正在工作的窗口被关掉）。
4. **默认不落盘**：提问默认不改任何配置；`--new` 才新开会话。

## 5. 故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:9223` | 浏览器没运行 | `.\tools\relay.ps1 up` |
| `mkdtemp EPERM` | 临时目录不可写 | 已由配置的 `tempDir` 自动处理；确认该目录存在 |
| `FATAL:mojo platform_channel ... 拒绝访问` | 在受限沙箱内启动了 Chromium | 用 `relay.ps1 up`（需在沙箱外，DSH 里要点一次授权） |
| `... intercepts pointer events` | 中转站自身浮层挡点击 | 库内已统一改为页内派发 `pointerdown/click` 序列 |
| `composer form not found` | SPA 还在启动 | 脚本已内置等待；仍失败则 `chats --open` 换个会话 |
| 附件留在草稿里 | 上传后没发送 | `.\tools\relay.ps1 clean` |
| 回答像是没写完 | 长回答中途停顿 | 看 `verifiedStable`；`relay-ask` 会自动复读，必要时加大 `--timeout` |
| 模型莫名变成 Auto | 匹配式未锚定（历史 bug） | 已修复：所有模型匹配都锚定 `^` |
| DSH 的 MCP 浏览器工具报 `belongs to another Session` | 那是 DSH 插件与会话绑定，与本方案无关 | 新开一个对话即可 |
| **所有**命令都报 `windows-acl-run: --temp is not an existing directory: …\dsh-XXXX` | DSH 沙箱临时目录被清掉了（本工作区无关；一晚出现两次） | 按报错路径新建该目录（需一次沙箱外授权），之后命令恢复 |
| 后台监控任务消失但浏览器还在 | 正常：监控有 8 小时上限，且浏览器已脱离托管 | 需要监控就 `node tools\edge-monitor.mjs` 重新起；浏览器不必重启 |

## 6. 文件清单

| 文件 | 作用 |
|---|---|
| [tools/relay.ps1](tools/relay.ps1) | **统一入口**（up/down/status/ask/chats/…） |
| [tools/relay.config.json](tools/relay.config.json) | 全部可调参数 |
| [tools/relay-ask.mjs](tools/relay-ask.mjs) | 一条命令走完：新会话→模型→附件→提问→取回答 |
| [tools/relay-lib.mjs](tools/relay-lib.mjs) | 已验证的操作原语（发送/等待/菜单/附件…） |
| [tools/relay-tab.mjs](tools/relay-tab.mjs) | 标签归属（只碰自己的标签） |
| [tools/relay-chats.mjs](tools/relay-chats.mjs) | 会话列表/查找/切换 |
| [tools/relay-tabs.mjs](tools/relay-tabs.mjs) | 逐标签只读诊断 |
| [tools/relay-prune.mjs](tools/relay-prune.mjs) | 重复标签清理（dry-run 优先） |
| [tools/relay-controls.mjs](tools/relay-controls.mjs) | 模型/强度/新建/上传/清理 的细粒度命令 |
| [tools/relay-chat.mjs](tools/relay-chat.mjs) | 简化版发送+读取（含 `--probe`） |
| [tools/edge-drive.mjs](tools/edge-drive.mjs) | 通用导航/截图/取文本（含 `--user-tab` 只读） |
| [tools/edge-close.mjs](tools/edge-close.mjs) | 按端口关闭独立实例 |
| [tools/edge-monitor.mjs](tools/edge-monitor.mjs) | 只读监控标签变化 → `edge-monitor.log` |
| [tools/RELAY-RUNBOOK.md](tools/RELAY-RUNBOOK.md) | 实测细节、选择器清单、踩坑记录 |

## 7. 教材分节流水线（本书专用）

把《控制工程基础（第5版）》的分册丢给中转站，得到"小节 → 页码"对照表。分册在 `G:\控制工程\`（`_2`=目录，`_3`~`_13`=第1~11章，`_14`=附录A）。

### 结论：**目录优先，模型只做边角精修**

实测（197 个编号小节）：

| 维度 | 目录单独推导 | 章节问答（11 个会话） |
|---|---|---|
| 起始页 | 权威（出版社页码） | 与目录 **197/197 完全一致**，零增量 |
| 结束页 | 推出"保守终点"（边界页**同时归前后两节**） | 197 个边界里 15 个可**收紧一页**（那页确无上一节续文） |

所以：**同类书先只跑目录（1 个会话 ≈ 5 分钟）**，默认用保守终点（**绝不漏文**，代价是边界页可能重复）；只有在意"某页到底算谁"时，渲染那几页目视抽查即可（`node tools\pdf-peek.mjs <pdf> --pages N`），不必再问模型。

**本书小节在页中间连续排版**：某页上半常是上一节续文、下半才是下一节标题 → 切分 PDF 时该页要**同时归入前后两节**。

```powershell
# A. 目录优先（推荐，全自动、可复现）
node tools\build-from-toc.mjs            # → results\ALL-SECTIONS-FROM-TOC.md/.json

# B. 可选：章节问答 + 边界修订（本书已跑完，共 22 个会话）
node tools\relay-batch.mjs --plan tools\batch-plan.json --timeout 1500
node tools\relay-followup.mjs --ids part-03,part-05 --suffix v2   # 边界页归属修订（不重传文件）

# C. 合并与校验
node tools\merge-splits.mjs              # → results\ALL-SECTIONS.md/.json（主表）
node tools\compare-toc-vs-model.mjs      # 目录 vs 模型 对撞
node tools\verify-splits.mjs             # 起点对账
node tools\audit-results.mjs             # 完整性审计
node tools\relay-recover.mjs --id part-05  # 断线恢复（刷新会话取回答案）
node tools\relay-read.mjs --chat <url> --reload   # 只读复查某会话
```

- 提示词：[tools/prompts/](tools/prompts/)（`split-sections-auto.md` 自我识别章号、`split-sections.md` 已知章号、`extract-toc.md` 目录、`refine-boundary-pages.md` 边界页修订）
- 主表 [results/ALL-SECTIONS.md](results/ALL-SECTIONS.md) 的列：`小节 | 标题 | 书内页 | PDF 页 | 与下一节共享末页 | 保守终点`
- 标记含义：`⚠️` 起点按目录纠正过；`❗` 需要人工复核（父级终点早于子小节终点，属模型失误，已被自动修复）

### 踩过的坑（都已修复，勿回退）

1. **"网络传输中断"横幅不是答案**：中转站会在流中断时插入一句提示，必须刷新会话取回它服务端补完的内容（`relay-ask`/`relay-batch` 已内置恢复）。
2. **JSON 提取不能取"最后一个 `[`"**：正文里出现 `lg[1-x_o(t)]` 之类的方括号会带偏解析，整章被静默丢弃。统一用 `tools/answer-parse.mjs`。
3. **发消息前必须确认页面真在目标会话**：否则上一轮的页面会让这条消息落进**另一个会话**（part-13 曾因此产出 part-12 的完美副本）。`relay-followup` 现已校验导航目标与回答章号。
4. **父级小节的终点要看"同级或更高级"的下一个标题**，不是它的第一个子标题。

## 8. 收尾工具

### 8.1 按页码表切分 PDF

```powershell
pwsh -NoProfile -File tools\split-pdf-sections.ps1 -Only 2 -DryRun   # 先看计划
pwsh -NoProfile -File tools\split-pdf-sections.ps1 -Only 2           # 只做第 2 章
pwsh -NoProfile -File tools\split-pdf-sections.ps1                   # 全书（已存在则跳过）
pwsh -NoProfile -File tools\split-pdf-sections.ps1 -Force            # 覆盖
pwsh -NoProfile -File tools\split-pdf-sections.ps1 -RebuildManifest  # 只重建清单
```

- 工具链：TeXLive 自带的 poppler（`pdfseparate` 无损拆页 + `pdfunite` 合并 + `pdfinfo` 校验页数）；**不是** Ghostscript（那会重编码）
- 读 `results\ALL-SECTIONS.json`（字段是 `startPdf`/`endPdf`），按 `tools\batch-plan.json` 找到分册源文件
- 输出：`split\ch<章>\<小节号> <标题>_PDF<起>-<止>.pdf`（每章一个目录）+ **`split\_manifest.csv`**（225 条：章/小节/标题/书内页/PDF页/页数/文件/字节）
- 每个产物都用 `pdfinfo` 校验页数，对不上即报失败；**共享边界页按表同时归入前后两节**
- 实测：225 个文件、286 MB、0 失败

> **这些 PDF 没有文字层**（图像型）：`pdftotext` 取不出文字（输出 1 字节）。要核对内容必须**渲染成图**看，例如
> `pdftoppm -f 5 -l 5 -png -r 90 <pdf> out` 再读图；`pdf-peek.mjs` 用的是浏览器 PDF 渲染，也能看。

### 8.2 删除自动化会话

```powershell
node tools\relay-delete-chats.mjs          # dry-run：列出将要删除的会话（默认）
node tools\relay-delete-chats.mjs --yes    # 真正删除
```

安全模型（**用户数据不可冒险**）：

1. 目标**只来自白名单**：`results\*.json` 里记录的 `chatUrl` + [tools/mine-chats.json](tools/mine-chats.json) 里显式列出的测试会话。**不提供按序号删除**（侧栏序号会随删除而变化，极易删错）。
2. 默认 dry-run，必须 `--yes` 才执行。
3. 逐个删除前**现场重新解析侧栏项并打印标题**；找不到预期的菜单项/确认按钮就中止该项，绝不盲点。
4. 删除后复查该 URL 是否已从侧栏消失。

## 9. 变更记录

- **v2（2026-09-23）**：配置化（`relay.config.json`）、统一入口 `relay.ps1`、`relay-ask` 一条命令流水线、标签归属机制、浏览器脱离任务托管、重复标签清理、会话列表/切换。
- **v1（2026-09-23）**：打通浏览器控制、模型/推理强度/新建会话/上传能力实测。
