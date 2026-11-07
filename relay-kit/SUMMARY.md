# SUMMARY — 中转站自动化：一次看懂

> 把原工作区（`D:\lnu-seat`）几周的实测结论压缩到一页。细节见 `docs/RELAY.md`、`docs/RELAY-RUNBOOK.md`、`docs/SITE-UI-MAP.md`。

## 1. 架构（一句话）

**一个独立 Edge 实例（独立配置目录 + CDP 9223）+ 只碰带标记的标签页 + 页内派发事件模拟真人操作 + 全部参数集中在一个 JSON 里。**

```
relay.ps1 up ──► WMI 创建 msedge.exe（脱离任务进程树）
                 --remote-debugging-port=9223 --user-data-dir=<独立目录>
                        │
relay-*.mjs ──► playwright-core.connectOverCDP(9223)
                        │  只选 window.name === 'dsh-automation' 的标签
                        ▼
              Chrome DevTools Protocol ──► 中转站页面
                        │
                        └─ 页内派发 pointerover/pointerdown/…/click（绕过浮层命中检测）
```

## 2. 三个"为什么不那么做"

| 决定 | 为什么 |
|---|---|
| **不按进程名杀进程** | `Get-Process msedge \| Stop-Process` 会把用户自己的 Edge 一起关掉（真实事故） |
| **不自动关闭浏览器** | 浏览器由 WMI 创建、已脱离任务进程树；早先用保活任务托管，到点把用户正在工作的窗口带走了 |
| **不用 `locator.click()`** | 站点自己的浮层会 `intercepts pointer events`；库内统一在页面里派发完整指针事件序列 |

## 3. 能力矩阵（实测）

| 能力 | 状态 | 备注 |
|---|---|---|
| 登录态复用 | ✅ | 独立配置目录持久化，跨重启免登录 |
| 新建会话 | ✅ | 侧栏有两个同名按钮，点**文字版**（图标版被遮挡） |
| 选模型 | ✅ | `Auto` / `GPT-5.6 Sol` / `GPT-6 Pro` / `GPT-5.6 Pro` / `更多模型` |
| 推理强度 | ✅ | `中` / `高` / `极高`，**按会话保存** |
| 上传附件 | ✅ | `input[type=file]` 直接 `setInputFiles`；模型能读到内容 |
| 读取回答 | ✅ | 文本稳定 + 无 stop-button + 复读校验 |
| 会话列表/切换 | ✅ | `chats` / `chats --open N` |
| 标签诊断/去重 | ✅ | `tabs` / `prune`（默认 dry-run） |
| 抓产物/附件 | ✅ | `relay-grab` / `relay-artifacts` / `relay-fetch-artifacts` |
| 批量任务 | ✅ | `relay-batch`（按 plan JSON）+ `relay-followup`（定向追问） |
| 断线恢复 | ✅ | `relay-recover`：刷新会话取回服务端补完的答案 |
| 删除会话 | ✅ 仅白名单 | 见 §7，**不提供按序号删** |

**延迟**：`极高` 强度一次简短问答约 **207 秒**；简单问答 12 秒级。要快就 `--effort 中`。

## 4. 站点速查（ns01.plusai.io）

| 事实 | 结论 |
|---|---|
| 本质 | **ChatGPT 网页前端 + `/backend-api/*` 反代**（只有 `/dash/api/user/subscriptions` 是它自己的计费） |
| 网络 | 内网 fake-IP，**必须走本机代理**；关代理 → 403 |
| 模型/强度 | 按会话保存；新会话默认 `GPT-5.6 Sol` + `中` |
| 计费 | 按积分/余额扣费；`GPT-6 Pro` 单次约 75 积分，余额不足会 `429 积分不足` |
| 插件商店 | 有（Gmail / GitHub / Remote Desktop Commander / Canva …），"已安装"列表可见 |
| 开发者模式 | **被锁死**：点开关发 `PATCH …feature=developer_mode&value=true` 返回 200，但 `GET settings/user` 里永远 `false` |
| 第三方插件安装 | **装不上**：`GET /backend-api/aip/connectors/<id>/mfa_requirement` → **401** `Could not parse your authentication token` |
| 账号能力 | `apps/sources_dropdown` 里 `access_sources: {}`、`connect_more: "hidden"` |
| 结论 | **不能挂自定义 MCP / 不能装第三方插件**；想让"远端 GPT 读本机文件"只能换真 ChatGPT 账号，或改用**附件上传** |

细节（路由深链、每页块结构、接口状态码）在 `docs/SITE-UI-MAP.md`。

## 5. 二十个坑（症状 → 原因 → 处理）

