# Phase 1 实施计划 plan-v3（统一修订版 · 唯一权威）

> **本文件地位**：唯一权威。替代 `task t4 output`、我此前的分段补发邮件、以及 plan-v2。凡与任何前序产物冲突，**以本文件为准**；前序产物仅作输入。**不得用后续邮件补充覆盖正文**——修订必须落进本文件。
> **产出性质**：只读分析产出。本文件是唯一被编辑的文件；未修改 `lib/`、`test/`、`package.json`、`deployed/`，未部署、未重启 DSH、未运行模型与测试。
> **基线**：`package.json:3` v0.6.1；既有测试文件 7 个（`test/{apply,attachments,client,core,meetings,stage,stage-math}.test.mjs`，glob 实测）；本文 `文件:行号` 均在撰写前 read 核对。
> **未复跑**：本轮未执行 `npm test`/`npm run check`；既有用例数沿用旧口径，**数量不作为任何判据**（见 R14）。
> **t9 复审范围**：只复审增量段，因此以下各段须可独立读懂——§3（身份残留）、§4（adapter/composer）、§5 与 §13（决策组合）、§6（状态失败语义）、§7（纯导出/回滚）、§8（批次归属）、§9.5/§10/§11（门禁与断言）。

---

## 0. 相对 plan-v2 的修订记录

| finding / 来源 | 严重度 | 改了哪节 | 一句话 |
|---|---|---|---|
| V2-F2-PATH | blocker | §4.4b 新增、§4.4、§8 PR-3/4/5 | 新增 roundtable-v2 **adapter + composer 交付表**（11 钩子、runTasks→runChild 映射、逐阶段 persona 注入与无卡回退），明确 PR-3 交付且默认关闭、PR-4 经真实 Manager 验收、PR-5 才开放；B 方案收到生产 `personaId` 必须 400 拒绝，不得静默忽略 |
| V2-GATES（G1） | high | §9.5、§10 表 2、§11 K7 | `MEETING_STAGES` 是冻结**数组**，改 `includes()` / `new Set(...).has()`；`stageIndexOf` 是私有函数，改为抽取共享纯常量 `lib/stages.js` 或只测公开阶段序列 |
| V2-GATES（G2） | high | §9.5、§8 PR-6、§10 表 7 | 裸 Node `import(client.js)` 必 `ReferenceError`（`client.js:18` 顶层 `window.__ModuleLoader__.load`）→ 改为 VM 提供最小 `window.__ModuleLoader__` 捕获 `id/factory`，再真浏览器加载；宿主 `lib/index.js` 在依赖 fixture 齐备环境 import |
| V2-GATES（G3） | high | §9.5、§8 PR-0、§8 PR-6 | 探针移出顶层：`lib/__pack_probe__/nested/probe.js`，断言 tarball 清单含该路径，`finally` 清理且不提交（旧 `lib/*.js` 顶层面包也会收，证明不了递归） |
| V2-GATES（G4） | high | §9.5、§10 表 8 | 两次 POST 不再"删几个时间字段后深等"：用**受控挂起 spawner** 比较同阶段 queued/running 投影，冻结时钟/UUID/座次，scrub 含 `startedAt`，动态字段各自验格式；`language` 同输入同归一化，不是随机动态 |
| V2-TEST-SECURITY（S1–S6） | high | §10 新增 S1–S6 块、§12 R1/R3 | 安全/卸载/取消/快照/golden 全出口断言落到 PR-3/PR-4，并给编号；不只查 Map 最终为 0 |
| V2-CONTRACT-CHECKPOINT | high | §6.1/§6.3/§6.4、§10 表 6、§11 K8 | 内存完整 state 与**裁剪后的持久化副本**分离；JSON 非安全值拒绝该结果；裁剪后仍超限 → 可见 `degraded + code`（或按 ⑤B 终止）；`checkpoint` 签名补 `at/budget`；终态 fallback 语义唯一化；K8 仅限**终态** v1 |
| V2-ORDER-EXPORT | high | §7.2/§7.4、§8 回滚表、§8 PR-1 | GET 用纯 `renderExport(record) -> {markdown, filename}`（零写，禁止借 `saveMarkdown` 取名）；备份 URL 改 `/meeting/export?...&format=json`；PR-4 同批交回滚文档 + 备份测试；每个 PR 写明逆序回滚依赖；PR-1 收窄为纯契约 |
| F1 残留 | medium | §3.1/§3.2/§3.5 | `participantId` 明确为**单会议内唯一**（跨会议 `meetingId + participantId`）；删"显式 id / 缺 id 由拍板项 3 决定"的二分，统一为"先生成唯一 id，配置重复只按拍板项 3 处理" |
| 六决策订正 | — | §13（全节重写）+ 新增 §13.7 决策依赖表 | 风险归属纠正（③⑤）、A/B/C 各自代价、Persona capability 与 experimental 开关解耦、⑤B 的测试联动、"推荐≠授权" |
| 自检 | — | §17 新增 | 五组 findings / 四个门禁替代 / 六决策交叉约束逐条映射到章节 |
| V2-GATES-S1/S2（t10 第三轮终审） | high | §10 S1（L569–584）、§8.2（L445–492）、§17.4（L805–809） | 策略拒绝改断言「子 Agent 首步 / 模型请求 / 结果工厂调用数为 0」，并**显式允许**启动请求与 plan 建立（真实宿主时序），迟到 handle `dispose` 恰一次（spy 计数），失败/拒绝路径不泄漏工具可见集；readback 改为 `seen ∖ EXCEPTIONS === allow`，例外**逐条列名**（`run_code`、按 schema 放行的 `structured_output`），越界的新工具即断言失败；§8.2 改**依赖闭包逆序** `PR-6 → PR-5 → PR-4 → PR-3 → PR-2 → PR-1 → PR-0`，只有无下游引用的栈顶批次（全部合入后仅 PR-6）可单独 revert |
| V4-ROLLBACK-GREP-SELF（t12 第四轮终审） | high | §8.2 回滚残留检查（L466–477）、§17.4（L805–809）、§0 | 删除"revert 前先对全 `lib/`+`test/` 做符号计数、命中数即为零"的**自相矛盾**前置检查（它必命中待撤批自身的实现与自测，实际无法执行）；改为在**临时 worktree 应用本批 revert 后实测**：只排查**保留下来的文件**是否残留指向已撤符号的悬空 import/引用（**被删除的本批实现与自测不计入残留**），并在该回退版本上跑 `npm run check`/`npm test`/pack 清单，三者全绿才允许合入 revert；闭包逆序与"仅栈顶可单独 revert"不变 |

---

## 1. 相对 t4 的变更摘要（保留，C1–C22）

| # | 项 | 状态 | 理由 | 落点 |
|---|---|---|---|---|
| C1 | `participantKey = provider/model#(personaId??role)` | **推翻** | 同 Persona 不同 role 会被合并 | §3 |
| C2 | 用「指纹」做身份/去重 | **推翻** | 唯一身份只认 `participantId`；指纹只做披露 | §3（D5） |
| C3 | `principalKey`（含 personaId）作为独立性判据 | **删除** | Persona 不创造模型独立性 | §3（`modelRouteKey`） |
| C4 | `transcript.actorKey = participantId` | 保留 | 同模型同 Persona 多席位仍可追溯 | §3 |
| C5 | "Verifier 同 route 必 unverified" 写进通用参与者模块 | **删除** | 属未来 RedTeam 业务规则 | §3.1、§14 |
| C6 | `normalizeRecord()` 向 record 注入 `protocol`/`participants` | **推翻** | 与「v1 响应字节不变」自相矛盾；`core.js:864 structuredClone` 会透出 | §5（D9 纯访问器） |
| C7 | roundtable 在 Phase 1 一律 v1、Persona 只在非 roundtable 分支 | **替换** | 导致 Persona 无生产生效路径 | §4、§5 |
| C8 | `checkpoint(stage, protocolState)` = 赋值 + write；"runner 只暴露 publicSnapshot" | **推翻** | 内部完整态 / UI 投影 / 持久化三者未分离；未定义失败与终态保护 | §6 |
| C9 | `settle()` 复用 `answers.map/reviews.map` 写 v2 终态 | **撤回** | 圆桌形状强约束 | §6.4 `settleProtocol` |
| C10 | 导出链只在 `api.js` GET 分支加协议判断 | **推翻** | POST `saveMarkdown`(`meetings.js:818-835`)、`markdown()`(`:805-808`) 仍走圆桌模板 | §7 |
| C11 | "回滚后旧版忽略 v2 多余字段、详情空白不崩" | **撤回** | 旧 `reconcile`(`meetings.js:698-724`) 会把孤儿 running 的 v2 改 `interrupted` 并写回 | §7.4 |
| C12 | `Object.freeze(PROTOCOL_REGISTRY)`（Map） | **推翻** | freeze 不冻结 `Map.set/delete` | §8 PR-1（D12） |
| C13 | 「npm pack 是唯一能发现漏包的手段」 | **修正** | tarball 解包后 import 入口同样能发现 | §9.5 |
| C14 | 「cordis.patch.yml 21 个键」 | **修正** | `core.js:15-36` DEFAULTS **20** 键；`cordis.patch.yml:5-23` **19** 键，缺 `uploadTtlHours` | §9 |
| C15 | 「既有 6 个测试文件 / 新 7 个」 | **修正** | 既有 **7** 个（glob 实测）；新 **8** 个 + 1 fixture | §10 |
| C16 | PR-0 要求 `npm pack` 含 `lib/protocols/*` | **修正** | PR-0 时尚无该目录 | §8 PR-0 |
| C17 | `roundtableProtocol.stages` 与 `MEETING_STAGES` 深等 | **推翻** | 后者 9 项（queued + 4 业务 + 4 终态） | §9.5、§10 表 2 |
| C18 | `runChild` 在已 abort 时仍会 `startActivation` | **修正** | `core.js:137` 先 `parent.throwIfAborted()`；但 `engine.js:295` 已 `childPlans.set`，异常路径 `:385-392` 撤销 → 仍产生无用 plan | §6.3、§10 S3、§12 R1 |
| C19 | 禁改区间以行号表达 | **替换** | 新增代码会让行号移动 | §8.3（函数语义） |
| C20 | `maxProtocolSteps` 单一上限 | **扩展** | 缺任务数/输出长度/状态体积上限 | §6.1（D8） |
| C21 | POST /meetings 两次响应直接深等 | **修正** | 需受控挂起 + 冻结时钟，不能只删时间字段 | §9.5 G4 |
| C22 | 命令与工具入口默认行为回归 | **新增** | 两个执行入口（`index.js:278`、`:352-456`）未纳入回归 | §10 表 7、§11 K9 |

---

## 2. 结论与边界

- **可开工性**：五组阻塞已闭环到"可实施"粒度；仍有 **6 项需用户拍板**（§13）。**拍板前只能做 PR-0，以及与策略无关的纯骨架**（`types.js` 的空壳、walker、渲染纯函数等）；凡涉及角色基数、重复席位策略、协议语义、Persona 生产开关的模块，必须等决策落定后提交。
- **Phase 1 承诺**：门禁递归化、协议/参与者契约、Persona 存储与快照、Runner（`runProtocol`）与多阶段 fixture、roundtable-v2 adapter/composer（默认关闭）、记录 v2 写入与 v1 纯内存兼容、checkpoint 契约、导出单出口与回滚文档、五条 API、按决策开放的 Persona 生效路径。
- **Phase 1 不承诺**：新业务协议（Red Team 等）、resume 续跑、命令/工具入口的 protocol 参数、Live2D 座位铭牌、模型自动路由、跨进程在途恢复。

### 2.1 五组阻塞闭环索引（t5 F1–F5 → 本文落点）

