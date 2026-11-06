# relay-kit — 中转站（ns01.plusai.io）浏览器自动化工具包

把「独立 Edge 实例 + CDP + 标记标签页」这套自动化，从原工作区（`D:\lnu-seat`，控制工程教材流水线）
抽出来做成**可直接搬到新工作区**的一包：33 个脚本（32 个 `.mjs` + `relay.ps1`）+ 3 份文档 + 2 个空配置模板，
外加一个**新环境自检** `relay-doctor.mjs`。

> 适用：需要脚本化地驱动 ChatGPT 克隆/中转站（新建会话、选模型/推理强度、传附件、取回答、
> 收发批量任务、下载产物、清理会话），且**不能影响用户自己开着的浏览器**。

---

## 1. 结构

```
relay-kit/
├─ README.md              ← 你正在看的（安装 + 命令 + 铁律）
├─ SUMMARY.md             ← 浓缩总结：架构 / 能力 / 20 个坑 / 站点结论
├─ AGENTS-snippet.md      ← 粘到新工作区 AGENTS.md 的片段（改路径即可）
├─ docs/
│   ├─ RELAY.md           ← 原始主文档（速览 + 全部命令 + 教材流水线章节）
│   ├─ RELAY-RUNBOOK.md   ← 实测细节：选择器清单、菜单结构、证据
│   └─ SITE-UI-MAP.md     ← 站点隐藏页地图：设置子页/插件商店/开发者模式 + 接口状态码
└─ tools/                 ← 33 个脚本（.mjs + relay.ps1），依赖关系已闭环
    ├─ relay.ps1          ← 统一入口
    ├─ relay-doctor.mjs   ← **新环境自检**：配置路径 / playwright-core / 端点 / 站点可达
    ├─ relay.config.json  ← 配置（**必须改**：把 YOUR-WORKSPACE 换成真实路径）
    ├─ mine-chats.json    ← 会话删除白名单（空模板）
    └─ …
```

## 2. 五分钟接入

```powershell
# ① 把 relay-kit/tools 整个复制到新工作区，例如 D:\new-work\tools
Copy-Item .\relay-kit\tools D:\new-work\tools -Recurse

# ② 安装 playwright-core（只需要它做 CDP 连接，**不用下载浏览器**）
cd D:\new-work; npm init -y; npm install playwright-core

# ③ 改 tools\relay.config.json 里 4 个路径：
#    profileDir        = D:\new-work\.edge-ai      （独立配置目录，登录态存这里）
#    playwrightCorePath= D:\new-work\node_modules\playwright-core
#    workspace         = D:\new-work
#    tempDir / screenshotDir 同工作区下

# ④ 启动（必须在**有权限**的终端里，不能是受限沙箱）
pwsh -NoProfile -File D:\new-work\tools\relay.ps1 up

# ⑤ 自检：看清标签归属（mine=true 才是我们的）
pwsh -NoProfile -File D:\new-work\tools\relay.ps1 status
```

第一次 `up` 会用**独立配置目录**打开 Edge（等于一个全新浏览器），需要**手动登录一次**站点，之后免登录。

## 3. 常用命令

