> 本文件复制自 `D:\lnu-seat` 工作区（原项目：控制工程教材分册流水线）。
> 文中出现的绝对路径（`D:\lnu-seat\...`、`G:\控制工程\...`、`results\...`）属于原项目，
> 在新工作区请按需替换；与本工具链无关的章节（教材流水线、PDF 切分）可忽略。
>
# 中转站（ns01.plusai.io）页面地图与结构记录

> 目的：把这几个"藏得比较深"的页面（设置子页、插件商店、开发者模式）的**入口、块结构、调用的后端接口**记下来，
> 便于以后快速定位、以及**用完复原**。
>
> 记录方式：全部为**只读勘察**（自动化 Edge 实例 `dsh-automation` 标签页，DOM 大纲 + 网络响应 + `fetch` 读接口）。
> 核对时间：2026-10-09。站点更新后结构可能变。

---

## 0. 站点本质

| 项 | 结论 |
|---|---|
| 前端 | **ChatGPT 网页前端**（页面 title = `ChatGPT`） |
| 后端 | **`/backend-api/*` 反代**；只有 `/dash/api/user/subscriptions` 是 plusai 自己的计费 |
| 账号 | 缓存/接口里读到 `plan_type: pro`（seats 1/1）与 `plan_type: plus`；侧栏品牌为 `PlusAI Pro` |
| 关键含义 | 它的功能上限 = **ChatGPT 官方前端能力** ∩ **反代放行了哪些接口** ∩ **池子账号的计划与开关** |

## 1. 路由地图（含深链）

| 页面 | 深链 | 说明 |
|---|---|---|
| 主页/新对话 | `/` | 正常入口 |
| 设置 · 常规 | `/#settings/General` | 侧栏第一项 |
| 设置 · 数据管理 | `/#settings/DataControls` | 含"删除所有对话" |
| 设置 · 快捷键 | `/#settings/Shortcuts` | — |
| **设置 · 插件** | `/#settings/Plugins` | 已装插件列表 + `权限` + `浏览插件` + `开发者模式` 三个入口 |
| 设置 · 插件权限 | `/#settings/Plugins/permissions` | 三档单选（始终询问 / 允许读取 / 允许低风险操作） |
| **设置 · 安全（开发者模式所在页）** | `/#settings/Security?section=developer-mode` | 高级安全设置：高级账户安全、锁定模式、**开发者模式**、开发者模式下强制 CSP、通过 ChatGPT 安全登录、Codex 设备码授权 |
| **插件商店** | `/plugins` | 顶部 tab：`插件` / `技能`（`/skills`）；分区：已安装 / 热门 / 新品推荐 / 小型企业 |
| 单个插件详情 | `/plugins/<plugin_id>` | 例：`/plugins/plugin_asdk_app_6a057d268ebc819…`（Remote Desktop Commander） |

> **为什么感觉"隐藏"**：`/plugins`、`/#settings/Security?…` 都是**前端路由**——直接访问 `/plugins` 会返回
> `{"detail":"Not Found"}`（服务端没有这条路由），必须**从设置里点进去**才会渲染。

## 2. 页面块结构

### 2.1 设置面板（所有设置页共用外壳）

```
ROOT <div[role=dialog]>
  <button aria-label="关闭">
  <input[role=searchbox] aria-label="搜索设置" name="settings-search">
  <section>…当前页主体…</section>
```

侧栏导航项（实测只有这些）：`常规`、`数据管理`、`快捷键`，进入插件页后多出 `插件` 分组。

### 2.2 设置 · 插件 `/#settings/Plugins`

```
<dialog>
  <input[role=searchbox]>
  <section><h3>已安装的插件</h3>
    <button>×12   ← 每个已装插件一行：Default templates / Demos / Documents / Onboarding /
                     Pages / PDF / Pets / Plugin Management / Presentations / Sites /
                     Spreadsheets / Template Creator
  </section>
  <a href="/plugins">               “浏览插件”
  <a href="/#settings/Security?section=developer-mo…">  “开发者模式”
```

### 2.3 设置 · 安全（开发者模式页）