| 组 | 阻塞 | 根因 | 修订后的设计 | 落点 | 断言 |
|---|---|---|---|---|---|
| F1 | 身份唯一性混用 | v1 只有一个 `provider/model` 键，既当身份又当独立性（`meetings.js:172-180`、`:340`、`client.js:2284`） | 四键分离：`participantId`（身份）/`modelRouteKey`（独立性）/`seatFingerprint`（披露）/v1 `roster.key`（兼容） | `lib/participants.js`、`lib/version.js`、`meetings.js` v2 写路径、`core.js:839-854` | §3.5 六条 |
| F2 | Persona 无生产生效路径 | 恒 v1 + 原 prompt；`index.js:278` 与 `manager.create` 是两条执行路径 | A：`personaId` → roundtable-v2 adapter + composer（推荐）；B：仅基础设施，生产请求显式 400 | §4.4b、`lib/protocols/roundtable-v2.js`、`lib/protocols/prompt-composer.js`、`personas/store.js` | §4.4b 表 + §10 S1/S5 |
| F3 | 内部态/投影/持久化三者混同 | `emit()`(`:317-381`) 是唯一进度通道且 `default: break`；`settle()` 先写状态后构造（`:395-414`） | 三者分离；`checkpoint()` 不走 emit；`settleProtocol` 先构造后写；JSON/体积失败统一可见降级 | §6 | §6.4 表 + §10 表 6 |
| F4 | 导出多出口、v2 无出口、回滚不安全 | `markdown()`(`:805-808`) 无条件 `formatMeeting`；`api.js:282` 硬编码文件名；旧 `reconcile`(`:698-724`) 会写回 | 纯 `renderExport(record) -> {markdown, filename}` 单一出口；GET 零写；回滚规则在 PR-4 同批 | §7 | §10 表 7、K4 |
| F5 | 门禁/批次断言错配 | 批次顺序与断言粒度错配；把"内部归一化"当"wire 字段" | 三层对象；受控挂起；VM 加载客户端；嵌套探针；stages 用 `includes` | §9.5、§10 | §9.5 G1–G4 |

---

## 3. 身份模型 v3（F1 闭环）

### 3.1 四个键，职责单一

| 键 | 定义 | 唯一用途 | 禁止用途 |
|---|---|---|---|
| `participantId` | 席位 id。**创建时先生成唯一值**（客户端提供即沿用，否则服务端按 `p1…pN` 生成），一律写入 record。**作用域 = 单会议内唯一**；跨会议定位用 `meetingId + participantId`。规则 `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`；会议内重复 → 400 `duplicate-participant-id` | `transcript.actorKey`、`progress.seats[].id`、`failures[].participantId`、`artifacts.createdBy`、UI 座位绑定、`GET /meeting` 关联 | 独立性判定；跨会议全局查找 |
| `modelRouteKey` | `` `${provider}/${model}` `` | 独立性 / self-review / 评审覆盖度披露 | 身份、去重、追溯 |
| `seatFingerprint` | `` `${modelRouteKey}#${personaId ?? "none"}#${role}` `` | **仅**「同源席位」提示与 UI 分组 | 取代 `participantId`；身份判定 |
| `roster.key`（v1 兼容） | `` `${provider}/${model}` `` | 仅供 v1 消费方：`engine.js` 的 `answererKeys.has(entry.key)`、导出、`core.js:839-854 memberOf` | v2 追溯 |

**硬规则**

1. **唯一身份只认 `participantId`**；实现上**不区分**「客户端显式提供」与「服务端生成」——两条路径都经同一 `normalizeParticipant()`，生成后即等价，后续任何分支不得据来源做不同处理（删除 plan-v2 中"显式 id 允许 / 缺 id 另议"的残留）。
2. 配置重复（同 `seatFingerprint`）**不改变身份**：默认允许并披露同源；拍板项 ③ 若选「拒绝」，只是追加一条 400 规则（`duplicate-seat`），与 id 来源无关。
3. `personaSnapshots` 按 `personaId` 去重，与席位数无关。
4. 独立性只用 `modelRouteKey`；换 Persona 不产生独立性。通用模块只提供「同 route 集合」这一事实，**不内建**「同 route 必判 unverified」的业务结论（属协议层报告规则）。
5. **规模上限按路径分开**：v1 路径沿用 `validateRoster`（2–8 answerers、1–8 reviewers、arbiter 可选，`meetings.js:185-198`）；`participants` 路径（v2）默认总席位 2–8 且**可配置**。不得把 v2 的总人数上限套到 v1——否则 8 answerers + 8 reviewers + 1 arbiter 的旧请求会被拒（回归）。

### 3.2 三种情形各自行为

| 情形 | participantId | modelRouteKey | seatFingerprint | 独立性 | 追溯 |
|---|---|---|---|---|---|
| 同模型同 Persona，两个 role | 不同 | **相同** | 不同（role） | 不独立，报告披露 `same-route` | `transcript.actorKey` 分别指向两个 id |
| 同模型不同 Persona | 不同 | **相同** | 不同（persona） | 仍不独立（Persona 不是新模型） | 同上 |
| 同模型同 Persona 同 role 两席位 | 不同（各自生成，互不覆盖） | 相同 | **相同** | 不独立 | 两条 transcript 各自对应 id；是否拒绝由拍板项 ③ 决定 |

### 3.3 旧结构为什么必须换（证据）

- `meetings.js:340`：`list.find((item) => item.key === event.key)` —— v1 进度更新**依赖 key 唯一**；v2 沿用会让多席位更新到第一位（静默错位）。
- `meetings.js:172-180`（`parseRefList`）：v1 按 route 去重，无法表达"同模型两席位"。
- `client.js:2271/:2283/:2284`：`stageSeats` 只收 `role==="answerer"` 并用 `entry.actorKey` 反查 → v2 必须按 `participantId` 且允许非 answerer，否则多 role 座位不显示、同 route 两席位塌成一个。

### 3.4 落点

- `lib/participants.js`：`normalizeParticipant(raw, role, index)`（生成 id）、`validateParticipants(list, limits, copy)`（唯一性只查 `participantId`）、`participantsOf(record)`（纯函数；v1 由 `roster` 现推、不写回）、`participantsToRoster(list)`（v1 投影，`key = modelRouteKey`）。
- `lib/identity.js`（或并入 `participants.js`）：`modelRouteKey(p)`、`seatFingerprint(p)`、`independentSet(list) -> Set<modelRouteKey>`。
- `meetings.js`：v2 分支 `transcript` 条目携带 `actorKey = participantId`（新写路径，见 §6.3，不经 `emit()`）。
- `core.js:839-854 memberOf`：v2 追加 `participantId`/`modelRouteKey`/`personaId`/`personaName`（取自 `record.personaSnapshots`，**不回查** PersonaStore）。

### 3.5 测试断言（F1 完成判据，`test/participants.test.mjs`，PR-1）

1. 同 model 不同 Persona → `modelRouteKey` 相同、`participantId` 不同、`independentSet` 大小仍为 1。
2. 同 model 同 Persona 不同 role → `participantId`/`seatFingerprint` 均不同；互审判不独立。
3. 会议内重复 `participantId` → 400 `duplicate-participant-id`；**同一 `participantId` 出现在两个不同会议不报错**。
4. 客户端提供 id 与服务端生成 id 走同一 `normalizeParticipant()`，产出结构深等（除 id 值本身）。
5. `participantsToRoster` 的 `key` 恒为 `provider/model`（v1 导出/自审不变）。
6. `participantsOf(v1Record)` 纯函数：两次调用深等，且 `v1Record` 未被写入新键。

---

## 4. Persona 生效路径（F2 闭环）

### 4.1 根因

plan-v2 只声明"v2 + composer"，没有可运行的 roundtable 调度适配。`engine.js:255-270 runChild` 只吃**最终 prompt**，`runDeliberation` 禁改且写死圆桌阶段，因此"v2 分支调 `runProtocol`"不会自动长出 Persona 能力——必须另有一个真实的 adapter（协议对象）与 composer（提示词组装），并把它们排进 PR。同时 `index.js:278`（命令/工具入口）直连 `runDeliberation`，是第二条执行路径。

### 4.2 三个候选

| 方案 | 内容 | 对「零 diff」的代价 | 工期 | 产品可信度 |
|---|---|---|---|---|
| **A（推荐）opt-in 适配** | 仅当请求显式携带 `participants[].personaId` 时，roundtable 走 **roundtable-v2（adapter+composer）** 写 v2 记录；不传 Persona 时完全走旧路（v1 + `runDeliberation` + 原 prompt） | 无（旧路径字节不变；K1–K9 全绿），新增路径由独立 fixture 覆盖 | +5~7 人日（adapter 11 钩子 + composer + 安全断言 + 集成） | 高：选择器与真实执行一致 |
| B（最小）仅基础设施 | 交付存储/校验/快照 + Manager fixture；**生产 `create()` 收到 `personaId` → 400 `persona-not-supported`**；无选择器 | 无 | 基准 | 中：能力不可用但诚实（不静默忽略） |
| C 推迟 | Phase 1 完全不接 Persona 生产路径（连 API 都可延后） | 无 | 最小 | 低：管理能力缺席 |

### 4.3 推荐

**A**，理由：
1. 唯一同时满足「旧圆桌零 diff」与「Persona 真有生产路径」的方案——开关是"请求里有没有 `personaId`"，可被测试精确锁定。
2. 安全要求（Persona 不得扩权/不得声明工具/不得覆盖安全规则）必须对真实 `restrictChildTools`(`index.js:519-602`) 与真实 prompt 组合断言；只有 A 才有真实注入点（§10 S1）。
3. `prompts.js` 六个 v1 构造器零修改：composer 在**无卡席位**直接调用原构造器返回原字符串（§4.4b 回退规则）。

选 B/C 时：UI 不得出现 Persona 选择器，`GET /protocols` 不得暗示已生效；**B 必须在 `create()` 显式拒绝生产 `personaId`**，不允许"存了但不用"。

### 4.4a 方案 A 的落点总表

| 需求 | 落点 | 方式 |
|---|---|---|
| 请求识别 | `meetings.js:841-957 create()` | `personaRequested = participants.some(p => p.personaId)`；roundtable + `personaRequested` + `personaBinding!=="off"` → v2 分支；否则旧路。未知/未启用 → 400（§4.4b 末） |
| 快照 | `lib/personas/store.js snapshot(workspace, personaIds)` | **同步** fs（避免在 `:848`→`:945` 之间引入 await 破坏并发额度原子性）；写 `record.personaSnapshots`（深拷贝冻结） |
| 注入 | `lib/protocols/prompt-composer.js` | 七层顺序见 §4.4b；无卡席位直返 v1 构造器结果 |
| 安全包装 | 复用 `prompts.js:102 dataBoundary`（PR-1 导出）+ `:87 escapeFenceMarkers` | Persona 卡片置于 `PERSONA` 围栏；卡片文本中的围栏/标记转义；标签表扩为 `FILE|ANSWER|REVIEW|PERSONA` |
| 扩权防护 | `index.js:519-602` 不变 | 工具白名单只由 `toolPolicyFor({protocol,stage,hasAttachments})` 决定；Persona 无输入通道 |
| 禁止 | `meetings.js:960-1098` | Persona 不参与 `buildDirectory`/`findModel`/route 选择 |

### 4.4b roundtable-v2 adapter / composer 交付表（V2-F2-PATH 的正面回答）

**文件与归属**