| # | 症状 | 原因 | 处理 |
|---|---|---|---|
| 1 | `connect ECONNREFUSED 127.0.0.1:9223` | 浏览器没跑 | `relay.ps1 up` |
| 2 | `FATAL:mojo platform_channel ... 拒绝访问` | 在受限沙箱里启动了 Chromium | 必须在沙箱外启动（`relay.ps1 up`） |
| 3 | `mkdtemp EPERM` | 临时目录不可写 | 配置里的 `tempDir` 自动接管；确认目录存在 |
| 4 | `... intercepts pointer events` | 站点浮层拦截点击 | 用库内页内派发，别退回 `locator.click()` |
| 5 | `composer form not found` | SPA 未就绪 | 等 composer；仍失败就 `chats --open` 换会话 |
| 6 | 附件留在草稿 | 上传后未发送 | `relay.ps1 clean` |
| 7 | 回答像没写完 | 长回答中途停顿 | 用复读校验；必要时 `--timeout` 加大 |
| 8 | 模型莫名变 `Auto` | 匹配式没锚定（历史 bug） | 所有模型匹配必须 `^` 锚定 |
| 9 | **「网络传输中断」横幅** | 流中断时站点插的提示，**不是答案**；且横幅触发的自动 reload 可能把**刚发出的消息整个吞掉**（`ask` 报 `delivered.ok=true` 也照吞，2026-11-07 连吞 2 条） | 发完必须 `relay-conv-json` 核对 user 消息与附件真的在会话里，不在就重发 |
| 10 | 解析回答里的 JSON 丢章 | 取"最后一个 `[`"会被正文方括号带偏 | 统一用 `tools/answer-parse.mjs` |
| 11 | 消息落进**别的会话** | 页面还没真正切到目标会话 | 发消息前校验 URL/会话标题 |
| 12 | 上传/提问 `429 Too Many Requests` | 站点限流（与文件大小无关） | 退避 ≥15 分钟；并发 ≤2–3、错开 30–60 秒 |
| 13 | 拿到的回答是**上一条** | 回复还没落定/串台 | 用 `relay-conv-json` 看 `assistant` 文本长度或附件字节数核对 |
| 14 | 抓到的附件是旧版 | 站点缓存/附件同名 | 让模型重发附件；按字节数比对 |
| 15 | `retry` / `{"status":"retry"}` | pod 回收 | 在会话里让模型重新产出附件 |
| 16 | `请求过于频繁，请N秒后重试` | 中转站限速 | 原命令隔 30–60 秒重发 |
| 17 | 命令全报 `windows-acl-run: --temp is not an existing directory: …\dsh-XXXX` | **DSH 自身**沙箱临时目录被清掉（与本工具无关） | 按报错路径新建该目录（需一次授权） |
| 18 | **导航一刷，瞬态卡片/弹窗就没了** | 站点某些 UI（如插件安装卡片）是**瞬时 DOM**，不随会话保存 | 排查时**只读扫描 + 截图 + 事件驱动点击**，别 `goto` |
| 19 | 开发者模式开关"点不动" | 站点返回 `PATCH 200` 假象，读回仍 `false` | 认定锁死，别反复试 |
| 20 | 第三方插件"无法加载连接器" | `aip/connectors/*` 401（令牌无法解析） | 站点侧问题，用户侧修不了 |
| 21 | 连续两次 `ask --new`，第二次**复用同一会话** | SPA 没真正回到新草稿就发了 | 发完用 `relay-conv-json` 核对会话 id 与 user 消息；不对就重发（2026-11-07 实录：一条表情编辑被发两遍进同一会话） |
| 22 | 图片生成 `reply: "正在处理图片…"`（7 字符）且 `replyMatchesPrompt ratio 0` | **误报**：图在服务端继续生成，回复抓不到 | 按 `relay-grab-imagegen --list` 出现新 `file_…` 为准；2026-11-07 实测双图 attach 慢（~2 分钟）但生成只要 1–2 分钟 |
| 23 | `relay-grab-imagegen` / `status` 报 `no tab marked dsh-automation`，但标签明明在 | 自动化标签重载后只剩 lane 1 名（`dsh-automation:1`），而这俩脚本只认精确 `dsh-automation`（lane 0 名） | 要么把该标签 `window.name` 改回 `dsh-automation`，要么全程带 `RELAY_TAB_INDEX=1`；开多条 lane 前先想清楚取件脚本认哪个名 |

## 6. 回答怎么"取准"（三条纪律）

1. **不要只看最后一次 `innerText`**：用 `relay-read --reload` 或 `relay-conv-json` 复核。
2. **JSON 一律走 `answer-parse.mjs`**：它会做括号匹配，不会被正文里的 `lg[1-x_o(t)]` 带偏。
3. **附件按字节数/文件名双重核对**：同名文件很容易拿到旧版。

## 7. 会话安全模型（删会话）

- 目标**只来自白名单**：`results/*.json` 里的 `chatUrl` + `tools/mine-chats.json` 的 `extraUrls`。
- **不提供按序号删除**——侧栏序号随删除变化，极易删错用户会话。
- 默认 `dry-run`，必须 `--yes`；删除时现场重新解析侧栏项并打印标题；删后复查 URL 是否消失。
- 用户的会话（标题可能和你的自动化会话**同名**）绝不要加进白名单。

## 8. 自检清单（新环境第一次跑）

```powershell
relay.ps1 status                      # 浏览器在不在 + 标签归属
relay.ps1 chips                       # 当前模型/强度
relay.ps1 ask --new --message "只回复 OK"   # 端到端一次（约 20-60 秒）
relay.ps1 chats                       # 能看到会话列表
relay.ps1 down                        # 收尾：只关本实例
```

## 9. 迁移 checklist

- [ ] `tools/` 整包复制；`relay.config.json` 改 **4 个路径**（`profileDir`/`playwrightCorePath`/`workspace`/`tempDir`+`screenshotDir`）
- [ ] `npm install playwright-core`（不用下浏览器）
- [ ] 首次 `up` 后**手动登录一次**站点（登录态存在 profileDir）
- [ ] 代理开着（站点是 fake-IP）
- [ ] `mine-chats.json` 保持空，只在确实需要删自己会话时加 URL
- [ ] 把 `AGENTS-snippet.md` 粘进新工作区 `AGENTS.md`