```
<dialog>
  <input[role=searchbox]>
  <section> 高级账户安全           <button[role=switch]>            + 了解更多
  <section> 锁定模式               <button[role=switch]>            + 了解更多
  <section> 开发者模式 / 开发人员模式 / “高风险”
            <a href="https://platform.openai.com/docs/mcp#ris…">“了解更多”   ← 官方 MCP 文档链接
            <button[role=switch] aria-label="开发人员模式" aria-checked="false">
            <button[role=switch] aria-label="在开发者模式下强制执行 CSP" aria-checked="false">
            <a href="https://developers.openai.com/apps-sdk/b…">“了解更多”
  <section> 通过 ChatGPT 安全登录   <button[role=switch]>
  <section> 为 Codex 启用设备代码授权 <button[role=switch]>
```

**页面上的原文（开发者模式行）**：
> 允许你添加未经验证的连接器，这些连接器可能会永久性地修改或删除数据。需自行承担使用风险。

### 2.4 插件商店 `/plugins`

```
<main>
  <nav aria-label="目录类型"><div[role=tablist]>
      <a[role=tab] href="/plugins">“插件”</a>
      <a[role=tab] href="/skills">“技能”</a>
  <h1>“插件”
  <input aria-label="搜索插件" name="plugin-search">
  <section> 已安装：Default templates / Pages / Plugin Management / Template Creator / Pets
            + <a href="/plugins#settings/Plugins">管理
  <section> 热门：Gmail / **Remote Desktop Commander** / Google Drive / Flaim Fantasy / WPVibe /
                 GitHub / Adobe / Meetings (Beta) / Shopify / tldraw / MagicPath / Canva …
            <a href="/plugins?category=featured">查看全部
  <section> 新品推荐   <a href="/plugins?category=new-and-noteworthy">
  <section> 小型企业：Dropbox / Intuit QuickBooks / HubSpot / Stripe / Gusto / Firecrawl …
```

每个卡片 = `<a aria-label="打开 <名字>" href="/plugins/<plugin_id>">` + 一个 `<button>`（安装/更多）。
`plugin_id` 前缀有两种：`plugin_connector_1p_*`（OpenAI 一方连接器）与 `plugin_asdk_app_*`（Apps SDK 应用）。

### 2.5 设置 · 插件 · 权限

```
<dialog>
  <h2>“权限”
  <button[role=radio] aria-checked="false"> + <label>   始终询问
  <button[role=radio] aria-checked="false"> + <label>   允许读取
  <button[role=radio] aria-checked="true">  + <label>   允许低风险操作   ← 实测当前值
  <a href="https://help.openai.com/en/articles/1148…">“了解更多”
```

## 3. 这些页面调用的后端接口（实测状态码）

| 接口 | 状态 | 用途 |
|---|---|---|
| `GET /backend-api/settings/user` | 200 | 用户设置；`beta_settings` 共 43 项 |
| `GET /backend-api/accounts/security_settings/info` | 200 | 安全设置（只含 `advanced_protection_mode_enabled` / `login_notification_mode` / `aas_eligible`） |
| `GET /backend-api/ps/plugins/installed?limit=1000` | 200 | 已装插件列表 |
| `GET /backend-api/apps/sources_dropdown` | 200 | 应用来源下拉 |
| `GET /backend-api/apps/content?detail=full` | 200 | 应用商店内容 |
| `POST /backend-api/aip/connectors/links/list_accessible` | 200 | **连接器可访问列表** |
| `GET /backend-api/system_hints?mode=plugins&suggestions=true` | 200 | 插件页提示 |
| `PATCH /backend-api/settings/account_user_setting?feature=developer_mode&value=true` | **200（但不生效）** | 见下节 |
| `GET /backend-api/accounts/mfa_info`、`/accounts/sessions`、`/trusted_contact/enabled` | 404 | 反代未放行 → 页面顶部出现"无法获取你的部分安全设置" |

`beta_settings` 里与本话题相关的：`plugins=true`、`app_pairing=true`、`agent_mode=true`、
`deep_research=true`、`code_interpreter=true`、`context_connector_*=true/false`、**`developer_mode=false`**。

## 4. 关键结论：开发者模式**开不了**（实测）

复验流程与结果（脚本 [relay-devmode-verify.mjs](relay-devmode-verify.mjs)）：

| 步骤 | 结果 |
|---|---|
| 点击前：`GET /backend-api/settings/user` | `developer_mode=false`，UI `aria-checked=false` |
| 点开关（真实鼠标 + 页内派发各一次） | 发出 `PATCH …feature=developer_mode&value=true`，**HTTP 200**，响应体 `{"developer_mode":true}` |
| 点击后立刻 `GET` | **仍是 `false`** |
| 重新加载页面后再 `GET` | **仍是 `false`** |
| 在"对话上下文里"再试（新对话 → 发「你好」→ 拿到回复 → 会话内点开关） | **仍是 `false`**（点完、回会话、再聊一句，都是 `false`） |

