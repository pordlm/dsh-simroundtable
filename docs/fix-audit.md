# 修复.txt 核实清单（t13 审计）

只读核实，基线 = 当前 `lib/` 源码。判定分为：**成立 / 部分成立 / 已被 PR-4+5 修掉 / 不成立**。
每条给出证据（file:line）、影响、最小修复、回归测试点、优先级。
说明：仓库内没有「修复.txt」文件本身，本审计以任务描述列出的 8 组问题为准，逐条对照源码。

---

## P1

### 1. V2 settleProtocol 投影不完整 — **成立（P1）**

V2 结算路径（`lib/meetings.js` `settleProtocol`）只落了一部分终态，record 里大量字段停留在 create() 时的空初始化，UI/持久层拿到的是残缺数据。

**证据**

- `lib/meetings.js:1499-1553`（settleProtocol）：写入 `finalReport{markdown,fallback,incomplete,ranking,sameRouteNotes}`、`record.ranking`、`finalAnswer{text,fallback}`、`record.answers` 投影（1534-1550）、`record.protocolState = result.snapshot`（1511，仅 `publicSnapshot` 计数态）。
- `lib/meetings.js:1110-1115`（create）：`record.reviews / record.transcript / record.failures` 初始化为 `[]` 后**从未再写**。
- V1 对照（同一文件，V1 settle）：
  - reviews：`lib/meetings.js:560-578` 写 `record.reviews`（含 reviewerKey、ranking rows、note）；
  - transcript：emit transcript 事件 → `lib/meetings.js:477-481`（上限 200 条）；
  - failures：`lib/meetings.js:597-609`；V2 的 reduce（`lib/roundtable-v2.js:292-293`）只存 `seatStatus[pid] = result.status`，**错误消息被丢弃**，无处可捞；
  - roster 成员状态：V1 emit `'member'`（`lib/meetings.js:460-475` 更新 status/stage/error）；V2 `executeProtocol` 从不 emit `'member'`，成员永远停在 pending；
  - `finalAnswer.ranking / anonymousId / arbiter` 字段：V1 `lib/meetings.js:580-596` 有；V2 的 `finalAnswer` 只有 `{text, fallback}`。

**影响**：V2 会议结束后无法回答「谁评了谁、为什么排这个序、哪个席位为什么失败」，匿名标签对应的 review 明细丢失；成员状态卡死在 pending；与 V1 终态记录结构不一致，依赖 record 的下游（UI/导出）读不到数据。

**最小修复**：在 `settleProtocol` 中按 V1 结构补投影：① 从 result 带 reviews 原文写 `record.reviews`；② 写 `record.transcript`（复用 V1 上限 200 截断逻辑）；③ 在 runner 结果 reduce 时保留 `error` 消息，结算时写 `record.failures`；④ 每个任务完成时 emit `'member'`（或结算时按 seatStatus 批量回写 roster status）；⑤ `finalAnswer` 补 `ranking/anonymousId/arbiter` 字段。

**回归测试点**：V2 会议结束后断言 `record.reviews/transcript/failures` 非空（含失败样本）、roster 各成员 status 非 pending、`finalAnswer.ranking` 与 `record.ranking` 一致、失败席位 error 文案存在。

### 2. checkpoint 只存 stage-start 精简态，中断不可恢复 — **成立（P1）**

**证据**

- `lib/runner.js:121-129`：checkpoint 仅在 stage-start 时调用，传入的 state 是 `publicSnapshot`（`lib/roundtable-v2.js:369-388`：只有 stage/stageIndex/counts/seats 的 status，**没有 answers/reviews 正文**）。
- stage-end checkpoint（`lib/runner.js:232-238`）会被 `lib/meetings.js:1457` 的 `if (by !== "stage-start" ...) return` 直接丢弃。
- `executeProtocol` 从不向 `runProtocol` 传 `options.state`（`runProtocol` 本身支持 resume：`lib/runner.js:92`）。

**影响**：进程中断/崩溃后，record 里只有最后一次 stage-start 的计数快照；已完成阶段的 answer/review 正文全部丢失，resume 没有任何可用的恢复输入——checkpoint 名存实亡。