| 命令 | 作用 |
|---|---|
| `relay.ps1 status` | 浏览器状态 + 逐标签归属（`mine=true/false`） |
| `node tools\relay-doctor.mjs` | **新环境先跑这个**：一条命令查完路径/依赖/端点/站点（占位配置会报 FAIL，属正常） |
| `relay.ps1 up` / `down` | 启动（幂等）/ **只关闭本实例**（浏览器级 CDP，不动用户 Edge） |
| `relay.ps1 ask --new --message "…"` | 新会话提问，自动套 `defaultModel`/`defaultEffort` |
| `relay.ps1 ask --chat <url> --message "…"` | 在指定会话追问 |
| `relay.ps1 ask … --model "GPT-6 Pro" --effort 高 --file <path> --shot --json` | 指定模型/强度/附件/截图/JSON |
| `relay.ps1 chats [--find 词] [--open N]` | 列会话 / 查找 / 切到第 N 个 |
| `relay.ps1 chips` / `model --model X --effort Y` | 查 / 改模型与推理强度 |
| `relay.ps1 upload <file> --remove` | 只测附件上传+移除 |
| `relay.ps1 clean` | 清掉 composer 里残留附件 |
| `relay.ps1 tabs` / `prune [--apply]` | 标签只读诊断 / 重复标签清理（默认 dry-run） |
| `node tools\relay-conv-json.mjs --chat <url> --save out.json` | **取会话原始 JSON**（校验回答、找附件的权威手段） |
| `node tools\relay-read.mjs --chat <url> [--reload]` | 只读复查某会话最后一条回答 |
| `node tools\relay-recover.mjs --id …` | 断线恢复：刷新会话取回服务端补完的答案 |
| `node tools\relay-delete-chats.mjs [--yes]` | 按**白名单**删自动化会话（默认 dry-run，禁止按序号删） |
| `node tools\relay-grab.mjs` / `relay-artifacts.mjs` / `relay-fetch-artifacts.mjs` | 抓会话产物（附件下载） |
| `node tools\relay-batch.mjs --plan plan.json` / `relay-followup.mjs --ids …` | 批量跑任务 / 定向追问 |
| `node tools\relay-site-probe.mjs --url …` | 站点只读勘察（dump 可点元素/正文/关键词） |
| `node tools\relay-tabs-shots.mjs` | 逐标签只读截图（排查"卡片/弹窗在哪"最快） |
| `node tools\relay-probe-frontend.mjs` | **离线**扫 Edge 缓存里的前端 JS（不联网判断站点有没有某功能） |

## 4. 铁律（违反会伤到用户，原工作区真的发生过）

1. **只操作带标记的标签页**：`window.name === 'dsh-automation'`。其余标签属于用户，**不导航、不输入、不关闭**。
2. **禁止按进程名杀进程**。`Get-Process msedge | Stop-Process` 会连用户自己的浏览器一起关掉。
   关本实例只用 `relay.ps1 down`。
3. **不要给浏览器加"到点自动退出"的保活任务，也不要自动关它**。它由 WMI 创建、已脱离任务进程树；
   反向也会出事——任务结束带走用户正在工作的窗口（历史事故）。
4. **启动必须在沙箱外**：受限沙箱禁止命名管道，Chromium 直接 `FATAL:mojo platform_channel ... 拒绝访问`。
   观察/提问类命令普通权限即可。

## 5. 已知限制（省得你重复踩）

- 站点是**内网 fake-IP 解析 + 必须走本机代理**；关掉代理 → 403 / 解析不到。
- 站点改版会让选择器失效（`RELAY-RUNBOOK.md` 里有当前选择器清单与"必须锚定"的教训）。
- 无官方 API：一切靠 UI 自动化，**慢**（`极高` 强度一次简短问答实测约 207 秒）。
- 回答用 `innerText` 取回，**Markdown 代码围栏/表格会被压平**；要原文得走"复制回复"读剪贴板。
- 该站**不能**挂自定义 MCP、也**装不上**第三方插件（详见 `docs/SITE-UI-MAP.md` 第 4/5 节：
  开发者模式被锁死、`aip/connectors/*` 返回 401）。

## 6. 建议的阅读顺序

1. 本文件（安装 + 命令）
2. [SUMMARY.md](SUMMARY.md)（一次看懂架构、能力边界、20 个坑）
3. [AGENTS-snippet.md](AGENTS-snippet.md) → 粘进新工作区的 `AGENTS.md`，让新会话直接守规矩
4. 遇到具体症状再查 [docs/RELAY-RUNBOOK.md](docs/RELAY-RUNBOOK.md) / [docs/SITE-UI-MAP.md](docs/SITE-UI-MAP.md)
