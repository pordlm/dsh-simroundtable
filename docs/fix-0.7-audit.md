# fix-0.7-audit —「0.7修复.md」逐条核实

基准：本地 HEAD `53be21f`（release: 0.7.0），工作树干净（仅 2 个未跟踪 preview 脚本），与该文档审查的公开 main 同源。原文 1358 行只读副本已通读；本文逐条给出 file:line、代码摘录（≤3 行）、影响、最小修法与回归测试名。结论三分类：成立 / 不成立 / 源码不足以确认。

## 1)【P1】普通圆桌仍被前端强制送进 v2 —— **成立**

- 位置：`lib/client.js:967-987`
```js
if (s.personaBinding === "opt-in") {
  const participants = [];
  ...
  body.participants = participants;
  body.protocol = { id: "roundtable", version: 2 };
}
```
- 影响：`cordis.patch.yml` 默认 `personaBinding: opt-in`（宿主通告 Persona 能力即开启）。只要宿主开启 Persona，即使所有席位都选 None，前端也发 participants + protocol v2 → 无 Persona 的普通圆桌被强制走 v2（受 8 总席位上限、v2 阵容校验约束），违背「无 Persona → v1，有 Persona → v2」的既定策略。
- 最小修法：构造 participants 后检查 `const hasPersona = participants.some((seat) => typeof seat.personaId === "string" && seat.personaId !== "");`，仅 `hasPersona` 时才设置 `body.participants`/`body.protocol`（personaId 合法性后端 planV2 已校验 unknown→400，前端只判非空即可，无需重复校验归属）。
- 回归测试：`client.test.mjs` 新增 ①opt-in + 全 None → POST body 无 participants/protocol；②一个席位选 Persona → POST 含 participants+protocol v2；③binding off → 请求结构与旧版一致。

## 2)【P2】checkpoint degraded 未接通 —— **成立**

- 位置 A：`lib/meetings.js:468-469`
```js
write() {
  this.manager.write(this.record);
}
```
- 位置 B：`lib/meetings.js:726-739` —— `manager.write()` 捕获磁盘异常，非 strict 时 `return false`，不抛。
- 位置 C：`lib/meetings.js:1514-1537` —— checkpoint 回调 `try { ... run.write(); } catch { push checkpointDegradedNote }`，catch 只在抛错时执行；写失败返回 false 被丢弃，degraded 标记永不生效。记录亦无 `record.persistence` 字段（grep 全文件无 `record.persistence`）。
- 影响：磁盘写失败时会议继续但没有任何降级痕迹（无 limitation、无 persistence 字段），CHANGELOG/README 承诺的降级语义落空；用户以为状态已保存。
- 最小修法：`write()` 改为 `return this.manager.write(this.record);`；checkpoint 回调改为 `const persisted = run.write(); if (persisted === false) { record.persistence = { ...(record.persistence ?? {}), degraded: true, lastFailedStage: stage }; push limitation（去重）; }`。降级状态写入内存 record，下次成功 checkpoint/终态 persistTerminal 随整体记录落盘（现有 persistTerminal 重试+shadow 已覆盖该兜底）。不中断运行。
- 回归测试：`settle-v2.test.mjs` 新增「manager.write 返回 false 时 checkpoint 降级」——stub `manager.write` 常返 false，断言 record.limitations 含 checkpointDegradedNote、record.persistence.degraded=true，会议仍 completed。

## 3)【P2】部分失败仍显示完整 + 任务级失败历史丢失 —— **成立（两个子问题）**

