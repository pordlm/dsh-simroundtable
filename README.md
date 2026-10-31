# dsh-simroundtable

[English summary](#english-summary) · [GPL-3.0 License](LICENSE)

> 一个 **DeepSeek Harness（DSH）** 圆桌讨论插件：把不同 provider 的模型请到同一张桌子上——先各自独立作答，再互相修订，匿名评审后由裁决模型给出最终答案。
>
> 三种入口：会话命令 `/roundtable`、模型工具 `roundtable`、Web 左栏独立页面「圆桌会议」。

---

## 它做什么

一场圆桌固定四步：

1. **独立作答**：每个作答模型只拿到同一个话题，彼此看不到对方的回答。
2. **互评修订**（0–N 轮，可选）：每轮把所有答案匿名发给每个作答模型，各自重写自己的答案；看不到作者与 provider。
3. **匿名评审**：评审模型只看到 `答案 A/B/C…`，输出结构化排名，以及共识 / 矛盾 / 盲点。
4. **裁决**：裁决模型综合全部答案与评审意见，输出最终 Markdown。

每个参与者都是一个**全新的子 Agent**，通过 `agentOptions: { provider, model, maxTokens }` 显式指定路由，因此同一桌可以混用任意已注册 provider 的模型。子 Agent 默认只被允许 `web_search` / `web_fetch`，不会继承 `write` / `edit` / `subagent` 等工具。

结果里始终保留：全部答案、聚合排名、共识/矛盾/盲点、最终答案，以及**失败与降级说明**（自评、单 provider、自动裁决等），不做粉饰。

---

## 环境要求

- DSH `>= 0.2.1-rc.4`，使用 `web` profile（页面入口依赖 Web 客户端槽位）。
- Node.js `>= 20`。
- 至少 2 个可用模型；同 provider 也可以，但跨 provider 更能暴露分歧。

## 安装

```powershell
# 1. 克隆到任意目录（下面以 D:\plugins 为例）
git clone https://github.com/pordlm/dsh-simroundtable.git D:\plugins\dsh-simroundtable

# 2a. 在 DSH 会话里用插件管理工具安装本地目录（需要 danger-full-access 审批）
plugin_manager install_bundle "D:\plugins\dsh-simroundtable"

# 2b. 或手动装进当前 profile
cd "$env:USERPROFILE\.dsh\profiles\web"
pnpm add "file:D:\plugins\dsh-simroundtable"

# 3. 确认已登记
plugin_manager list_plugins
```

安装后，先在官方「插件」页把 `dsh-simroundtable` 的开关**关一次再开**：宿主半边（命令、工具、`/api/roundtable/*`）会随官方热重载进入正在运行的进程。

> **客户端半边没有出现？** 少数实例里，上游 `dsh-client-modules` 会把“进程内首次启用”时的瞬时包解析失败永久缓存成 `null`（没有失效逻辑），左栏入口与页面因此不会被组合。这时**完整退出并重开一次 DSH** 即可；之后升级同样先试关→开，没有再重启。

---

## 使用

### 1. 独立页面（推荐）

左栏「圆桌会议」→ 主区域 `roundtable` 页面。它不绑定当前会话：

| 区域 | 能力 |
|---|---|
| 工作区 | 从 `GET /workspaces` 读取，会议记录落在所选工作区的 `.roundtable/` |
| 议题附件 | 图片给支持图片输入的模型，代码/表格/文档等文本文件内联进提示词；最多 8 个、单文件 8 MB |
| 阵容 | 从 `GET /catalog` 读取全部 provider/模型；作答 2–8 个（默认每个 provider 一个）、评审 1–8 个（默认 = 作答者）、裁决 1 个（默认第一位作答者） |
| 轮次 | 讨论 0–`maxRounds` 轮（默认 1） |
| 进度 | 阶段条 + 成员状态 + 实时记录（默认 1.2 s 轮询，连续失败后停止） |
| 舞台 | 会议详情页顶部的长桌 Live2D 舞台：按作答成员排座，谁在发言谁切统一动作并弹出回答摘要气泡，点铭牌可换人查看 |
| 结果 | 最终答案置顶，可展开答案、讨论、匿名评审、排名表、失败/限制 |
| 历史 | 列表 + 详情；页面刷新或宿主重启后仍可打开 |
| 操作 | 取消进行中的会议、导出 Markdown |

### 2. 会话命令

- `/roundtable`：弹出选择卡，话题也在卡里填写。
- `/roundtable 你的话题`：跳过话题卡，只选阵容与轮次。

命令结果在会话里按普通 Markdown 正文渲染（`conversation.chat.commandview`），不会塞进默认的命令卡片。

### 3. 模型工具

`roundtable` 工具供 Agent 自行发起一场圆桌，参数与页面一致（话题、作答/评审/裁决模型、轮数）。

### 4. 议题附件

议题卡下方可以附加图片或文本类文件（代码、表格、Markdown、JSON、CSV、纯文本等）。分发规则：

| 附件类型 | 谁收到 | 形式 |
|---|---|---|
| 图片（PNG/JPEG/WebP/GIF） | 只发给**声明了图片输入**的作答者与裁决模型 | `image` 内容块 |
| 文本文件 | 所有作答者与裁决模型 | 解码后按字符预算内联进提示词，带文件名围栏 |

- 页面会先用 `GET /api/roundtable/capabilities` 查每个已选模型的能力；确认不支持图片的模型会被点名提示「只收到文本」。
- 能力未知（provider 没有声明 `inputModalities`）时按“可能支持”处理并照常发送；只有当路由**显式声明**为纯文本时才会跳过图片，并在结果 `limitations` 里记录被跳过的模型。
- 上传先落在 `<workspace>/.roundtable/uploads/<uploadId>/`，会议创建时才搬进 `<workspace>/.roundtable/attachments/<meetingId>/`；取消或没开始不会留下半套会议。
- 文本文件按 `attachmentTextCharsPerFile` / `attachmentTextCharsTotal` 截断，截断与省略都会写进 `limitations`，不会静默丢内容。
- 评审阶段不附带附件：评审看到的是各家的答案文本，避免评审因为图片数量不同而偏袒。

---

## 导出与持久化

- **会议记录**：`<workspace>/.roundtable/<meeting-id>.json`，原子写入；运行中的会议在宿主重启后标记为 `interrupted`，不会伪装成完成。
- **导出顺序**（逐级回退）：
  1. 同源 `GET /api/roundtable/meeting/export` 触发浏览器下载；
  2. 系统保存对话框（5 s 内未 settle 视为不可用，避免无限等待）；
  3. 服务端写入 `<workspace>/.roundtable/exports/roundtable-<id>.md`，返回实际路径与字节数；
  4. 全失败时在页面展示只读 Markdown + 复制按钮，保证内容不丢。
- 同一工作区并发会议数受 `maxConcurrentMeetings` 限制，超出直接报错而不是排队。

---

## 配置

默认值写在 `cordis.patch.yml`，也可以在插件配置里覆盖：

| 键 | 默认值 | 说明 |
|---|---|---|
| `answerMaxTokens` | `16384` | 单次作答/修订的输出上限 |
| `reviewMaxTokens` | `16384` | 单次评审的输出上限 |
| `arbiterMaxTokens` | `16384` | 裁决输出上限 |
| `childTimeoutMs` | `300000` | 单个子 Agent 的超时（5 分钟） |
| `runTimeoutMs` | `900000` | 整场圆桌的超时（15 分钟） |
| `catalogTimeoutMs` | `20000` | 查询单个 provider 模型目录的超时；各 provider 并发查询 |
| `subagentProvider` | `spawn` | 子 Agent provider；要求不继承父上下文、支持 `agentOptions` |
| `maxConcurrentChildren` | `4` | 同时运行的子 Agent 上限 |
| `maxAnswerChars` | `12000` | 注入评审/裁决提示词的答案截断长度 |
| `stageInputChars` | `8000` | 讨论/评审/裁决阶段单条答案的截断长度 |
| `maxRounds` | `5` | 页面允许的最大讨论轮数（命令仍限 0–2） |
| `maxConcurrentMeetings` | `3` | 同一工作区同时进行的会议数上限 |
| `meetingHistoryLimit` | `100` | 历史列表最多返回的条数 |
| `attachmentMaxFiles` | `8` | 每场会议最多附件数（0 关闭附件） |
| `attachmentMaxFileBytes` | `8388608` | 单个附件上限（8 MB） |
| `attachmentMaxTotalBytes` | `25165824` | 一次上传合计上限（24 MB） |
| `attachmentTextCharsPerFile` | `20000` | 单个文本文件内联进提示词的最大字符数 |
| `attachmentTextCharsTotal` | `60000` | 所有文本文件合计内联字符数 |
| `language` | `auto` | `auto` 跟随 Web locale；也可强制 `zh` / `en` |

> 推理型模型会先花 completion 预算“思考”。`*MaxTokens` 建议保持 ≥ 4096；预算过小可能出现空回复，插件会做重试与降级，但质量会下降。

---

## HTTP API

页面与宿主之间的接口都是 Connection 的**精确 Fetch 路由**（不支持动态段，因此详情用查询参数），统一信封：

```json
{ "ok": true, "data": {} }
{ "ok": false, "error": { "code": "meeting-not-found", "message": "…" } }
```

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/roundtable/workspaces` | 工作区列表 |
| GET | `/api/roundtable/catalog` | provider/模型目录（并发查询、单 provider 超时不影响整体） |
| GET | `/api/roundtable/meetings?workspace=` | 历史列表 |
| POST | `/api/roundtable/meetings` | 创建并启动一场会议；`attachments` 传上传返回的 id |
| POST | `/api/roundtable/upload` | 上传附件（base64 JSON，返回 `{attachments, limits}`） |
| POST | `/api/roundtable/upload/remove` | 撤回尚未启动的上传 |
| GET | `/api/roundtable/capabilities?provider=&model=` | 该路由是否声明了图片输入（`image: true/false/null`） |
| GET | `/api/roundtable/meeting?id=` | 会议详情（含进度、记录、评审、终稿） |
| POST | `/api/roundtable/meeting/cancel` | 取消进行中的会议 |
| GET/POST | `/api/roundtable/meeting/export` | 导出 Markdown（GET 下载，POST 写工作区） |
| GET | `/api/roundtable/stage/model/model3.json` | 精简后的 Live2D 模型描述符（只留 Moc/Textures/Physics/EyeBlink） |
| GET | `/api/roundtable/stage/{vendor,art,model}/*` | 舞台静态资源：3 个运行时脚本、长桌/椅子贴图、`c_0120` 的 moc3/physics3/纹理 |

插件没有自己的静态目录 URL（`dsh-host-frontend-static` 只服务 SPA 自身），所以舞台素材由 `lib/stage.js` 逐条注册精确 Fetch 路由，二进制带 `cache-control: public, max-age=604800`，模型描述符带 `no-store`。

---

## 数据与隐私

- 会议记录、导出文件只落在**本机工作区**的 `.roundtable/`，不上传到任何第三方服务。
- 议题附件同样只存本机：上传目录在会议创建时搬进 `.roundtable/attachments/`，不经过插件自己的服务器。
- 附件内容会随提示词发给你选择的模型 provider（文本被内联、图片作为 image 块），这是模型看到附件的唯一途径；不要在议题里附加不愿发给该 provider 的材料。
- 提示词只包含话题、答案与评审所需内容；provider 凭据由 Harness 管理，插件不读取也不记录。
- 子 Agent 的工具集被限制为 `web_search` / `web_fetch`，无法读写工作区文件。

---

## 设计说明与已知取舍

- **结构化输出优先**：评审与裁决优先走 `outputSchema`（`structured_output` 工具）；模型没调用时回退到“从文本里提取平衡 JSON 对象”。
- **排名先写**：评审要求先输出 `ranking`，再写评语，避免推理耗尽输出预算导致排名缺失。
- **截断可恢复**：回复被长度上限截断时，从文本里抢救已有投票并标注“已恢复排名”；漏掉的答案按面板顺序补全并标注“已归一化”。
- **失败不中止**：某个答案/评审/裁决失败会列在结果末尾；裁决失败时回退到聚合排名第一的答案。
- **诚实的限制**：评审模型可能同时是作答模型（自评），裁决模型也可能作答（偏向自己版本）——这些都以 `limitations` 明示，不隐藏。
- **精确路由**：`GET` 与 `POST` 共用 `/meetings` 一条注册；详情用 `?id=`，避免动态段。
- **附件按路由分发**：图片只发给声明图片输入的模型；同一个面板里纯文本模型与多模态模型可以共存，不会因为一个模型不支持图片就让整场会议失败。能力未声明时按“可试”处理，被显式拒绝才跳过并记入 `limitations`。
- **文本内联而非文件句柄**：圆桌子 Agent 的工具集只有 `web_search` / `web_fetch`，拿不到可读的 file handle，所以文本类附件在提示词里内联并做字符预算截断，图片走内容块。
- **客户端重载**：宿主半边可热重载；客户端半边在个别实例上受上游包解析负缓存影响，需要一次完整重启（见上文安装说明）。

### 与早期 council 插件的接口差异

本插件按 DSH 0.2 的接口实现，主要差异：

| 早期写法 | 本插件 |
|---|---|
| `ctx.settings.get("locale")` | `ctx.settings.describe()` 读 `locale.preference`，失败回退 `Intl` |
| `ctx.on("settings/updated", …)` | `ctx.on("settings/document-updated", (namespace) => …)` |
| `ctx.subagents.start({ … })` | `ctx.subagents.startActivation({ childId, delivery: "caller", signal, request })` |
| `provider.capabilities.toolFilter` | 在全局 `agent/created` 里对子 Agent 调用 `tools.restrict({ allow })` + `guard` |
| 仅命令结果 | 额外注册 `sidebar.panellist` / `main` / `conversation.chat.commandview` |

---

## 开发

```powershell
npm run check   # node --check 核心模块
npm test        # 5 个测试文件（配置、目录/排名/格式化、会议持久化、页面与 API、附件）
```

测试不依赖网络与真实凭据。手动真实模型探针位于 `test/manual/`，会消耗 token，默认不参与 `npm test`；配置方式见 [test/manual/README.md](test/manual/README.md)。

```text
lib/copy.js      中英文案 + locale 探测
lib/core.js      目录聚合、自动选桌、排名、格式化/导出、配置校验
lib/prompts.js   四阶段提示词 + 紧凑排名/纯文本裁决兜底 + JSON Schema
lib/engine.js    圆桌引擎：子 Agent 调度、四阶段流水线、事件钩子、失败降级
lib/attachments.js 议题附件：上传校验、落盘/迁移、文本内联预算、图片能力探测
lib/meetings.js  会议管理器：校验、落盘、进度、取消、崩溃恢复、导出
lib/api.js       /api/roundtable/* 路由 + JSON 信封
lib/index.js     插件 apply：命令、工具、生命周期接线
lib/client.js    独立页面 + 左栏入口 + commandview
```

---

## English summary

`dsh-simroundtable` is a DeepSeek Harness plugin that seats models from different providers at one table: independent answers → peer revision → anonymous review → a final arbiter. It ships as a `/roundtable` command, a `roundtable` model tool, and a dedicated Web page with live progress, history, cancellation and Markdown export. A meeting can carry topic attachments: images travel only to routes that declare image input, while code/tables/documents are inlined as bounded text for every participant. Meetings and attachments are persisted per workspace under `.roundtable/`; nothing leaves the machine except what the chosen providers receive.

Requires DSH `>= 0.2.1-rc.4` (web profile) and Node `>= 20`. Install the folder as a DSH bundle, then toggle the plugin off/on; if the Web entry does not appear, restart DSH once.

## License

本仓库采用**分层授权**（详见 [`NOTICE.md`](NOTICE.md)）：

| 范围 | 许可 |
| --- | --- |
| 代码（`lib/`、`test/`、配置文件等） | **GPL-3.0-or-later**，见 [`LICENSE`](LICENSE) |
| 模型素材（`assets/models/whale-girl/**`） | **CC BY-NC-SA 4.0**，署名 上善无形 / ZipZipPipe / 氵六青，见 [`LICENSE-ASSETS.md`](assets/models/whale-girl/LICENSE-ASSETS.md) |
| 第三方运行时（`assets/vendor/**`） | PIXI.js MIT · pixi-live2d-display MIT · Live2D Cubism Core 专有（可再分发） |

模型素材不属于 GPL 范围，作为独立作品随附；再分发时请同时保留 `LICENSE`、`NOTICE.md` 与素材的署名/非商业条款。`0.1.0`–`0.3.0` 曾以 MIT 发布，`0.4.0` 起代码改为 GPL-3.0-or-later。