| 文件 | 内容 | 交付于 |
|---|---|---|
| `lib/protocols/roundtable-v2.js` | 协议对象 `{id:"roundtable", version:2}`，11 钩子 | PR-3 |
| `lib/protocols/prompt-composer.js` | `composeStagePrompt({task, stage, state, context})`，负责七层组装与无卡回退 | PR-3 |
| `lib/prompts/persona.js` | `personaBlock(snapshot)`（围栏 + 转义 + 只读声明） | PR-3 |
| `lib/protocols/runner.js` | `runProtocol`（通用调度，只经 `runChild`） | PR-3 |
| `meetings.js` | v2 分支接线 + `checkpoint` + `settleProtocol` | PR-4 |
| `lib/api.js`、`lib/client.js` | Persona 选择器（`personaBinding==="opt-in"` 时才渲染） | PR-5 |

**11 个钩子（签名与数据形状）**

| 钩子 | 签名 | roundtable-v2 实现（伪代码） |
|---|---|---|
| `validateRequest` | `(request, limits) -> void`（抛 `ProtocolError`） | topic 非空；participants 2–8；role ∈ {answerer, reviewer, arbiter}；至少 1 answerer；`rounds ∈ [0, maxRounds]`；每个 `personaId` 必须能在快照集中找到 |
| `createState` | `(context) -> state` | `{round:0, answers:{}, reviews:{}, ranking:{}, arbiter:null, seatStatus:{}}` |
| `nextStage` | `(state, ctx) -> "answering"|"discussing"|"reviewing"|"deciding"|null` | `answering` → (`rounds>0` ? `discussing`×rounds → `reviewing`) → `deciding`；rounds=0 跳过 `discussing`（与 v1 阶段序列一致，UI 复用） |
| `buildTasks` | `(stage, state, ctx) -> task[]` | 逐阶段生成（下表），**taskId 全局唯一**，含 `participantId`/`role`，不含 `roster.key` |
| `buildPrompt` | `(task, state, ctx) -> string` | `composeStagePrompt(...)`；无 Persona → 直接返回对应 v1 构造器字符串 |
| `outputSchema` | `(task) -> object | undefined` | answer/discussion → `undefined`；review → `REVIEW_SCHEMA`；arbiter → `ARBITER_SCHEMA`（import 自 `prompts.js:41-42` 同源常量） |
| `normalizeResult` | `(task, raw) -> {status, output?, error?}` | 文本 + 结构化双路；schema 校验失败 → `invalid`（`refused`/`empty`/`invalid` 不入产物） |
| `reduce` | `(state, results, ctx) -> state'` | **纯函数**：合并 answers/reviews/ranking；不读时钟/随机/网络；不调模型 |
| `isComplete` | `(state, ctx) -> boolean` | `deciding` 完成即 true；另受 runner 的 `maxProtocolSteps` 约束 |
| `buildReport` | `(state, ctx) -> finalReport` | `{markdown, fallback, incomplete, ranking, sameRouteNotes, decision?}`；构造失败 → 有界 fallback（§6.4） |
| `publicSnapshot` | `(state, ctx) -> uiSnapshot` | `{stage, stageIndex, stageCount, seats:[{participantId,label,status}], counts}`，**不落盘、不含 handle/AbortController** |

**逐阶段注入（persona → prompt → task）**

| 阶段 | taskId 模式 | 席位来源 | Persona 注入 | 无卡回退 | schema | maxTokens |
|---|---|---|---|---|---|---|
| `answering`（round 0） | `answer:0:<pid>` | `role==="answerer"` | 层 3 = `personaSnapshots[pid]` 的卡片 | `answerPrompt(topic, attachments, language, {web})` 原样 | — | `config.answerMaxTokens` |
| `discussing`（round r≥1） | `discuss:<r>:<pid>` | answerers | 同上（讨论语境保留卡片） | `discussionPrompt(...)` 原样 | — | `answerMaxTokens` |
| `reviewing` | `review:<pid>` | `role==="reviewer"` | 同上（评审卡） | `reviewPrompt(...)` 原样 | `REVIEW_SCHEMA` | `reviewMaxTokens` |
| `deciding` | `arbiter:<pid>` | `role==="arbiter"`（缺省取 answerers[0]，与 v1 `:991-994` 同规则） | 同上（裁决卡） | `arbiterPrompt(...)` 原样 | `ARBITER_SCHEMA` | `arbiterMaxTokens` |

**调用链**（一次会议）

```
manager.create(request)                                  // meetings.js:841-957
  └─ registry.get({id:"roundtable", version:2})          // 已在 PR-3 注册，enabled:false
  └─ personas.snapshot(workspace, ids) → record.personaSnapshots
  └─ record.version=2; protocol={id,version:2,config}; participants=[...]; write strict
manager.execute(record)                                  // meetings.js:960-1098
  └─ state = protocol.createState(ctx)                   // ctx: 只读 {topic, participants, attachments, language, config, personaSnapshots}
  └─ while (!isComplete && step < maxProtocolSteps):
       stage = nextStage(state, ctx); tasks = buildTasks(stage, state, ctx)
       run.checkpoint({by:"stage-start", stage, at, state, tasks, budget})   // 落盘字段见 §6.1
       results = await runTasks(tasks, {
          buildPrompt: t => protocol.buildPrompt(t, state, ctx),
          outputSchema: t => protocol.outputSchema(t),
          toolPolicy: t => toolPolicyFor({protocol, stage, hasAttachments}),  // worker 侧仍由 runChild 生成 plan
          maxConcurrent: config.maxConcurrentChildren,
          signal
       })                                               // 每个 task 只经 engine.runChild 执行
       state = protocol.reduce(state, results, ctx)      // 纯函数
       run.checkpoint({by:"stage-end", ...})
  └─ run.settleProtocol(protocol.buildReport(state, ctx)) // 见 §6.4
```

**无卡席位的回退语义**（两层，按席位判定，不做会议级切换）
1. 席位无 `personaId` → `composeStagePrompt` 直接 `return <v1 构造器>(...)`，**字符串逐字节相同**（测试 S5 断言）。
2. 席位有 `personaId` 但快照缺失（Persona 在 create 后被删）→ 用 `personaSnapshots` 中的冻结副本，**不报错、不回查**；若快照本身缺失（数据损坏）→ 该 task 记 `invalid` + `failure`，会议继续（记 `limitation: persona-snapshot-missing`）。

**B 方案的行为（必须显式）**：`create()` 若收到任一 `personaId` → 400 `persona-not-supported`（若 `personaBinding==="off"` 而请求带卡，同样 400，不静默忽略）；Manager 级 Persona 绑定只通过**测试注入的 registry**（`enableExperimentalProtocols` 之外的单测开关）验证，不影响生产请求。

### 4.5 三入口一致性（必须写进 README 与测试）

| 入口 | 现状 | Phase 1 |
|---|---|---|
| `POST /meetings`（`api.js:173-178` → `manager.create`） | 建记录 + `runDeliberation` | **唯一**接入协议/Persona 的入口 |
| `/roundtable` 命令（`index.js:278` 直连 `runDeliberation`） | 无记录、无协议 | 保持默认 roundtable；**不接受** protocol/persona 参数 |
| `roundtable` 工具（`index.js:352-456`） | 同上 | 同上 |

即：**三入口默认兼容 ≠ 三入口都有新能力**（README 与工具描述须如实写，拍板项 ④）。

---

## 5. 记录版本策略（F2 的耦合项）

- **D1 混合（推荐 A）**：
  - 无 `protocol`、无 `personaId` → `version:1`，走旧 `runDeliberation`，磁盘形状与 0.6.1 一致（K3 字面成立）。
  - **显式 `protocol:"roundtable"` 且无 `personaId` → 仍写 `version:1`**（守 K2：两次 POST 归一后深等）。
  - 任一席位带 `personaId`（且 `personaBinding!=="off"`）**或** 协议不是 roundtable → `version:2`。
- **备选（拍板项 ②B）** 全部新记录 v2：K3 降级为「语义等价 + `docs/record-v2-keys.md` 键清单」；旧默认**执行路径**仍不变。
- **备选（②C）** 全 v1：与 ①A **互斥**（v2 是 Persona 落盘的载体）。注意：这是**本方案的取舍**，不是"v1 物理上不能存 Persona"——若硬要塞进 v1 的 `roster`，会破坏 K2/K3/K5，故不做。
- 无论哪种，**v1 读取一律纯内存**（D9）：不写盘、不改 mtime；唯一例外是 §7.4 的**孤儿 running/queued 生命周期修复**（`meetings.js:698-724`，允许写，且只对非终态记录）。

---

## 6. checkpoint / settleProtocol 契约（F3 闭环）

### 6.1 三个对象 + 一个副本（V2-CONTRACT-CHECKPOINT）

| 对象 | 形状 | 谁写 | 谁读 |
|---|---|---|---|
| **内存完整态** `state` | 协议私有、**不裁剪**；`reduce` 的唯一输入 | runner 持有 | `reduce`/`buildReport` |
| **持久化副本** `protocolState` | `state` 的**裁剪投影**（下） | `MeetingRun#checkpoint()` | 崩溃取证、`GET /meeting`、只读渲染 |
| **UI 投影** `publicSnapshot` | `{stage, stageIndex, stageCount, seats, counts, lastEventAt}` | 不落盘 | 页面 / Live2D 座位条 |
| **v1 兼容字段** | 原形状 | v1 路径 | 现有 UI/导出 |

```json
{
  "schema": 1,
  "protocol": { "id": "roundtable", "version": 2, "config": {} },
  "stage": "collect", "stageIndex": 1, "stageCount": 3,
  "step": 4,
  "startedAt": "…", "updatedAt": "…",
  "budget": { "steps": 4, "tasksStarted": 3, "tasksCompleted": 2, "outputChars": 12000 },
  "state": { },                       // 裁剪后副本；原值只在内存
  "tasks": [ { "id": "answer:0:p1", "stage": "answering", "participantId": "p1",
               "status": "done|running|pending|failed|refused|empty|invalid|timeout|cancelled",
               "attempt": 1, "startedAt": "…", "endedAt": "…",
               "outputChars": 800, "output": "截断后的文本",
               "truncated": { "output": 12000 },
               "error": { "code": "…", "message": "…" } } ],
  "lastCheckpoint": { "at": "…", "by": "stage-start|stage-end|settle", "degraded": false },
  "persistence": { "degraded": false, "failures": 0 }
}
```

**上限（D8，进 `core.js:15-36` DEFAULTS 与 `cordis.patch.yml:5-23`）**：`maxProtocolSteps: 40`、`maxTasksPerStage: 12`、`maxTotalTasks: 60`、`maxTaskOutputChars: 20000`、`maxProtocolStateBytes: 262144`、`personaMaxCustom: 50`、`personaBinding: "off"`、`enableExperimentalProtocols: false`。

**失败与裁剪的单一语义（替换 plan-v2 §6.1 的模糊表述）**

1. **JSON 不安全**（`undefined`/函数/BigInt/循环/`Infinity`/`NaN`/`Map`/`Set`/`Error` 实例）→ **拒绝该结果**：该 task 记 `invalid` + `failure{code:"protocol-result-not-serializable"}`，**不进入 `state`/`protocolState`**；内存完整态不被污染（`reduce` 只收到已通过序列化检查的结果）。
2. **体积超限** → 只裁剪**持久化副本**：顺序 `tasks[].output → null`（保留 `outputChars` 与 `truncated` 标记）→ `state` 中显式声明为可裁剪的数组（协议在 `cacheablePaths` 里列出）逐项截断 → 仍超限则 `persistence.degraded=true` + `code:"protocol-state-too-large"`，**继续运行**（若拍板项 ⑤ 选 B，则改为 `terminate("failed","protocol-state-too-large")`；正文与测试必须同选一种）。
3. `write()` 返回 `false`（非 strict，`meetings.js:553-567`）→ `persistence.degraded=true`、`limitations += "checkpoint-write-failed"`（去重）、下阶段继续。
4. **绝不允许**：修改 `reduce` 的输入、静默丢盘、把"裁剪"当成"完整保存"（`protocolState` 必须带 `truncated` 标记）。

