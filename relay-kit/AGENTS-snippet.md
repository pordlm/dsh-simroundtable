# AGENTS.md 片段（粘到新工作区，替换 `<WORKSPACE>` 为真实路径）

```markdown
# 工作区说明

本工作区通过一个**独立的 Edge 实例**自动化操作 PlusAI 中转站（`ns01.plusai.io`，内网 fake-IP，需走本机代理）。
工具包来自 `relay-kit/`：`tools/relay.ps1` 是唯一入口，参数全在 `tools/relay.config.json`。

## 需要用到中转站 / 浏览器时，先做两步

1. 读 `relay-kit/README.md`（安装与命令）与 `relay-kit/SUMMARY.md`（坑与站点结论）；
   需要站点页面细节时查 `relay-kit/docs/SITE-UI-MAP.md`。
2. 用统一入口，不要自己拼 playwright 命令：

```powershell
pwsh -NoProfile -File <WORKSPACE>\tools\relay.ps1 status
pwsh -NoProfile -File <WORKSPACE>\tools\relay.ps1 ask --new --message "你的问题"
```

## 铁律（违反会伤到用户）

1. **只操作带标记的标签页**：`window.name === 'dsh-automation'`。其余标签属于用户，**不导航、不输入、不关闭**。
2. **禁止按进程名杀进程**（`Get-Process msedge | Stop-Process` 会关掉用户自己的浏览器）。
   关闭本实例只用 `relay.ps1 down`（浏览器级 CDP，只影响 9223 端口）。
3. **不要给浏览器加"到点自动退出"的保活任务，也不要自动关闭它**（曾因此关掉用户正在工作的窗口）。
4. **启动浏览器必须在沙箱外**：受限沙箱禁止命名管道，Chromium 会 `FATAL:mojo platform_channel`。
   观察/提问类命令普通权限即可。

## 已知事实（省得重新试）

- 模型与推理强度**按会话保存**；新会话默认 `GPT-5.6 Sol` + `中`。强度：`中`/`高`/`极高`；`极高` 一次简短问答约 207 秒。
- 回答用 `innerText` 取回，**Markdown 代码围栏/表格会被压平**；要原文得点"复制回复"读剪贴板。
- 站点浮层会拦 `click()`；库内统一页内派发事件，**不要退回 `locator.click()`**。
- **「网络传输中断」横幅不是答案**，要刷新会话取回（`relay-recover`）。
- 解析回答里的 JSON 一律用 `tools/answer-parse.mjs`，**不能取"最后一个 `[`"**。
- 发消息前必须确认页面**真在目标会话**，否则会落进上一个会话。
- **排查站点 UI 时不要导航**：有些卡片/弹窗是瞬时的，`goto`/刷新会直接销毁它们；用只读扫描 + 截图。
- 删除会话只用 `node tools\relay-delete-chats.mjs`（白名单 = `tools/mine-chats.json`，默认 dry-run，`--yes` 才删）。
  **禁止按侧栏序号删会话。**
- 该站**不能挂自定义 MCP、也装不上第三方插件**（开发者模式被锁死；`aip/connectors/*` 返回 401）。
  详见 `relay-kit/docs/SITE-UI-MAP.md` 第 4/5 节——别在这上面反复试。
- 若普通命令全部报 `windows-acl-run: --temp is not an existing directory: …\dsh-XXXX`，
  那是 **DSH 自身的沙箱临时目录被清掉**（与本工作区无关）：按报错路径新建该目录即可。
```