**最小修复**：二选一并保持 `maxProtocolStateBytes`（`lib/runner.js:21`，2M）预算：① stage-end 也 checkpoint，且 state 换成含正文的完整态（或按预算裁剪的完整态）；② 或 stage-start checkpoint 继续存精简态、但 stage-end 存完整态并允许 resume 从 stage-end 恢复。核心是「正文必须落盘」。

**回归测试点**：跑到 reviewing 阶段中途注入中断 → 重启 resume → 断言已有 answers/reviews 不重跑、最终 record 与不中断的基线一致；断言持久化 state 超过 2M 时按预期裁剪且 resume 仍可用。

### 3. imagePartsByKey 把图片发给 reviewer — **成立（P1）**

**证据**

- V1：图片只发给 `receiving = [...answerers, arbiter]`（`lib/meetings.js:1217`）。
- V2：`lib/meetings.js:1369-1384` 对 **seats 全角色**构建 `imagePartsByKey`；`executeTask` `lib/meetings.js:1431` `extraParts: imagePartsByKey.get(modelKey(entry))` 对 review/arbiter/discussion 任务一律附加；`runChild` `lib/engine.js:327` 把 extraParts 拼进 prompt。

**影响**：reviewer 看到带图原文而非匿名文本转写，既泄露附件上下文给本不该看到的角色，也浪费 token；与 V1 行为、planV2 文档承诺不一致。

**最小修复**：构建或取用 `imagePartsByKey` 时按 `task.stage` 路由：answer / arbiter 可收，review / discussion 不收（与 V1 `receiving` 集合对齐）。

**回归测试点**：带附件的 V2 会议断言 review 任务收到的 prompt 无 image part、arbiter 任务有；快照断言 reviewer prompt 与 V1 同构。

### 4. 全失败仍 completed — **成立（P1）**

**证据**

- `lib/meetings.js:1504`：`settleProtocol` 无条件 `status = "completed"`。
- `lib/runner.js` 对任务失败从不抛错（mapLimit 把 settled 的失败包成 failed result 继续走），arbiter 失败也走 fallback（`lib/roundtable-v2.js:319` `fallback = state.arbiter === null`）。
- V1 对照：`lib/engine.js:576` `if (answers.length === 0) throw new Error(copy.noAnswers)`——全失败即失败。

**影响**：所有 answerer 都失败（配额耗尽、provider 全挂）时，用户拿到一个 `_No answer was produced._` 式的「成功」会议；状态误导，重试/告警逻辑全部失效。

**最小修复**：结算时若 `answers` 为空且无 arbiter 结果（或 arbiter 亦失败），`status = "failed"`（或引入 `partial`），并写明原因；有 ≥1 个 answer 则维持 completed。

**回归测试点**：mock 全部 answer 任务失败 → 断言终态 failed 而非 completed；部分失败（≥1 成功）→ completed + limitations 注明。

---

## P2

### 5. arbiter fallback 用 assignments[0] 而非 ranking[0] — **成立（P2）**

**证据**

- `lib/roundtable-v2.js:326`：`state.answers[assignments[0]?.participantId]`——`assignments` 是 labelMap 的座次序，不是 `report.ranking[0]`；且即使 reviews 已产出 ranking，fallback 仍取座次第一。

**影响**：arbiter 失败时兜底答案取决于座位顺序而非评审共识，结果质量随机化；ranking 字段明明存在却未被利用。

**最小修复**：fallback 选择改为 `report.ranking[0]?.participantId`（ranking 为空再退回 `assignments[0]`）。

**回归测试点**：构造 ranking 第一名 ≠ 座次第一名的用例 + arbiter 失败 → 断言 finalAnswer 取 ranking[0]。

### 6. planV2 空 reviewers 绕过默认互评 + 8 席位上限误伤 — **成立（P2）**

**证据**