### 6.2 写入时机（不依赖 emit）

| 时机 | 记录状态 | 方法 | 说明 |
|---|---|---|---|
| `create()` 首写 | `queued`, `protocolState:null` | `write(record,{strict:true})`（`:929`） | 失败 → 归还附件 + 500（`:939-943` 事务序保留） |
| `execute()` 起动 | `running`, `stage` | 现有 `:963-967` | |
| 每阶段开始（buildTasks 后） | `stage`, `stageIndex`, `tasks[]=pending` | `run.checkpoint({by:"stage-start", at, ...})` | 非 strict |
| 每阶段结束（reduce 后） | `state`, `tasks[]` 终态, `budget` | `run.checkpoint({by:"stage-end", at, ...})` | 非 strict |
| 终态 | 见 §6.4 | `persistTerminal(record)` | 4 次重试 + shadow（`:591-608`）不变 |

**禁止**把 checkpoint 挂到 `emit()`：`:317-381` 的 `switch` 对未知事件 `default: break` 静默丢弃；v2 的进度**完全不走 `emit()`**，`transcript`/`failures` 由 runner 直接写 `record`（`MeetingRun` 暴露 `appendTranscriptForV2()` / `appendFailureForV2()` 两个内部方法，仅 v2 路径使用）。

### 6.3 方法与签名

```js
// meetings.js, class MeetingRun
checkpoint({ at, by, stage, stageIndex, state, tasks, budget })
  // -> { ok: boolean, bytes?: number, skipped?: "terminal"|"aborted", code?: string }

appendTranscriptForV2(entry)   // { seq, at, kind:"stage"|"answer"|"review"|"artifact"|"finding", participantId, ... }
appendFailureForV2(failure)    // { stage, participantId?, code, message, at }
```

**返回优先级（消除不可达分支）**

1. 终态早退优先：`isMeetingTerminal(record.status) || record.endedAt !== undefined` → `{ok:false, skipped:"terminal"}`（与 `:323` 同判据）。**这是第一判据**，因此 cancelled 已包含在内。
2. 非终态但 `signal.aborted` 或 `record.status === "cancelled"` → `{ok:false, skipped:"aborted"}`，**不写**。
3. 否则尝试写：写失败 → `degraded`；体积超限 → 裁剪后重试一次；仍失败 → `{ok:false, code:"protocol-state-too-large"}`。
4. **幂等**：同 `at` + 同输入两次调用 → 磁盘字节相同（`updatedAt` 由 `at` 决定，不取 `nowIso()`）；`reduce` 纯函数：重放同输入深等输出。

### 6.4 `settleProtocol`（唯一语义，替换"构造失败一律不写 completed"）

1. 门禁：`if (isMeetingTerminal(record.status)) return;`（同 `:387`）；`run.timedOut` → `terminate("failed", copy.meetingTimedOut)`（同 `:388-393`）。
2. **先构造**：`finalReport = protocol.buildReport(state, ctx)`。构造抛错或返回不可序列化/超体积 → **构造有界 fallback**（`{markdown: 机器生成摘要, fallback:true, incomplete:true, decisions:[]}`，体积 ≤ `maxProtocolStateBytes/4`），并 `limitations += "protocol-report-fallback"`。
3. **再写终态**：`status:"completed"`、`stage:"completed"`、`endedAt`、`progress` 满格、`protocolState.lastCheckpoint.by="settle"`。**唯一禁止的是"报告尚未构造完成就置 completed"**；"构造失败 → 有界 fallback → completed+fallback" 是允许且被期望的终态（测试按此断言）。
4. `persistTerminal(record)`（`:591-608`）；失败只是 shadow 兜底，不改内容。
5. `releaseRun(run)` 由 `execute` 的 `finally`（`:946-955`）完成。
6. 若拍板项 ⑤ 选 **B**：第 2 步失败直接 `terminate("failed","protocol-report-unavailable")`，**不写 completed**；此时 §10 表 6 的对应断言改为 failed（二者必须同选）。

**任务结果契约**（`normalizeResult` 之后，与会议终态分开）

| 情况 | 任务结果 | 记录 |
|---|---|---|
| 正常结构化 | `{status:"done", output}` | 计入产物 |
| 拒绝（`isRefusedChild` 语义） | `{status:"refused", error}` | failure，不入产物 |
| 空输出 | `{status:"empty", error}` | failure |
| schema 校验失败（含一次 JSON 修复） | `{status:"invalid", error}` | failure + `unverified` 标记 |
| 不可序列化 | `{status:"invalid", error.code:"protocol-result-not-serializable"}` | failure |
| 子 Agent 超时 | `{status:"timeout"}` | failure，其他任务继续 |
| 任务级取消（整场 abort） | `{status:"cancelled"}` | 由 `execute` 的 catch 决定会议终态（`meetings.js:1074-1087`），本节不处理会议状态 |

### 6.5 落点清单

- `meetings.js:841-957 create()`：v2 分支写 `version:2`、`protocol`、`participants`、`personaSnapshots`、`protocolState:null`（首写 strict）。
- `meetings.js:960-1098 execute()`：v2 分支调 `runProtocol`；阶段边界调 `run.checkpoint`。
- 新增 `MeetingRun#checkpoint`（置于 `emit` 之后、`settle` 之前）。
- 新增 `MeetingManager#settleProtocol(run, report)`。
- **不改** `:384-477 settle()`、`:317-381 emit()`。

---

## 7. 导出链与回滚安全（F4 闭环）

### 7.1 现状（三处独立出口）

| 位置 | 行为 |
|---|---|
| `meetings.js:805-808 markdown()` | 无条件 `formatMeeting(read(...), copy)` |
| `meetings.js:818-835 saveMarkdown()` | 调 `this.markdown()`，固定文件名 `roundtable-${id}.md`，写 `.roundtable/exports/` |
| `api.js:249-286 exportMeeting()` | GET → `manager.markdown` 或 `format=json` 返回 `{markdown, meeting}`；POST → `manager.saveMarkdown`；`:282` `content-disposition` 硬编码 `roundtable-${id}.md` |

### 7.2 设计（D10：单一纯函数出口，GET 零写）

```js
// lib/render.js —— 纯函数，无 fs、无 manager、无网络
export function renderExport(record, copy) {
  const v1 = recordVersionOf(record) === 1;
  return {
    markdown: v1 ? formatMeeting(record, copy)          // 原函数零改动（core.js:897-1000）
                 : formatProtocolReport(record, copy),  // v2 专用
    filename: v1 ? `roundtable-${record.id}.md`
                 : `${record.protocol?.id ?? "report"}-${record.id}.md`,
  };
}
```

- `meetings.js:805-808 markdown()` → `renderExport(this.read(...), this.copy()).markdown`。
- `meetings.js:818-835 saveMarkdown()` → `const {markdown, filename} = renderExport(this.read(...), copy)` 后**唯一一次** `writeFileSync(join(exportsDir, filename), markdown)`；返回 `{path, filename, bytes}`（v1 内容与文件名不变）。
- `api.js:249-286`：
  - **GET（`format=markdown` 默认）**：`const {markdown, filename} = manager.renderExport(workspacePath, id)`（**零写**，绝不调用 `saveMarkdown` 取名）；`:282` 的 `content-disposition` 用该 `filename`。
  - **GET `format=json`**：响应形状**保持** `{markdown, meeting}` 不变（不加 `filename`，否则 v1 JSON 字节变化）；`markdown` 来自同一个纯 `renderExport`。
  - **POST**：`manager.saveMarkdown(...)`（唯一写路径）。
- `formatMeeting`(`core.js:897-1000`) 与 `formatProtocolReport` 都只读 record；不 re-run、不查 PersonaStore（只用 `personaSnapshots`）。

### 7.3 v2 Markdown 必须包含

协议 id/version、阶段表（stageIndex/stageCount/耗时）、参与者（`participantId` + `modelRouteKey` + `personaName`，同源席位标注「同一模型」）、每阶段产物、findings 与 `verified/unverified`、失败与 `fallback/incomplete` 标记、最终报告、`limitations`、`truncated` 标记（若 `protocolState` 被裁剪）。**不得**输出密钥/token/完整 prompt。

### 7.4 回滚安全（PR-4 同批交付，不是 PR-6）

- **事实**：0.6.1 的 `read()`(`meetings.js:671-687`) 不校验 `version`；`reconcile()`(`:698-724`) 对「status 为 running/queued 且不在 active」的记录会写回 `interrupted` + `limitation`。**降级运行时会把在跑的 v2 会议改写成 interrupted**，且 `formatMeeting` 只认圆桌字段 → v2 被渲染成空壳。
- **规则（`docs/rollback-v2.md`，**PR-4 与 v2 写入同批**交付）**：
  1. 降级前必须让所有 v2 会议处于终态（完成/取消）；禁止在 v2 会议运行时回滚。
  2. 降级前备份 JSON 与 Markdown：`GET /api/roundtable/meeting/export?id=<id>&format=json`（**真实存在的路由**，`api.js:249-286` 的 `exportMeeting` 处理 `format`）与同路由的默认 markdown；写入 `.roundtable/exports/`。
  3. 新版本对未知协议**只读渲染**：`protocolOf(record)` 直接取 `record.protocol`，**不得** `requireProtocol()`；报告从 `finalReport`/`protocolState` 还原，绝不 re-run。
  4. v2 记录永久保留 `finalReport`；不因协议下线而清理。
  5. **旧版没有 v2 viewer**：降级后查看 v2 只能通过导出的备份文件；不得宣称"旧版可读 v2"。
- **半条记录**：首写 strict（`:929`）失败即 500 且 `releaseAdoptedUploads`（`:939-943`）→ 不产生文件；后续 checkpoint 失败只降级不破坏（§6.1/§6.3）。

---

## 8. PR 拆分与批次归属（每批独立可验）

统一关门条件（每批）：`npm test` 全绿（既有 7 文件 + 本批新增）、`npm run check` 全绿、`git diff` 在 §8.3 禁改区间零 hunk、本批新增文件被 walker 收录且**被打包清单收录**。

### PR-0 门禁地基
- 文件：`scripts/walker.mjs`(新)、`scripts/check.mjs:16-19`、`scripts/test.mjs:17-20`、`package.json:32`、`README.md:9`、`test/gates.test.mjs`(新)。
- 验收：①walker 自测（3 层嵌套、`test/manual/` 排除、符号链接不跟随）；②`check` 覆盖 `lib/**/*.js`；③`test` 收集 `test/**/*.test.mjs` 且排除 `manual/`；④`npm pack --dry-run --json` 用**嵌套探针** `lib/__pack_probe__/nested/probe.js`（`try/finally` 删除，`finally` 内断言目录已不存在，不提交）证明 `lib/**/*.js` 生效；⑤**无**任何协议/Persona/席位策略内容。
- 回滚：单 commit revert，无依赖。

### PR-1 契约层（纯模块，不接生产 create）
- 文件：`lib/protocols/types.js`、`lib/protocols/registry.js`、`lib/protocols/roundtable-protocol.js`（v1 元数据，仅 id/version/stages/roles 描述）、`lib/participants.js`、`lib/identity.js`、`lib/version.js`（`protocolOf`/`recordVersionOf`/`participantsOf`）、`lib/stages.js`（**新增**：`STAGE_ORDER` + `stageIndexOf` 纯常量/纯函数，供 `meetings.js:238` 与协议共用）、`prompts.js` 导出 `dataBoundary`(`:102`)、`test/registry.test.mjs`、`test/participants.test.mjs`。
- 关键：`registry` 只导出函数与**冻结数组**（内部 Map 私有，不导出；D12）；未知协议在**纯函数层**返回错误（真正的 `create()` 分派在 PR-4，PR-1 不接生产路径）；**总席位上限只作用于 `participants` 路径**；v1 `validateRoster` 语义不变（§3.1 规则 5）。
- 验收：§10 表 1–2；`npm pack --dry-run` 含 `lib/protocols/registry.js`、`lib/participants.js`、`lib/stages.js`。

