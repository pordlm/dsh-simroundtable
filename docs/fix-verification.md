# fix-verification —「修复.txt」8 条回归场景验证

基线：t15（P1 批次）+ t18（P2/P3 批次）修复完成后的代码。
验证命令：`npm test`（145/145 通过）、`npm run check`（lib/ 24 文件语法全过）、`node --check lib/client.js`（通过）。

| # | 场景 | 结论 | 验证方式 |
|---|---|---|---|
| ① | 一个 answerer 失败另一个成功 | 通过 | `node --test test/settle-v2.test.mjs` → `a partially failed run still settles with failures, roster states and a transcript`：会议仍 completed，failures 记录失败席位（stage/error），roster 成员状态 done/failed 正确，transcript/reviews/finalAnswer/protocolFullState 完整落盘（manager.detail 与磁盘 JSON 双重断言）。 |
| ② | 全部 answerer 失败 | 通过 | 同文件 → `a run whose answerers all fail is failed, not completed`：终态 failed，failures 含 noAnswers 文案，不会伪装 completed。 |
| ③ | arbiter 失败取排名第一 | 通过 | 同文件 → `a failed arbiter falls back to the top-ranked answer`（本次新增）：finalAnswer.fallback=true，text=排名第一的答案文本（非座次第一），arbiter 字段不出现在结果中，failures 记录 "arbiter boom"。实现：roundtable-v2.js buildReport 用 ranking[0].answerId 经 labels 映射回席位。 |
| ④ | reviewer 不收图片 | 通过 | 同文件 → `image parts reach answerers only, text bodies stay in prompts, personas ride the seat`：answer 任务 partCount=2（文本+图片），review 任务 partCount=1（仅文本、无图片、无附件正文），arbiter partCount=2。图片按 stage 门控（answer/arbiter 才带）。 |
| ⑤ | 自定义 reviewer 全部失败 | 通过 | 同文件 → `custom reviewers that all fail still complete with an incomplete report`（本次新增）：reviews 为空，finalReport.incomplete=true，arbiter 正常裁决时 fallback=false，失败 reviewer 进入 failures。会议不因评审全失败而失败（只要答案有效）。 |
| ⑥ | 完成后刷新可见排名/评审/transcript/失败 | 通过 | 场景①测试即覆盖：manager.detail（页面读取路径）与 onDiskRecord（磁盘 JSON）断言 reviews（含 reviewer 匿名排名行）、transcript（answering/reviewing/deciding 条目）、failures、roster 成员状态、finalAnswer.ranking/anonymousId/arbiter 全部存在；settle 走 persistTerminal（重试+terminal shadow+heal，另见 `persistTerminal degrades to a terminal shadow and heals on a later good write` 测试）。 |
| ⑦ | 中途退出保留已完成阶段 | 部分通过（按契约范围） | stage-end checkpoint 现携带完整 reduce 后 state（runner.js），并写入 record.protocolFullState 持久化（settle 场景①断言 protocolFullState 存在）；checkpoint 写盘失败降级为 limitation 继续跑（copy.checkpointDegradedNote）。**自动 resume 未实现**（captain t18 契约明确本次不承诺 resume，记 0.7.1 已知限制）：中断后已完成阶段正文在记录中可读，但重启进程不会自动续跑。 |
| ⑧ | disable→enable 后再开会 | 通过（无专项自动化测试） | lib/index.js lifecycle 改为 per-activation：disposer abort 后立即 new AbortController()，ESM 缓存复用模块时新 activation 拿到活控制器，命令/工具不再永久中止。专项 disable→enable 集成测试需完整 DSH 宿主 ctx，延后 0.7.1；现有 `npm run check` + apply.test.mjs 全绿兜底。 |

## 其他已修项的回归锚点

- 空 reviewer 自动回退：`an empty reviewer list falls back to answerers reviewing each other`（合成 2 个唯一 id 的 reviewer 席位、limitation 落盘）。
- 文本附件正文不丢：场景④同一测试断言 answer prompt 含 "hello world"。
- route key 保留 / sameRouteNotes：场景④同一测试断言 participants[0].modelRouteKey 与 sameRouteNotes 分组。
- Persona 注入：场景④同一测试断言仅带 persona 的席位 prompt 含 Persona 卡内容。
- 附件安全：attachments.test.mjs 全绿（header 围栏转义、payload containment 校验）。
- runner state 字节数：runner.test.mjs checkpoint 测试全绿。

## 未完全满足项（不静默）

1. ⑦ 自动 resume：未实现，原因与范围见 captain t18 契约；建议 0.7.1 基于 stage-end checkpoint 的完整 state 实现 runProtocol resume。
2. ⑧ disable→enable 集成测试：需宿主级 ctx mock，延后 0.7.1；当前以代码审查 + check 兜底。
3. compact retry（v1 的 reviewRankingPrompt 重试）：按 captain 决定记 0.7.1 已知限制，ranking salvage 已兜底。