- 位置 A：`lib/protocols/roundtable-v2.js:347`
```js
const incomplete = state.sequence.length > 0 && state.reviews !== undefined && reviews.length === 0;
```
只覆盖「零评审成功」；answer 失败、review 部分失败、arbiter 失败（fallback 时）都不反映到 incomplete。settleProtocol（meetings.js）写 `record.failures` 但 `finalReport.incomplete` 不变。
- 位置 B：`lib/protocols/roundtable-v2.js:321` —— `delete next.errors[result.participantId];`：席位后续任务成功即删除先前错误（例如 answer 失败后 discussion 成功 → 该席位失败历史消失）。errors 是 participantId 单槽，非任务级追加。
- 影响：4 答者失败 1、2 评审失败 1 的会议报告 `incomplete: false`，页面呈现「完整」结果，与 `record.failures` 自相矛盾；失败历史可能被覆盖丢失。
- 最小修法：(a) buildReport `const incomplete = (现判定) || Object.keys(state.errors ?? {}).length > 0;`（settleProtocol 侧 finalReport.incomplete 取 report.incomplete 即可，若 settleProtocol 有二次覆盖需同步）；(b) errors 改为数组追加 `state.errorLog: [...]`（每条 {participantId, stage, round, status, error}，不因成功删除），reduce 与 settleProtocol.failures 读 errorLog；errors 单槽可保留作 seatStatus 快照或一并废弃。
- 回归测试：①一个 review 失败 + arbiter 成功 → finalReport.incomplete=true；②answer 失败后 discussion 成功 → record.failures 仍含该失败条目（errorLog 不被清）。放 `settle-v2.test.mjs`。

## 4)【P2】Reviewer 继承 Answerer 的 Persona —— **成立**

- 位置：`lib/client.js:980`
```js
reviewerKeys.forEach((key, index) => addSeat(modelByKey(key), "reviewer", `r${index + 1}`, `a${index + 1}`));
```
第 4 参 seatKey=`a${index+1}` 直接取同序号回答席位的 personaId（:974 `(s.personaBySeat || {})[seatKey]`）。Reviewer 在 UI 无独立选择器，却被注入 Answerer 的角色卡；Arbiter 用 `"arbiter"` 键（无对应选择，实际拿不到 persona）。
- 影响：独立评审模型被套上回答模型的人设，污染评审中立性；与「Persona 按席位分配」语义不符。
- 最小修法：默认模式下 reviewer 不传 seatKey（addSeat 第 4 参改 `undefined` → 无 personaId），除非后续做 per-seat Persona UI；若产品要保留「评审继承同模型角色」需显式披露。Arbiter 同理不传。
- 回归测试：`client.test.mjs` 新增「opt-in + answerer 选 Persona + 自定义 reviewer → POST 中 reviewer 席位无 personaId」。

## 5)【P2】v2 丢失 selfReview 识别 —— **成立**

- 位置 A：`lib/protocols/roundtable-v2.js:265-270` —— normalizeResult review 分支只产出 `normalizeReview(...)` 的 ranking，无 selfReview。
- 位置 B：`lib/meetings.js:1705` —— settleProtocol 只读 `review.selfReview === true`（normalizeReview 不产生该字段 → 恒 false）。
- v1 对照：`lib/engine.js` review 记录用 `selfReview: answererKeys.has(entry.key)`（评审路由 ∈ 回答路由集合即自评）。
- 影响：默认互评模式（reviewerKeys=s.selected，即回答者互评）下，v2 评审记录全部 `selfReview: false`，同模型自评限制的披露（README/同源披露规则）失效；UI 与导出误导读者。
- 最小修法：settleProtocol 写 reviews 时计算：`const answerRoutes = new Set(answererSeats.map(modelRouteKey)); selfReview: review.selfReview === true || answerRoutes.has(modelRouteKey(seat))`。或在 roundtable-v2 reduce 时打标。前者改动最小且与 v1 语义一致。
- 回归测试：`settle-v2.test.mjs` 场景「默认互评（reviewer 与 answerer 同 route）→ record.reviews[].selfReview===true」；已有 settle-v2 harness 的 SEATS（r1 与 a1 同 p1/p1-model）可直接断言。

## 6)【P2】八席总上限 GUI 无提前提示 —— **成立**

- 位置：`lib/client.js:982-985`
```js
if (participants.length > 8) {
  store.set({ starting: false, actionError: T.personaSeatLimit });
```
仅在点击启动后拦截（文案 `personaSeatLimit` :80）；配置过程无总席位数实时显示、无提前说明。
- 影响：用户完成全部配置（如 5 answerers + 5 reviewers）点启动才被拒，且因条目 1 的 v1/v2 分流问题，本应不受 8 总席位限制的 v1 配置也可能被误伤。
- 最小修法：配置区实时渲染 `total = answerers + reviewers + arbiter`，≥8 时显示提示（复用 personaSeatLimit 文案）；启动检查保留为最后防线。
- 回归测试：`client.test.mjs` UI 渲染断言「选 5+5 时出现席位上限提示、POST 前拦截」。