### PR-2 Persona 基础设施（不含生产绑定）
- 文件：`lib/personas/schema.js`、`builtin.js`、`store.js`、`test/personas.test.mjs`。
- 关键：路径 `.roundtable/personas/personas.json`（避开 `list()` 的 `MEETING_ID` 误读：`"personas"` 恰 8 字符命中 `meetings.js:55`）；**同步 fs**；字段白名单 + 长度 + 数组条数 + store 总数 + 文件大小；`builtin.` 不可改删；原子写 tmp+rename；写失败保持旧 JSON 可读；**`personaBinding` 默认 `off`**，本批不接任何会议路径。
- 验收：§10 表 3；追加 personas 后 `manager.list()` 数量不变。

### PR-3 Runner + roundtable-v2 adapter/composer（默认关闭）
- 文件：`lib/engine.js`（三处加法：导出 `toolPolicyFor`、`runChild` 增 `protocol` 透传、`export throwIfRunAborted`）、`lib/protocols/runner.js`、`lib/protocols/roundtable-v2.js`、`lib/protocols/prompt-composer.js`、`lib/prompts/persona.js`、`test/fixtures/protocol-fixture.mjs`、`test/runner.test.mjs`、`test/persona-adapter.test.mjs`。
- 关键：只经 `runChild`(`engine.js:255-393`) 启动（复用 `childPlans`(`:67`)/`activeHandles`(`:138`)；runner 内出现 `ctx.subagents` 即违规）；出队/阶段边界**自设 abort 门禁**，且 abort 后**不再调用 `runChild`**（`engine.js:295` 的 plan 先建后撤问题见 §10 S3）；`priceGuard` 预算上限（§6.1）；未知阶段 `toolPolicyFor` → `[]`；**adapter 与 composer 注册为 `enabled:false`**，`create()` 不启用（接线在 PR-4）。
- 验收：§10 表 5、S1（fixture 级）、S2（fixture 级）、S3；`npm pack` 含 `lib/protocols/runner.js`、`lib/protocols/roundtable-v2.js`。

### PR-4 记录 v2 / checkpoint / 导出 / 回滚文档（生产接线）
- 文件：`lib/meetings.js`（create/execute 分派、`checkpoint`、`settleProtocol`、`renderExport` 接线、`appendTranscriptForV2`/`appendFailureForV2`）、`lib/render.js`、`lib/core.js`（summary/detail 版本投影）、`lib/stages.js` 接线（`meetings.js:238` 改为 import）、`docs/rollback-v2.md`、`test/record-v2.test.mjs`、`test/roundtable-golden.test.mjs`、`test/fixtures/{roundtable-v1-record.json,roundtable-v1-export.md}`。
- 关键：v1 不注入字段（D9）；v2 首写 strict、之后非 strict；终态保护；导出单出口（§7.2）；未知协议在**附件 adopt 前**（`meetings.js:865` 之前）400（本批唯一做真实分派的地方）；`core.js:811-836 summary` 对 v1 零新增键、对 v2 追加 `protocol/stageIndex/stageCount`；`core.js:862-894 detail` 对 v1 字节不变、对 v2 追加 `participants[].personaName`、`seats`；**同批交付回滚文档与备份测试**。
- 验收：§10 表 6–7、S1（Manager 级）、S4、S5、S6。

### PR-5 API + Persona 选择器（后置，取决于决策与 PR-4 验收）
- 文件：`lib/api.js`（handlers 增 `personas`；`routes:310-324` 追加，GET/POST `/personas` 同条注册、POST 读 `body.workspace`）、`lib/index.js:686/:687-694`（注入 PersonaStore）、`lib/copy.js`、`lib/client.js`（`personaBinding==="opt-in"` 才渲染选择器）、`test/api-protocols.test.mjs`。
- 关键：`/protocols` 的 404 才是"旧后端"，**403/500 不得静默降级**；复用 `client.js:504-528` 的 `workspaceToken()/isCurrentWorkspace()/stillValid(token,{detailId})`；`client.js:2268-2295` 只做**投影**改动（按 `participantId`、允许非 answerer），不动模型加载/每帧/几何（§8.3）。
- 验收：§10 表 8；真浏览器清单见 §13 ⑥。

### PR-6 发布准备（不含回滚文档）
- 文件：`README.md`（版本、17 条路由表 `:159-170`、模块清单 `:255-265`）、`CHANGELOG.md`、`scripts/pack-check.mjs`、`package.json:44-47`。
- 关键：**真实 tarball** 验收——`npm pack` → 解包 → ①`import('<dir>/lib/index.js')` 在**依赖 fixture 齐备环境**成功（宿主 peer dep stub，与 `test/apply.test.mjs` 同一套）；②客户端**不**在裸 Node import，改用 VM 捕获 `window.__ModuleLoader__.load` 的 `id/factory`，再真浏览器加载；③tarball 清单含 `lib/protocols/**`、`lib/personas/**`、`lib/render.js`、`lib/stages.js`；④`cordis.patch.yml:5-23` 与 `core.js:15-36` 键集合相等（先补 `uploadTtlHours`）。
- 回滚：README/CHANGELOG 可单独 revert。

### 8.2 逆序回滚依赖（V2-ORDER-EXPORT）

**唯一合法顺序（依赖闭包逆序，与 §17.4 逐字一致）**

`PR-6 → PR-5 → PR-4（先让所有 v2 会议进入终态并导出 JSON/Markdown 备份）→ PR-3 → PR-2 → PR-1 → PR-0`

| PR | 可单独 revert？ | 必须逆序先撤（闭包） | 说明 |
|---|---|---|---|
| PR-6 | 是（仅当它仍是栈顶） | — | 版本/文档，无运行期影响；本计划**全部合入后它是唯一可独立撤的批** |
| PR-5 | **否** | PR-6 | `client.js`/`api.js` 引用 PR-3 的协议目录与 PR-2 的 `personas/store.js`；先撤 PR-6 再撤本批 |
| PR-4 | **否** | PR-6、PR-5 | 一旦产生 v2 记录：先让**所有** v2 会议进终态 → 导出 JSON（`/meeting/export?...&format=json`）+ Markdown 备份 → 再撤；撤销后 v2 只能靠备份查看（§7.4） |
| PR-3 | **否** | PR-6、PR-5、PR-4 | `runner`/`roundtable-v2`/`prompt-composer` 被 PR-4 的 `execute()` 直接 import；PR-4 未撤时撤 PR-3 → 悬空 import |
| PR-2 | **否** | PR-6、PR-5、PR-4、PR-3 | `personas/store.js` 被 PR-4 的创建期快照与 PR-5 的 API 引用 |
| PR-1 | **否** | PR-6、PR-5、PR-4、PR-3、PR-2 | `participants.js`/`identity.js`/`version.js`/`lib/stages.js`/`protocols/registry.js` 被 PR-3/PR-4 引用，且 `meetings.js:238` 已改为 import `lib/stages.js` |
| PR-0 | **否** | 全部下游（PR-1…PR-6） | `scripts/check.mjs`/`test.mjs` 已改为 import `scripts/walker.mjs`；`package.json:32` 的 `lib/**/*.js` 撤后会让新增子目录文件脱离检查 |

**可独立撤的批次（逐条列出，其余为"无"）**

- 允许：**仅当前栈顶且无任何下游引用**的那一批。本计划全部合入后栈顶是 PR-6 → **只有 PR-6** 可单独 revert；若 PR-6 尚未合入，则当时只有 PR-5 可单独 revert（依此类推）。
- 其余批次：**无**。`git revert <PR-3>` 之类的单批回滚会在 PR-4 留下悬空 import，一律禁止。

**回滚残留检查（应用本批 revert 后，在临时 worktree 上实际验证）**

```bash
git worktree add ../rt-revert-<PR> <base>
cd ../rt-revert-<PR> && git revert --no-commit <本批 merge commit> && git commit -m "revert <PR>"
```

1. **只排查保留下来的文件**：在临时 worktree 里 `git grep -nE "<本批符号>" -- lib/ test/ scripts/`，命中若**全部落在本批删除的文件内**即为干净；只要有命中出现在**保留下来的文件**中（悬空 `import`/引用），说明仍有下游未撤 → 回到上表按闭包补撤后再重试。**被删除的本批实现与自测不计入残留**（它们本就是这次要撤的）。
2. 在该回退版本上跑 `npm run check`（`lib/**/*.js` 递归）、`npm test`（`test/` 递归收集）与 `npm pack --dry-run` 清单核对，三者全绿才允许合入该 revert。
3. 只有第 1、2 步同时通过才允许合并该 revert；否则按 §8.2 上表继续撤下游 PR。

**残留判据（与对侧章节逐字一致）**：保留文件无指向已撤符号的悬空 import/引用；被删除的本批实现与自测不计入残留；并在该回退版本上跑 `npm run check`/`npm test`/pack 清单。

**无悬空新增文件 / 无跨批验收**核对：

| 新增文件 | 引入 PR | 首个消费者 | 判定 |
|---|---|---|---|
| `scripts/walker.mjs` | PR-0 | PR-0 `check.mjs`/`test.mjs` | 同批 ✓ |
| `lib/stages.js` | PR-1 | PR-4（`meetings.js:238` 接线） | PR-1 内自带测试，PR-4 才改调用点 → 不悬空 ✓（PR-1 期间零消费者但自身可测） |
| `lib/participants.js`、`lib/identity.js`、`lib/version.js`、`lib/protocols/{types,registry,roundtable-protocol}.js` | PR-1 | PR-3/PR-4 | 纯模块自测 ✓ |
| `lib/personas/*` | PR-2 | PR-4（快照）/PR-5（API） | 纯模块自测 ✓ |
| `lib/protocols/{runner,roundtable-v2,prompt-composer}.js`、`lib/prompts/persona.js` | PR-3 | PR-4 | PR-3 用 fixture registry 自测，**不要求 PR-4 能力** ✓ |
| `lib/render.js` | PR-4 | PR-4 | 同批 ✓ |
| `docs/rollback-v2.md` | PR-4 | — | 同批交付（t7 B5 要求）✓ |
| `test/api-protocols.test.mjs` | PR-5 | — | 同批 ✓ |
| `scripts/pack-check.mjs` | PR-6 | — | 同批 ✓ |

### 8.3 禁改区间（函数语义）

| 区间 | 判据 |
|---|---|
| `engine.js` 的 `runDeliberation` 函数体 | 零 hunk（签名/行为/事件序列） |
| `prompts.js` 六个 v1 构造器（`answerPrompt`/`discussionPrompt`/`reviewPrompt`/`reviewRankingPrompt`/`arbiterPlainPrompt`/`arbiterPrompt`） | 零 hunk；只允许**新增**导出 |
| `meetings.js` 的 `settle()` 与 `emit()` | 零 hunk |
| `core.js` 的 `formatMeeting` | 零 hunk |
| `client.js`：模型加载/`beforeModelUpdate`/每帧参数/几何 | 零 hunk |
| `lib/stage.js` 全文 | 零 hunk |
| `deployed/` | 零改动 |

`client.js:2268-2295 stageSeats` **不在**禁改区（投影层）。`meetings.js:238 stageIndexOf` **不在**禁改区（改为从 `lib/stages.js` import，属纯常量抽取）。