> "先跟 GPT 聊一句、在指定会话里操作"这个思路实测**不成立**（脚本 [relay-devmode-inchat3.mjs](relay-devmode-inchat3.mjs)：
> 会话里已有 4 条消息时点开关，`aria-checked` 不变、服务端值不变）。会话页里 Sidebar 是隐藏的，
> 只能靠 `会话URL + #settings/Security?section=developer-mode` 进设置。

→ 反代对这条 PATCH 返回的是**成功假象**，服务端并未应用；且 `security_settings/info` 里根本没有
developer-mode 字段。**结论：站点锁死了开发者模式，用户无法给池子账号添加自定义 MCP 连接器。**

因此自建的 `https://mcp.milistone.me/mcp/<key>` **接不进这个站**；但我们的 MCP 本身对
本地客户端（DSH / Claude / Cline）和真 ChatGPT 账号（Business / Enterprise / Edu / Pro 只读）仍然可用。

## 5. 可用的另一条路：商店里的现成插件

商店里就有 **Remote Desktop Commander**（`/plugins/plugin_asdk_app_6a057d268ebc81919918d37eec718425`，
描述 "Build and automate, anywhere"）——它是第三方云 MCP + 本机 agent 的打包方案，功能覆盖
读文件 / 写文件 / 终端 / 进程。走这条路**不需要开发者模式**，但需要：

1. 在商店里"打开"它（会在账号的已安装列表里出现，**对池子账号可见**）；
2. 在本机跑它的 agent 并完成配对（`npx @wonderwhy-er/desktop-commander@latest remote`）。

### 5.1 实测：装不上（反代令牌被拒）

点详情页的「安装插件」→ 弹窗 **"无法加载连接器 / 重试，或取消并返回上一页"**，已安装列表不变。
抓到的请求（脚本 [relay-plugin-install-diag.mjs](relay-plugin-install-diag.mjs)）：

```
POST 200 /backend-api/aip/connectors/batch                      {"connectors":[]}
GET  401 /backend-api/aip/connectors/asdk_app_6a057d…/mfa_requirement
         {"detail":"Could not parse your authentication token. Please try signing in again."}
```

点「重试」两次同样 401。**根因：反代给这个 aip 接口的令牌被判无效**（和开发者模式开不了是同一类问题——
站点只在部分 `backend-api` 路径上是真的通的）。→ **第三方插件在站内装不上，RDC 这条路当前不可用。**

### 5.2 实测：对话里能不能用

| 模型 | 结果 |
|---|---|
| 5.6 Sol 极高 | 直接回答"没有可调用的 Remote Desktop Commander" |
| **GPT-6 极高** | 会**渲染一张卡片按钮**（DOM 里是 `<button>`，文案 **「打开目录」**，属于"ChatGPT 应用目录"）；同一条回复里模型自己写着"**因为没有找到对应插件，暂时无法提供它的专属安装或连接按钮**"。点它页面不跳转 |

**为什么卡片只是"目录"而不是"安装"**（服务端状态，实测）：

```
GET 200 /backend-api/apps/sources_dropdown
  {"entities":{"access_sources":{}} , …"capabilities":{"connect_more":"hidden", "web_search":"implicit"}}
POST 200 /backend-api/aip/connectors/links/list_accessible
  {"links":[{"access_list":[], …}]}          ← 没有任何已授权的应用
```

`access_sources` 为空 + `connect_more: hidden` → **该账号没有开通任何第三方应用来源**，所以模型拿不到可连接的
应用，只能给一个"去目录里找"的卡片；而目录里那条真正的安装路径是坏的（见 5.1 的 401）。

顺带测出计费信息：切到 **GPT-6 Pro** 发消息 → `POST /backend-api/f/conversation` **429 积分不足**
（"模型 gpt-6-pro 需要 75.0 积分…当前余额 1.09 元，费率 0.018，需要 1.3500 元"）。**GPT-6 本身可用**（一次回复约 50–61 秒）。

### 5.3 结论（两条路径都已验证堵死）

| 路径 | 结果 |
|---|---|
| 商店详情页「安装插件」 | 弹 **"无法加载连接器"**（自动重试 3 次均同） |
| **对话内联卡片的「安装」** | **同一个"无法加载连接器"**（用户手动点击确认） |
| 底层原因 | `GET /backend-api/aip/connectors/asdk_app_…/mfa_requirement` → **401** `Could not parse your authentication token. Please try signing in again.` |