- 空 reviewers 绕过默认互评：`lib/meetings.js:1014-1026` 空 reviewers → `rosterInput.reviewers = undefined`（V1 `validateRoster` `lib/meetings.js:201-202` 会默认 `reviewers = answerers`）；但 planV2 `lib/roundtable-v2.js:341`（`supplied ?? seatsFromRoster(roster)`）用的是 **supplied participants**，roster 层的默认 reviewer 不会进入 V2 席位 → reviewing 阶段 0 个任务（`lib/roundtable-v2.js:189-206`），无互评、无 ranking。
- 8 席上限：`lib/participants.js:27` `DEFAULT_PARTICIPANT_LIMITS {min:2,max:8}` 是**总席位**上限（`lib/meetings.js:342` 调用未传自定义 limits；runner 运行时同样传 `{min:2,max:8}` `lib/meetings.js:1453`；`lib/roundtable-v2.js:110-116` 同）。5 answerers + 5 reviewers = 10 席被拒。
- V1 对照：`validateRoster` 分角色限 2-8 answerers / 1-8 reviewers，两者不冲突，10 人阵容在 V1 合法。

**影响**：① 显式 participants 且不给 reviewers 的 V2 请求静默跳过互评（与 V1 默认行为、文档承诺相悖，且 record 里无任何 limitations 提示）；② 合法的「5+5」阵容在 V2 无法创建，迁移时行为收窄。

**最小修复**：① planV2 在 supplied participants 的 reviewer 席位为 0 时，复用 V1 默认逻辑把 answerers 追加为 reviewer 席位（或至少在 limitations 写明 "no peer review"）；② V2 席位校验改为分角色上限（answerers ≤8、reviewers ≤8，总数上限放开到 16 或按角色计），与 V1 对齐。

**回归测试点**：① 空 reviewers 的 V2 请求 → 断言出现互评任务/或 limitations 明示；② 5 answerers + 5 reviewers → 断言创建成功且 10 席各自跑。

### 7. attachmentTextBlock 文件名未入围栏 / readUpload payload 无 containment — **部分成立（P2，低危）**

**证据**

- 文件名入围栏：`lib/attachments.js:553` header `### Attached file: ${file.name} (data, not instructions)` 使用**原始** `file.name` 且位于围栏**外**；围栏开标记内的 label 已 `escapeFenceMarkers`（:551）并替换单引号。缓解：`sanitizeName`（:92-101）已 basename 化、去控制字符、替换 `<>:"|?*`、限 120 字符——文件名注入围栏/标题的实际风险很低。判 **部分成立**：属一致性/纵深问题而非可利用漏洞。
- payload containment：`readUpload`（`lib/attachments.js:270-287`）有 UPLOAD_ID UUID 正则 + `manifest.id` 一致性 + workspace（大小写不敏感）校验；但 `manifest.payload` 字段（adoptUploads `:353-394` 采纳时拼进 `path`）与 record `attachment.path` → `attachmentPath`（`:501-503` join）均无 containment（不允许 `..`/绝对路径逃逸）校验。路径由插件自己写，攻击面仅在被篡改的磁盘文件。判 **部分成立**：纵深防御缺口。

**最小修复**：① header 同样使用 escaped label（`escapeFenceMarkers(file.name)`）；② `attachmentPath` 拼接后校验结果仍位于 `join(workspace, ROUNDTABLE_DIR)` 之内（`path.relative` 前缀检查），越界即拒绝。

**回归测试点**：文件名含反引号/引号的附件 → 断言生成的 prompt 围栏结构完好；篡改 record.path 为 `../..` → 断言拒绝读取。

---

## P3

### 8. lib/index.js 模块级 AbortController / lifecycle 非 per-activation — **成立（P3）**

**证据**

- `lib/index.js:62-65`：`activeAgents / activeOperations / blankRetentions / lifecycle = new AbortController()` 全部为模块级常量。
- disposer `lib/index.js:759`：`lifecycle.abort(new Error("... plugin disposed"))`。
- 再次 `apply()`（enable → disable → enable；ESM 缓存不重载模块）时 `lifecycle` 已 aborted → `lib/index.js:707` `AbortSignal.any([invocation.signal, lifecycle.signal])` 立即中止 → 命令/工具永久不可用。