---

## 9. 门禁改造（逐文件:行）

| 文件:行 | 现状 | 改成 | 验证 |
|---|---|---|---|
| `scripts/check.mjs:16-19` | `readdirSync(join(root,"lib")).filter(name => name.endsWith(".js"))` 非递归 | `collectFiles(root,{dir:"lib",suffix:".js"})`（来自 `scripts/walker.mjs`） | 覆盖 10 → 10+N；放一个语法错文件必须失败 |
| `scripts/test.mjs:17-20` | `readdirSync(join(root,"test")).filter(name => name.endsWith(".test.mjs"))` | 递归 + `exclude:["manual"]`；仍 `spawnSync(process.execPath,["--test",...files])` | 新增 8 个文件全被执行 |
| `package.json:32` | `"lib/*.js"` | `"lib/**/*.js"` | 嵌套探针 → 真实文件 → tarball |
| `package.json:44-47` | 仅 `check`/`test` | 增 `"pack:check": "node scripts/pack-check.mjs"`（PR-6） | tarball 清单断言 |
| `cordis.patch.yml:5-23` | 19 键（`core.js:15-36` 20 键，缺 `uploadTtlHours`） | 先补 `uploadTtlHours:24`；再加 §6.1 的 7 个新键；同步 `normalizeConfig`(`core.js:49-112`，注意 `:54` spread 保留未知键) | `Object.keys(DEFAULTS)` 与 yml `config` 键集合相等 |
| `README.md:9` | `0.6.0`（与 `package.json:3` 0.6.1 不一致） | 与 package.json 同版本 | grep |
| `README.md:159-170` | 12 条路由表 | 17 条（+5） | 与 `api.js:310-324` 数量一致 |

### 9.5 门禁与断言的可执行化（G1–G4）

**G1 阶段枚举**
- `MEETING_STAGES` 是 `core.js:713-723` 的**冻结数组**（`Object.freeze([...])`），没有 `.has`。
- 断言写法：`roundtableProtocol.stages.every(s => MEETING_STAGES.includes(s))` 或预构造 `const STAGES = new Set(MEETING_STAGES)`。
- `stageIndexOf` 是 `meetings.js:238-244` 的**私有函数**，不可 import。二选一：
  - (a) **抽取** `lib/stages.js`：`export const STAGE_ORDER = Object.freeze(["answering","discussing","reviewing","deciding"])`，`meetings.js:238` 改为 import（一行替换），协议与测试共用；
  - (b) 不改源码，测试只断言**公开行为**：`create({rounds:0})` 的 `record.stage` 序列不含 `discussing`、`progress.stageCount` 为 4，`create({rounds:1})` 为 5。
- **推荐 (a)**（可读、可测），并在 PR-1 交付；不论 a/b，都**不得**深等 `MEETING_STAGES`。

**G2 客户端与宿主入口的加载方式**
- 事实：`lib/client.js:18-20` 顶层 `window.__ModuleLoader__.load({...})`，裸 Node `import()` 必 `ReferenceError`。
- 正确做法（PR-6 / `pack:check`）：
  1. **宿主入口** `lib/index.js`：在**依赖 fixture 齐备**的解包目录 import（stub `@deepseek-ai/dsh-llm` 等 peer dep，复用 `test/apply.test.mjs:45-55` 的 fakeContext 思路）。
  2. **客户端入口**：`vm.runInNewContext(src, { window: { __ModuleLoader__: { load: (meta, factory) => captured.push(meta.id ? meta : factory) } }, console })`，捕获注册 `id` 与 `factory` 可调用；随后**真浏览器**（本机 GUI）加载同一 tarball 安装结果。
  3. **禁止**为让裸 Node import 成功而修改客户端入口协议（会破坏宿主加载契约）。

**G3 嵌套探针**
- 探针路径：`lib/__pack_probe__/nested/probe.js`。旧 `"lib/*.js"` glob **不会**收它 → 能真正证明递归。
- 用法：`try { write file; pack --dry-run --json; assert files.includes("lib/__pack_probe__/nested/probe.js") } finally { rmSync(dir,{recursive:true,force:true}); assert !existsSync(dir) }`；探针**不提交**。
- 何时用：PR-0（证明 `files` 改动生效）；PR-1 起改用**真实新增文件**清单断言；PR-6 用 tarball。

**G4 POST 对比（受控挂起 + 冻结）**
- 问题：`create()` 在 `meetings.js:946-955` 启动 `execute` 后 `:956` 才返回 detail，两次请求的阶段/任务状态可能不同；`startedAt` 也被漏掉。
- 做法：①spawner 返回**永不 resolve / 由测试 gate 控制**的 handle（受控挂起），使两次请求都停在 `queued` 或同一 `stage`；②注入固定 `nowIso`/UUID/匿名座次（LETTERS 按数组序）；③比较**同阶段投影**（`meetingDetail` 的确定字段集），`scrub` 列表 = `id/createdAt/updatedAt/endedAt/startedAt/language`；④被剔除字段各自断言格式（id 正则、ISO 时间、`language==="auto"`）；⑤`language` **同输入必须同归一化结果**，不称为"随机动态"。
- 若无法受控挂起（并发不可控），退化为"只比较明确字段集"（`topic/status/protocol/participants[].{id,role,personaId}/rounds`），并单列断言动态字段。

### 9.6 三层对象与打包三段式（保留）

- **R-a 三层对象**：`internal view = {record, protocol: protocolOf(record), version: recordVersionOf(record), participants: participantsOf(record)}`／`wire projection`（`meetingSummary` 白名单、`meetingDetail` 版本映射、`formatProtocolReport`）／`persisted record`（磁盘；v1 不含新键）。断言永远针对**明确的一层**。
- **R-b 三段式打包验证**：PR-0 嵌套探针 → PR-1/2/3/4 真实新增文件断言 → PR-6 tarball 解包 import。
- **R-c 确定/动态分离**：深等只用于确定字段；动态字段各自验格式。

---

## 10. 测试清单（8 个新文件 + 1 fixture；含 PR 归属）

| # | 文件 | PR | 关键断言 |
|---|---|---|---|
| 1 | `test/gates.test.mjs` | PR-0 | walker 递归 3 层；`manual/` 排除；符号链接不跟随；嵌套探针路径进入 pack 清单且清理后目录不存在 |
| 2 | `test/registry.test.mjs` | PR-1 | `requireProtocol(undefined)`→roundtable；未知 id→`unknown-protocol`；`listProtocols` 返回冻结数组且**未暴露内部 Map**（`Object.isFrozen` + 无 `set`）；`stages.every(s => MEETING_STAGES.includes(s))` 且与 `STAGE_ORDER` 逐项相等、**不与 `MEETING_STAGES` 深等**；`dataBoundary` 可 import |
| 3 | `test/participants.test.mjs` | PR-1 | §3.5 六条 |
| 4 | `test/personas.test.mjs` | PR-2 | 白名单（多余字段报字段名）；长度/数组/store 总数/文件大小上限；`builtin.*` 不可改删；`snapshot()` 深拷贝；改名/删除后历史快照不变；原子写无 `.tmp`；写失败后旧 JSON 仍可读；`manager.list()` 不受影响 |
| 5 | `test/runner.test.mjs` | PR-3 | 阶段顺序依赖 collect 结果；`maxProtocolSteps` 溢出 `protocol-step-limit`；并发峰值 ≤ `maxConcurrentChildren`；`reduce` 纯（无 runtime context + spy 调用数）；`childTimeout`/`runTimeout` 分别注入；`maxTotalTasks`/`maxTaskOutputChars`/`maxProtocolStateBytes` 各一例；tombstone 过期仍 fail-closed |
| 6 | `test/persona-adapter.test.mjs` | PR-3 | adapter 11 钩子形状；taskId 唯一且含 `participantId`；**无卡席位 prompt 与 v1 构造器逐字节相同**；有卡席位含 `PERSONA` 围栏且围栏标记被转义；快照缺失 → `invalid` + failure，会议继续；恶意卡片（试图声明工具/覆盖安全规则）不改变 `toolPolicyFor` 结果 |
| 7 | `test/record-v2.test.mjs` | PR-4 | v1 读出 `"protocol" in record === false` 且 mtime 不变；v1 终态不被改；v1 **孤儿 running 被修复并写盘**（允许写）；v2 roundtrip；`checkpoint` 终态后 `skipped:"terminal"`；写失败 → `persistence.degraded` + limitation 且继续；**JSON 非安全结果 → task `invalid` 不入 state**；超体积 → 裁剪副本 + `truncated` + `degraded`；`settleProtocol`：报告构造失败 → 有界 fallback → `completed + fallback:true`（⑤B 则 failed）；shadow heal 后 `protocolState`/`finalReport` 仍在；summary 对 v1 无新键 |
| 8 | `test/api-protocols.test.mjs` | PR-5 | 5 组路由信封（GET/POST `/personas` 同条注册）；`workspace-not-registered` 400；未知协议在附件 adopt 前失败（uploads 未移动）；`GET /meeting/export?...&format=json` 返回备份；`/protocols` 404 才降级、500 不降级；`GET` 零写（exports 目录无新文件） |
| 9 | `test/fixtures/protocol-fixture.mjs` | PR-3 | 3 阶段 fixture + 可控失败注入（**非 `.test.mjs`**；测试协议**永不**进生产 registry） |
| — | `test/roundtable-golden.test.mjs` | PR-4 | 见 S4 |

**S1 真实宿主安全（PR-3 fixture 级 + PR-4 Manager 级，两处同一断言集）**

不 mock 被验函数：注册**真实** `agent/created` 监听器（`index.js:610-650` 的 apply 路径），跑 `restrictChildTools`(`:519-602`) 与真实 `runChild`。

1. 逐 stage 记录 `tools.restrict({allow})` 的**入参**（spy 包裹 host registry 的 `restrict`，但 `restrictChildTools` 本体不被替换）。
2. 经 child `tools.get` **读回**可见工具集 `seen`，断言 **`seen ∖ EXCEPTIONS === allow`**（集合差，双向相等；不是"包含关系"）：
   - `EXCEPTIONS` **逐条列名，只有两项**：①`run_code` —— 来源 `index.js:579-585` 的 guard 分支恒放行；②`structured_output` —— 同分支，仅在 `plan.outputSchema` 存在时放行。
   - 反向也断言：`allow` 中若出现 `run_code`/`structured_output` 属实现错误（它们不属于 `WEB_TOOLS`/`plan.allowed`）。
   - **新增工具**出现在 `seen` 且既不在 `allow` 也不在 `EXCEPTIONS` → **断言失败**（fail-closed 的读回兜底）。
   - 基线：answering 无附件时 `allow === WEB_TOOLS`；其余阶段 `allow` 为空 → `seen ⊆ EXCEPTIONS`。
3. 调用**真实安装的 guard**（`index.js:579-585`）：`write`/`edit` 被拒；不在 allow 的 web 工具被拒；`structured_output` 仅在 `plan.outputSchema` 存在时放行；`run_code` 例外沿原契约。
4. `restrict` 抛 / `guard` 抛 / readback 泄漏（第 2 条集合差非空）→ **不得真正开始推理**：断言子 Agent 的**首步回调**、**模型请求**（provider 调用次数）、**结果工厂**（result factory）三者调用次数均为 **0**。
   - **允许**启动请求发生：`startActivation` 已被调用、`childPlans` 已建立属正常时序（`agent/created` 晚于启动请求）→ **不得**把"启动次数为零"当作策略拒绝的判据（真实宿主必红）。
   - 迟到 handle 仍须 `dispose` **恰好一次**（spy 计数）；`childPlans.size` 只作附加断言，**不能**替代 dispose 计数。
   - 拒绝/失败路径结束后**不得泄漏工具可见集**：该 child 的 `tools.get` 不得再读到 restrict 前的集合，host registry 无残留视图、无悬挂 guard/disposer。