**卡片是什么**：只有模型真正发起"插件请求"时前端才瞬间渲染（对话里表现为 `@ ChatGPT 需要使用一个插件` + `以后再说 / 安装`），
**不随会话保存**（事后打开会话只剩一个 "Browse and add plugins to ChatGPT" 引用标签）。
触发话术：`帮我找 <插件名> 这个插件，在你的商店里应该`（用"检查能不能连接"那种问法不会触发）。
但即使卡片出现，点「安装」仍然撞上同一个 401 —— 因为 `apps/sources_dropdown` 里
`access_sources: {}` + `connect_more: "hidden"`，这个账号没有第三方应用连接能力。

→ **要靠那个站的 GPT 摸本机文件，站点侧无解**（① 自定义 MCP：开发者模式锁死；② 商店第三方插件：aip 接口 401）。
可行的替代：**把文件作为附件上传**（模型能读，无需授权）；或用**真 ChatGPT 账号**接
`https://mcp.milistone.me/mcp/<key>`（Pro 只读 / Business 起可写）或装 RDC + 本地 `npx … remote` 配对。

⚠️ 安全与"别惹站长"注意：
- 它是**第三方云服务**，你的文件/终端访问要经过它的服务器；
- 装到池子账号上意味着**该账号的使用者都能看到这个已装插件**；
- 配对成功后，本机就对该服务开放了读写与终端能力。

## 6. 用完复原清单（Checklist）

| 项 | 怎么核对 | 期望值 |
|---|---|---|
| 开发者模式 | `GET /backend-api/settings/user` → `beta_settings.developer_mode` | `false`（本站在此值上本来就锁死，无需复原） |
| 插件权限 | `#settings/Plugins/permissions` | 改动前原值（实测为`允许低风险操作`；若你改过，改回） |
| 已安装插件 | 商店"已安装"分区 / `GET /backend-api/ps/plugins/installed` | 只应是你自己装的；**不要留测试插件** |
| 设置面板 | `document.querySelectorAll('[role=dialog]')` 可见数 | `0`（点"关闭"或按 Esc） |
| 输入框/附件 | 输入框文本、附件贴片数 | 空（可 `relay.ps1 clean`） |
| 会话 | 是否在别人的会话里发过东西 | 不应有；自动化只在**新对话**页操作 |
| **测试会话** | `node tools\relay-delete-chats.mjs`（先 dry-run 看表） | 自动化建的会话全部删掉；白名单在 [mine-chats.json](mine-chats.json) |
| 标签页 | `relay.ps1 status` | 只动 `dsh-automation` 标记页 |
| 下线浏览器 | `relay.ps1 down` | **用完即关**（用户明确要求） |

> 关于"留痕"：**页面访问本身在服务端一定留有请求日志**，这个我改不了，也不该想办法去掩盖；
> 能保证的是**不产生状态变更**（本次勘察除了一次未生效的 dev-mode PATCH 外，没有安装、没有改设置、没有发消息）。
> 建议：这类勘察尽量少做、做完就把浏览器实例关掉。

## 7. 本次用到的只读探针脚本

| 脚本 | 作用 |
|---|---|
| [relay-site-probe.mjs](relay-site-probe.mjs) | 打开站点，dump 标题/可点元素/关键词 |
| [relay-menu-probe.mjs](relay-menu-probe.mjs) | 打开侧栏与个人资料菜单，dump 菜单项 |
| [relay-settings-map.mjs](relay-settings-map.mjs) | 扫设置各路由 |
| [relay-plugins-probe.mjs](relay-plugins-probe.mjs) | 插件页与开发者模式入口 |
| [relay-devmode-toggle.mjs](relay-devmode-toggle.mjs) | 枚举本页 switch 并（可选）点击 |
| [relay-devmode-verify.mjs](relay-devmode-verify.mjs) | 复验 developer_mode 是否持久化 |
| [relay-connector-status.mjs](relay-connector-status.mjs) | 读 `settings/user` 与商店 |
| [relay-ui-survey.mjs](relay-ui-survey.mjs) | 按块 dump 各页结构 + 收尾复原 |
| [relay-probe-frontend.mjs](relay-probe-frontend.mjs) | **离线**扫 Edge 缓存里的前端 JS（不用联网/代理） |