## 7)【P2】GUI 不支持同模型重复席位 —— **成立**

- 位置：`lib/client.js:897`
```js
let next = has ? s.selected.filter((k) => k !== key) : s.selected.concat([key]);
```
`selected` 是唯一模型 key 集合（indexOf 切换），同一 provider/model 只能选一次；后端 participants.js 已支持同 route 多席位（duplicate participantId 拒绝、重复 seat 允许并披露）。
- 影响：API/后端支持的「同 GPT 双席位分饰 Architect/Red Team」无法在 GUI 配置；决策③只完成一半。
- 最小修法：GUI 需改为席位列表模型（Seat Card：每席位独立 模型+角色+Persona，允许同模型多次添加）。这是 UI 结构改动，属产品项而非缺陷修补；短期可在 README/界面注明「同模型多席位请走 API」。
- 回归测试：需先实现 Seat Card；当前无最小补丁级测试可写。

## 8)【P2】registry 的 enabled 不是执行权威 —— **成立**

- 位置 A：`lib/protocols/registry.js:31`
```js
["roundtable@2", Object.freeze({ protocol: roundtableV2, enabled: false })],
```
- 位置 B：`lib/meetings.js:1501-1502`
```js
const result = await runProtocol({
  protocol: roundtableV2,
```
MeetingManager 绕过注册表直接传 roundtableV2；`isProtocolEnabled`（registry.js:51）无人调用于执行路径。
- 影响：当前仅一个 v2 协议，无实际故障；但增加 Red Team/Pro-Con 等协议后，注册表的 enabled/experimental 开关将形同虚设（协议实际可达性由硬编码决定），能力列表（getCapabilities/UI）与真实调度面不一致。
- 最小修法：executeProtocol 改为 `const protocol = protocolFor("roundtable", version)`（经 registry 解析 + enabled 校验），未启用 → 400；或至少让 capability 通告读 registry。属架构统一项，发布 0.7.x 前非阻塞。
- 回归测试：`registry.test.mjs` 新增「registry.enabled=false 的协议经管理器调度返回 400（在调度入口接入后）」。

## 9)【P3】README 未跟上 0.7.0 / GitHub Release 未发 —— **部分成立（两个子项）**

- (a) README 版本行：**不成立（已同步）**。README.md:9、package.json:3、CHANGELOG.md:7 均为 0.7.0，本地 tag v0.7.0 存在（`git tag`）。
- (b) README 测试收集描述过期：**成立（文档同步项）**。README.md:251 仍写「npm test 只收集 test/ 顶层的 *.test.mjs」，而 scripts/test.mjs:8 注释明确「Discovery is recursive so test/<area>/*.test.mjs cannot be silently…」——实现已递归，文档未更新。另 README 工具权限说明未区分阶段级权限（原文 §1140，未逐行核实文案，属低危文档项）。
- (c) GitHub Release 未发：**源码不足以确认（本地无法核实）**。缺什么：GitHub Releases 页面或 API（`GET /repos/<owner>/<repo>/releases`）访问；本地仅能确认 tag v0.7.0 存在于 `git tag --list`，不能确认远端是否已建 Release 对象。建议 captain 在发布流程中用 `gh release create v0.7.0` 或网页补发。

## 修复顺序建议（与原文一致，补依赖说明）

1. 条目 1（P1，前端分流）——独立改动，含 3 个前端测试。
2. 条目 2（checkpoint 返回值）——依赖无，一处返回值 + 判定。
3. 条目 3（incomplete + errorLog）——errorLog 改动波及 reduce/settleProtocol/测试断言（test1 依赖 errors 结构），是本批最大改动面。
4. 条目 4+5（reviewer persona / selfReview）——可在同一前端+后端小批完成。
5. 条目 6（GUI 提示）——纯前端展示。
6. 条目 7（Seat Card）与 8（registry 统一）——产品/架构项，建议 0.8 计划，不阻塞发布。
7. 条目 9(b) README 测试描述一行修正，随任一批捎带。

核实方式：只读 read/grep/git tag/status/log，未改 lib/、test/、README、CHANGELOG，未跑模型，未部署。