5. **恶意 Persona**（卡片内含"允许使用 write/编辑文件/调用任意工具"）：`allow` 集合与 guard 判定**完全不变**。

**S2 卸载与迟到 handle（PR-3 fixture 级；PR-4 验证 Manager 行为）**

1. 走 `index.js:752-767` 的 disposer：`localeWatch → command → tool → meetings.dispose() → lifecycle.abort → activeOperations → activeHandles`。
2. 挂起中的新协议会议 + 迟到 `agent/created` handle：两者各触发 `dispose` **恰好一次**（spy 计数）。
3. 策略销毁后 host registry 无残留（`tools.get` 不再返回 child 视图）。
4. 复用**同一** engine 模块实例的 `childPlans`/`activeHandles`（不复制、不新建同名 Map/Set）。

**S3 取消与无用 plan（PR-3）**

1. `engine.js:295 childPlans.set(childId, plan)` 早于 deadline → 只断言 `startActivation` 不增**不足**。
2. 给 runner 一个**可 spy 的 `runChild` 适配器**：abort 后调用数**不再增加**。
3. 辅以 `childPlans.set` 调用计数 / 新 key 插入记录不增加；覆盖 (a) 队列中已有待执行任务、(b) 阶段切换瞬间发起的 abort。
4. 终态 `childPlans.size === 0` **只作为附加断言**，不作为"没建过 plan"的证明。

**S4 v1 全出口 golden（PR-4）**

`summary` / `detail` / Markdown（`renderExport().markdown`）/ `GET export`（markdown 与 `format=json` 两种）/ `POST save`（文件名 + 内容字节）分别与 fixture 逐字节比较；`exportFilename` v1 = `roundtable-<id>.md`；命令入口（`index.js:278` 路径）与工具入口（`:352-456`）默认输出结构回归（不建记录）。

**S5 快照与产物边界（PR-4）**

`protocol.version/config` 深冻结快照；Persona 改名/删除后既有会议 `personaSnapshots` 不变；`normalizeResult` 对**每个** task 实际调用（spy 计数 = 任务数）；`refused`/`empty`/`invalid` 不进入 `finalReport` 产物；`maxTasksPerStage` 与 `stateBytes` 各一次故障注入。

**S6 create 并发额度（PR-4）**

`maxConcurrentMeetings:1`：第一场用受控挂起 spawner 阻塞 → 第二请求同 workspace 返回 400 `meeting-too-many`；不同 workspace 各自成功；**异步 store 方案**必须在第一次 `await` 前预留名额、`finally` 释放；**同步 snapshot 方案**只要求 `active.set`(`:945`) 之前零 await。

**既有回归**：7 个既有测试文件**一行不改**（K1）；`test/meetings.test.mjs:711-762` 的「写失败 4 次 / shadow 保留 / 晚取消 / dispose / heal」必须被 v2 参数化复用。

---

## 11. 兼容判据与降级标记

| 编号 | 判据（自动断言） |
|---|---|
| K1 | 既有 7 个测试文件零改动，全部通过 |
| K2 | 无 `protocol` 的 POST 与 `protocol:"roundtable"`（**无 personaId**）响应归一后深等；两者都写 `version:1` |
| K3 | 无新能力的 roundtable 新建记录，磁盘 JSON 与 0.6.1 逐字段一致（冻结时间/ID 的 golden）。**若选 ②B（全 v2）**：改为"语义等价 + `docs/record-v2-keys.md` 键清单" |
| K4 | `renderExport().markdown` 与 `filename` 对 v1 fixture 字节一致 |
| K5 | `meetingSummary` 对 v1 **不新增任何键**；`meetingDetail` 对 v1 序列化后逐字节一致 |
| K6 | §8.3 禁改区间零 hunk（按函数语义判定） |
| K7 | 两个**独立**能力位：`enableExperimentalProtocols:false` → `listProtocols()` 仅 roundtable；`personaBinding:"off"` → 选择器不渲染、POST 带 personaId 返回 400。**两者不得互相隐含**（不能用一个实验开关把已承诺的 Persona 选择器一并隐藏） |
| K8 | **终态** v1 记录的 mtime 在「读取 + 列表 + 详情 + 导出」后不变；**孤儿 running/queued** 的生命周期修复（`meetings.js:698-724`）允许写盘，单独测试 |
| K9 | 命令入口（`index.js:278`）与工具入口（`:352-456`）默认行为不变 |
| K10 | v2 记录在 `personaBinding:"off"` 的新版本中可**只读渲染**（不 `requireProtocol`、不 re-run） |

**降级标记（不得伪装成裁决）**

- 报告构造失败 → `finalReport.fallback=true`、不写 `decision`、`limitations += "protocol-report-fallback"`，会议仍 `completed`（⑤B 则 `failed`）。
- 角色不足 → `status:"completed"` 但 `finalReport.incomplete=true`，保留 failures，不生成 ranking/decision。
- 同 route 互审 → 报告层 `limitations: same-route`，Finding 标 `unverified`（**协议层规则**，不在 participants 模块内建）。
- checkpoint 写失败 / 超体积 → `persistence.degraded=true` + `checkpoint-write-failed` / `protocol-state-too-large`；`protocolState.truncated` 标记被裁剪路径。
- 快照缺失 → `limitation: persona-snapshot-missing`。

---

## 12. 风险表

| # | 风险 | P/I | 缓解 |
|---|---|---|---|
| R1 | Runner 绕过 `runChild` → 工具白名单静默失效（安全） | 中/高 | 只 import `runChild`；S1 真实 apply+restrict+guard+readback；S3 spy 计数；grep runner 内 `ctx.subagents` 为空 |
| R2 | checkpoint 挂 `emit` → 静默丢状态 | 高/高 | 新方法 `checkpoint()`；v2 不走 emit；`:325 default: break` 不变 |
| R3 | Persona 异步读破坏 create 并发额度原子性 | 中/高 | 同步 fs 或名额预留；**S6**（PR-4）：`maxConcurrentMeetings:1` + 受控挂起 + 同/异 workspace 断言 |
| R4 | v2 让「零 diff」口径失真 | 中/中 | D1 混合；v2 仅显式启用产生（§5） |
| R5 | summary/detail 加键破坏列表/详情字节 | 中/中 | v1 分支零新增键（K5/S4） |
| R6 | 打包漏洞长期假绿（`test/apply.test.mjs:24` 递归 cp） | 高/中 | 嵌套探针（G3）+ 真实文件断言 + tarball |
| R7 | `client.js` 插入选择器破布局/轮询 | 中/中 | 条件渲染；复用 `:504-528` guard；真浏览器 |
| R8 | Live2D 每帧行为被单测"证明"而实际不同 | 中/中 | 本阶段零改动 |
| R9 | 新 config 键漏进 `cordis.patch.yml` | 高/中 | 键集合相等测试 |
| R10 | 步数/任务/输出上限估算不足 | 中/中 | D8 七项 + 裁剪 + `runTimeoutMs` |
| R11 | 降级回滚把在跑的 v2 改 interrupted | 中/高 | §7.4 + `docs/rollback-v2.md`（PR-4 同批）+ 只读渲染 K10 |
| R12 | `tools.restrict` 未知工具名行为未验证 | 低/中 | `index.js:546` catch→`allow:[]`；测试不传未知名 |
| R13 | 同 route 多 Persona 被误当独立审查 | 中/中 | `modelRouteKey` + 报告披露"同一模型" |
| R14 | 测试数量被当验收真理 | 中/低 | 数量由 walker 实测；不写死数字 |
| R15 | adapter 与 composer 只在单测里跑过，生产接线缺集成 | 中/高 | PR-4 必须走真实 `manager.create`（§4.4b 调用链）+ S1/S5 |
| R16 | 回滚文档与 v2 写入不同批，降级时无从操作 | 中/高 | PR-4 同批交付（§8 PR-4、§7.4） |

---

## 13. 需要拍板（不替用户决定）

> **拍板结果（2026-11-13，用户「全A」）**：①A ②A ③A ④A ⑤A ⑥A。以下保留原始权衡记录，供后续回溯；实现按 §13.7 组合约束执行。

### ① Phase 1 Persona 交付范围
- **A（推荐）** opt-in：显式 `personaId` → roundtable-v2（adapter+composer）+ v2 记录；不传则旧路字节不变。**代价**：+5~7 人日、新增攻击面（composer 注入 + Persona 卡片文本）、需要 §4.4b 全部交付物。
- **B** 仅基础设施：存储/校验/快照 + Manager fixture；**生产 `create()` 收到 `personaId` → 400 `persona-not-supported`**，无选择器。**代价**：Phase 1 无 Persona 生效能力（但诚实）。
- **C** 推迟到 Phase 2：连 `personas` API 可一起推迟。
- **推荐 A**。风险对照：**选 A 的风险** = 工期与 prompt 攻击面（缓解：S1/S5 + 卡片围栏与转义）；**选 B/C 的风险** = 交付了管理能力却无生效路径（用户观感"能存不能用"）。**A 的前置**：adapter+composer+创建期快照必须同批，否则退回 B 的行为（显式 400）。

### ② 记录版本范围
- **A（推荐）** 混合：默认 v1；`personaId` 或非 roundtable 协议才 v2；**显式 `protocol:"roundtable"` 且无 Persona 仍写 v1**（守 K2/K3 字面）。
- **B** 全部新记录 v2：结构统一、贴近设计 §9.3；**代价** = K3 降级为语义等价 + 必须交付 `docs/record-v2-keys.md` + 列表/详情/导出全部走版本分支。
- **C** 全 v1 到 Phase 2：**与 ①A 互斥**（v2 是 Persona 快照的载体）。注意这是本方案的取舍，**不是** "v1 物理上不能存 Persona"。
- **推荐 A**。**组合约束**：①A⇒②∈{A,B}；①B/C⇒② 可为 C；②C⇒①∈{B,C}。

### ③ 同配置多席位是否允许
- **A（推荐）** 允许（`participantId` 各自生成、互不覆盖）；报告披露同源、不独立计票。
- **B** 同 `seatFingerprint` 直接 400 `duplicate-seat`：**代价** = 禁止"同模型同卡同角色"的合法用途（如双轮独立抽样），也禁止客户端复制席位重试。
- **C** 只允许不同 role：**代价** = 同 role 多席位灵活性丧失，且与"同模型不同卡"的用途冲突。
- **推荐 A**。**选 A 的风险**（不是"不选"）= 用户可能把"同一模型两个席位"误当两票（缓解：`modelRouteKey` 独立性 + 报告"同一模型"披露 + UI 同源标记）。实现上**不区分**客户端提供与自动生成 id。

### ④ 实验能力公开边界
- **A（推荐）** 生产目录只列已实现可用协议（Phase 1 只有 roundtable v1 与 v2-persona 路径）；不挂空选项；测试 fixture 不公开。**风险**：只有圆桌时，接口里出现 `protocols` 字段/开关，用户可能误以为已有其它协议 → README 与 UI 需明确"当前仅圆桌"。
- **B** 列出 experimental 置灰：**风险** = 空选项误导（用户点不动）。
- **C** 完全隐藏直到有业务协议：**风险** = 已实现能力不可发现（Persona 绑定无入口）。
- **推荐 A**，并把 **Persona 能力位与 experimental 开关解耦**：`personaBinding`（off/opt-in）独立于 `enableExperimentalProtocols`；K7 不得用一个开关一刀隐藏已承诺的选择器。