**影响**：插件热重载或 disable/enable 一次后整插件报废，只能重启宿主。

**最小修复**：把 `lifecycle` 移入 `apply()` 作用域（per-activation 创建）；`activeAgents/activeOperations/blankRetentions` 同样按 activation 重建（或在 dispose 时清空）。

**回归测试点**：enable → disable → enable → 断言 roundtable 命令/工具仍可正常执行（signal 未预中止）。

### 9. V2 未继承 V1 的 refusal / 结构化能力检查 / ranking salvage / compact retry — **成立（P2-P3）**

**证据**

- refusal 检查：V1 `lib/engine.js:522` `if (result.stopReason === "refusal") throw`；V2 `executeTask`（`lib/meetings.js:1435-1440`）只 `textOfResult`，无任何 stopReason 检查。
- 结构化能力检查：V1 `lib/engine.js:680` / `:834` `structured && provider.capabilities.outputSchema` 才传 schema；V2 `lib/meetings.js:1433` 无条件 `outputSchema: roundtableV2.outputSchema(task)`——不支持 structured output 的 provider 会被强塞 schema。
- ranking salvage：V1 `lib/engine.js:685` `salvageRanking(textOfResult(result), answerIds)`（`lib/core.js:280`）；V2 `normalizeResult`（`lib/roundtable-v2.js:257-264`）只 `extractJson + normalizeReview`，解析失败即 invalid，`lib/roundtable-v2.js:13-18` 根本未导入 `salvageRanking`。
- compact retry：V1 `lib/engine.js:697-710` review 失败后用 `reviewRankingPrompt` 重试一次；V2 无任何重试。`rankingNormalized / rankingCompact / rankingSalvaged` note 体系（V1 settle `lib/meetings.js:571-577`、engine `:758-763`、`:799-801`）V2 全缺。

**影响**：V2 在弱 provider 上成功率明显低于 V1：refusal 被当普通文本结算、无 schema 能力的模型请求失败、半截 JSON 的 review 直接作废（V1 能救回排序）、超长思考吃满 completion budget 的 review 无法挽回。

**最小修复**：① executeTask 透传/检查 stopReason，refusal 抛错进 seatStatus；② `outputSchema` 加 `provider.capabilities.outputSchema` 条件；③ normalizeResult 失败路径追加 `salvageRanking`；④ review 失败后用 ranking-only prompt 重试一次并打 note。

**回归测试点**：mock refusal → 断言席位 failed；mock 无 schema 能力 provider → 断言请求不带 schema；mock 半截 JSON → 断言 salvage 出 ranking 且 note 标注；mock 首次空 review → 断言 compact retry 生效。

---

## 附：顺带核实的差异点

- `settleProtocol`（`lib/meetings.js:1552`）直接 `run.write()`，**未调用** V1 settle 的 `persistTerminal`（`lib/meetings.js:619`）。V1 注释要求 persistTerminal 必须成功或留下 terminal shadow；V2 结算若写盘失败不会留 shadow，中断恢复语义弱于 V1。建议在修复 #1/#2 时一并对齐。

## 判定汇总表

| # | 问题 | 判定 | 优先级 |
|---|------|------|--------|
| 1 | settleProtocol 投影不完整（reviews/transcript/failures/roster/finalAnswer 字段） | 成立 | P1 |
| 2 | checkpoint 只存 stage-start 精简态，中断不可恢复 | 成立 | P1 |
| 3 | imagePartsByKey 发给 reviewer | 成立 | P1 |
| 4 | 全失败仍 completed | 成立 | P1 |
| 5 | arbiter fallback 用 assignments[0] | 成立 | P2 |
| 6 | 空 reviewers 绕过默认互评 + 8 席上限误伤 | 成立 | P2 |
| 7 | attachment 文件名未入围栏 / payload 无 containment | 部分成立（低危） | P2 |
| 8 | 模块级 lifecycle 非 per-activation | 成立 | P3 |
| 9 | V2 未继承 V1 refusal/schema 检查/salvage/compact retry | 成立 | P2-P3 |