### ⑤ checkpoint 失败策略
- **A（推荐）** 继续内存运行 + 可见 `persistence.degraded`（含 code）+ 终态仍 4 次重试 + shadow；**风险** = 进程崩溃时中间态丢失（Phase 1 不 resume）。
- **B** 每阶段强制 durable，写失败即 `terminate("failed")`：**代价** = 直接损失已付费的模型调用（可能几十次子 Agent）。
- **C** 静默忽略失败：**代价** = 丢盘且无告警（不可接受，仅列为对照）。
- **推荐 A**。**组合约束**：选 B 必须**同步替换** §10 表 7 的"继续运行"断言为"终止并 `failed`"，且 §6.1 第 2 条的裁剪超限也按终止处理；正文与测试只能选一种。

### ⑥ 发布版本与真实 GUI 验收
- **A（推荐）** `0.7.0`（新架构、加法式）：**代价** = 需保证 0.6.1→0.7.0 的 v1 兼容（K1–K9）与发布说明成本。
- **B** `0.6.2`：**代价** = patch 语义误导（新增协议/Persona/API 不是 patch 级变化）。
- **C** 不发版：**代价** = 无法对用户交付，只留内部 commit。
- **推荐 A**；**部署授权独立**：推荐版本号不等于已获部署许可，真 GUI 验收需另行授权。
- **真浏览器清单**（DSH 0.2.2-rc.1，`http://127.0.0.1:19881`）：⑴旧会议列表/详情/导出无回归；⑵`/protocols` 可用时选择器可见、不可用时不出现；⑶Persona 选择器仅在 `personaBinding==="opt-in"` 时出现；⑷错误路径（未知协议/重复 participantId/`persona-not-supported`/`workspace-not-registered`）提示正确；⑸窄屏（~380px）不破；⑹刷新后 v2 会议从 `protocolState` 恢复阶段显示（不依赖内存）；⑺卸载/重载插件后无残留工具视图。
- 注：客户端热更新链路（是否需 `pnpm run dev:web` 或重建）**未验证**，PR-5 开工前实测。

### 13.7 决策依赖表（组合约束）

| 选择 | 必需交付 | 禁止组合 | 受影响的验收 |
|---|---|---|---|
| ①A | adapter + composer + 创建期快照 + v2 写入（PR-3/PR-4） | — | S1/S5、§10 表 6 |
| ①B / ①C | Persona 存储 + **生产 400** | 不得出现选择器 | K7（personaBinding off） |
| ②A | 版本分派 + K2/K3 字面 golden | — | §10 表 7、S4 |
| ②B | `record-v2-keys.md` + 语义等价 golden | — | K3 降级 |
| ②C | — | **与 ①A 互斥** | — |
| ③A / ③B / ③C | 身份规则 + 披露 | — | §3.5 第 3/4 条 |
| ④A | 两个独立能力位 | 不得用 `enableExperimentalProtocols` 隐藏 Persona | K7 |
| ⑤A / ⑤B | 二选一，正文与测试同选 | 混用 | §6.1、§6.4、§10 表 7 |
| ⑥A/B/C | 版本号 + README/CHANGELOG | 推荐 ≠ 授权 | 部署另行授权 |

---

## 14. 本轮不做

1. Elo/长期模型排行榜（设计 §16）。
2. 自动选模型 / 自动购买额度。
3. 自动化真实渗透或攻击执行。
4. 无限轮自由群聊。
5. Agent 自行增加参与者。
6. 每协议独立 API / 独立存储 / 独立前端。
7. Persona 自行配置工具权限（Persona 永远不是工具策略输入）。
8. 强制所有协议出共识。
9. **为统一而重写 `runDeliberation()`**（该函数零 hunk）。
10. Red Team / Pro-Con / Socratic / Pre-mortem 协议本体（Phase 2–5）。
11. resume（从 `protocolState` 续跑）与增量 checkpoint 优化（Phase 1 只存不续）。
12. 协议专属导出美化（只做正确性分支）。
13. Live2D 座位铭牌 / 新角色 rig（`stage.js` 零改动；多 role 座位只做 `stageSeats` 投影）。
14. 命令/工具入口的 `protocol`/`persona` 参数（README 明示不做）。
15. 旧版 0.6.1 直接查看 v2 记录（只能通过导出备份，见 §7.4）。

---

## 15. 未验证与已知限制

1. `runChild` 返回的 `handle.result` 字段形状（`engine.js:374`）→ `normalizeResult` 双路兜底；PR-3 用真实 provider 观测一次。
2. `tools.restrict` 传未知工具名的确切行为（只有 `index.js:546` catch 兜底）。
3. DSH 0.2.2-rc.1 客户端插件热更新链路（见 §13 ⑥ 注）。
4. `preview/`、`deployed/` 是否随包/随插件加载（影响 PR-5 验证路径）。
5. 既有测试用例数未复跑（数量不作判据，R14）。
6. VM 内加载 `client.js` 捕获 factory 后能否在不触发真实 React 的情况下完成"可调用"断言——需在 PR-6 实测（**未验证**）。
7. 真 GUI 验收需部署授权；本轮全部结论基于静态核对。
8. `cordis.patch.yml` 新增 7 个键后，宿主配置加载器的未知键行为未验证（只验证了集合相等）。

---

## 16. 附录：t5 非阻塞纠偏的落实

| t5 指出 | 本文处置 |
|---|---|
| `cordis.patch.yml` 键数与 DEFAULTS 不等（缺 `uploadTtlHours`） | §9 表格：先补 `uploadTtlHours`，再键集合相等 |
| `Object.freeze(Map)` 不冻结 `set/delete` | §8 PR-1：只导出函数 + 冻结数组，Map 私有（D12） |
| "npm pack 唯一"过强 | §9.5 G3：嵌套探针 + 真实文件 + tarball |
| `stageSeats` 只筛 answerer，与"Live2D 零 hunk"冲突 | §8.3：禁改区缩到模型加载/每帧/几何 |
| 三个执行入口 | §4.5 表 + K9 |
| `runChild` 已 abort 仍建无用 plan | §10 S3（spy + `childPlans.set` 计数） |
| "runChild 调用数 == 任务数"不能证明 reduce 不调模型 | §10 表 5：无 runtime context + spy |
| golden 漏 `startedAt`、匿名座次需固定 | §9.5 G4、S4 |
| POST 深等需归一 | §9.5 G4（受控挂起） |
| 测试数量不作判据 | §12 R14 |

---

## 17. 自检清单（t8 交付）

### 17.1 五组 t7 findings → 章节

> 行号为**本文件当前版本**（写入后实测），仅供定位；后续编辑会漂移，以章节锚点为准。

| finding | 落实位置（章节 + 行号） | 关键交付 |
|---|---|---|
| V2-F2-PATH（blocker） | §4.2（L133）/§4.3（L141）/§4.4a（L150）/§4.4b（L161–227）、§4.5（L229）、§8 PR-3（L423）/PR-4（L428）/PR-5（L433）、§10 测试表（L532–545）、S1（L547）、R15（L630） | 11 钩子表 + 逐阶段注入表 + 调用链 + 无卡回退 + B 方案 400 + 批次归属（PR-3 交付默认关闭 / PR-4 集成 / PR-5 开放） |
| V2-GATES | §9.5 G1（L499）/G2（L507）/G3（L514）/G4（L519）、§9 门禁表（L485–496）、§8 PR-0（L408）/PR-6（L438）、§10 表 2（L537）、S4（L571） | `includes()`/`new Set`、`lib/stages.js` 抽取、VM 加载客户端、嵌套探针、受控挂起 POST |
| V2-TEST-SECURITY | §10 S1（L568）/S2（L585）/S3（L592）/S4（L599）/S5（L603）/S6（L607）、§12 R1–R3（L612–633）、§8 PR-3（L423）/PR-4（L428） | 真实 apply+restrict+guard+readback、卸载/迟到 handle、取消 spy+count、v1 全出口 golden、快照深拷、并发额度 |
| V2-CONTRACT-CHECKPOINT | §6.1（L255）/§6.2（L293）/§6.3（L305）/§6.4（L323）/§6.5（L344）、§10 表 7（L542）、§11 K8（L598）、§5 末段（L241–251） | 内存态/持久化副本分离、JSON 非安全拒绝、超体积 degraded+code、签名 `at/budget`、终态 fallback 单义、K8 限终态 |
| V2-ORDER-EXPORT | §7.1（L356）/§7.2（L364）/§7.3（L387）/§7.4（L391）、§8 PR-1（L413）/PR-4（L428）/PR-6（L438）、§8.2（L443）、§10 表 8（L543） | 纯 `renderExport`（GET 零写）、`/meeting/export?...&format=json`、回滚文档同批、逆序回滚表、PR-1 纯契约 |
| F1 残留 | §3.1（L78，规则 1/5）/§3.2（L95）/§3.3（L103）/§3.4（L109）/§3.5（L116） | 单会议唯一、删除显式/缺省二分、v1 规模上限不受 v2 影响 |

### 17.2 四个门禁替代 → 可见位置

1. `MEETING_STAGES.includes` / `new Set` → §9.5 G1（L499）、§10 表 2（L537）。
2. 客户端 VM 加载（不裸 import）→ §9.5 G2（L507）、§8 PR-6（L438）、§15 第 6 条（L718）。
3. 嵌套探针 `lib/__pack_probe__/nested/probe.js` → §9.5 G3（L514）、§8 PR-0 ④（L408–412）、§10 表 1（L536）。
4. 受控挂起 POST 对比 + scrub 含 `startedAt` + `language` 同归一 → §9.5 G4（L519）、§10 表 8（L543）、S4（L571）。

### 17.3 六决策风险与组合约束 → 可见位置

| 决策 | 风险归属（已纠正） | 组合约束 |
|---|---|---|
| ①Persona（L637） | 选 A = 工期/攻击面；B/C = 无生产生效 | §13.7（L675）：①B/C ⇒ 生产 400 + 无选择器 |
| ②版本（L643） | ②B = K3 降级/键清单；②C = 与①A 互斥 | 显式 roundtable 无 Persona 仍 v1（K2，L592） |
| ③席位（L649） | **选 A** = 误当多票；B = 限制重复用途；C = 限制同 role | 不区分 id 来源；单会议唯一（§3.1，L78–93） |
| ④公开（L655） | A = 仅圆桌易误解；B = 空选项；C = 不可发现 | 两个独立能力位（K7，L597），不互相隐含 |
| ⑤失败（L661） | **选 A** = 崩溃丢中间态；B = 损失付费计算；C = 静默丢盘 | ⑤B ⇒ 替换"继续运行"断言为终止（§6.1 第 2 条，L255–291 内；§10 表 7 L542） |
| ⑥发布（L667） | A = 兼容/发布成本；B = patch 语义误导；C = 不交付 | 推荐 ≠ 部署授权（L671） |

### 17.4 批次自检

- 每个 PR 有独立验收；新增文件与其首个消费者同批或"自身可测"（§8.2 表）。
- 逆序回滚（依赖**闭包**，与 §8.2 逐字一致）：`PR-6 → PR-5 → PR-4（先让所有 v2 会议进入终态并导出 JSON/Markdown 备份）→ PR-3 → PR-2 → PR-1 → PR-0`；仅"当且仅当该批无下游引用"的栈顶批次可单独 revert（全部合入后只有 **PR-6**，其余为**无**）。**残留判据（与对侧章节逐字一致）**：保留文件无指向已撤符号的悬空 import/引用；被删除的本批实现与自测不计入残留；并在该回退版本上跑 `npm run check`/`npm test`/pack 清单。
- 无"前批依赖后批验收"：PR-1 只做纯契约（生产分派验收在 PR-4）；PR-3 用 fixture registry 自测（不要求 PR-4）。