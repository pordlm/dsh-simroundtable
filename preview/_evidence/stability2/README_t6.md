# T6 独立验证报告：T1（终态 durable 写盘）/ T2（agents.create 可中断）/ T3（stage-specific web）

- 验证人：verifier（team stability-hardening-6）
- 验证对象：工作区 `D:\dsh_simroundtable` 的未提交修复（HEAD = `ec6550c`）
- 范围：只读验证；除本报告与注入脚本 `preview/_evidence/stability2/inject_t6.mjs` 外未修改任何资产/代码
- 约束：未调用任何真实模型；所有注入均在内存态完成
- 总体结论：**PASS（7 项全部通过）**

## 0. 环境与方法

- 被测文件（工作区已修改）：`lib/copy.js`、`lib/engine.js`、`lib/index.js`、`lib/meetings.js`、`lib/prompts.js`，测试 `test/apply.test.mjs`、`test/core.test.mjs`、`test/meetings.test.mjs`（另有 `test/manual/api-live.e2e.mjs` 的无关改动）。
- 无修复基线：`git worktree add --detach .tmp\t6-head ec6550c`，再把当前三个测试文件原样复制进去运行，用于非空洞对照。
- 单点隔离树：`.tmp\t6-iso-t1`（基线 lib + 仅当前 `lib/meetings.js`）、`.tmp\t6-iso-t3`（基线 lib + 仅当前 `lib/engine.js`/`index.js`/`prompts.js`/`copy.js`），用于证明修复文件确实承重。
- 行为注入：`node preview/_evidence/stability2/inject_t6.mjs`，脚本直接 import 仓库 `lib/*.js`，构造假的 `agents`/`subagents`/`llm`/`workspaceRegistry`，打印 `PASS/FAIL` 与证据。

## 1. 全量回归（必修）— PASS

| 命令 | 结果 |
| --- | --- |
| `npm test` | `1..81`、`# tests 81`、`# pass 81`、`# fail 0`（约 12.5s） |
| `npm run check` | `dsh-simroundtable: node --check passed for all 10 files under lib/` |

说明：81 条含 T1/T2/T3 新增用例，以及 t4/t5 一并落入工作区的 resolveWorkspace / 附件校验用例；全量无失败。

## 2. 非空洞对照（无修复版本必须失败）— PASS

### 2.1 基线 worktree（ec6550c，新测试原样拷入）

命令：`git worktree add --detach .tmp\t6-head ec6550c` → 复制 `test/meetings.test.mjs`、`test/apply.test.mjs`、`test/core.test.mjs` → `node --test test/meetings.test.mjs test/apply.test.mjs test/core.test.mjs`

退出码 1，失败用例（即新增能力在旧代码上确实为红）：

- `not ok 1 - apply registers /roundtable and runs a cross-provider round`（T3 全链路）
- `not ok 2 - web capability is stage-specific and attachment-aware`（T3）
- `not ok 28 - prompts carry the topic and the language rule`（T3 prompt 分支）
- `not ok 41 - an orchestrator creation that never resolves still ends the meeting`（T2）
- `not ok 42 - an orchestrator that arrives after the deadline is disposed, not leaked`（T2）
- `not ok 46 - a completed record is retried until the terminal write is durable`（T1）
- `not ok 47 - a completed record whose write keeps failing stays completed in memory instead of becoming interrupted`（T1）
- `not ok 48 - a failed meeting keeps its terminal shadow when the write keeps failing`（T1）
- `not ok 49 - a cancelled meeting keeps its terminal shadow when the write keeps failing`（T1）
- `not ok 51 - the page API only accepts a workspace the host has registered`（t4 范围，非 T1–T3；一并列出以免误读）

典型失败原因（旧代码）：

- T2：`expected 'failed' actual 'running'`（41/42，超时没能终止 `agents.create()`）。
- T1：`expected 2 actual 1`、`expected 4 actual 1`（46/47，终态只有一次写、无重试/shadow）。
- T3：restrict allow 深度比较不一致；`answerPrompt(..., {web:false})` 仍匹配 `/at most twice/`（prompt 未按能力分支）。

### 2.2 单点隔离（证明文件承重，非互相搭便车）

| 隔离树 | 仅叠加的当前文件 | 目标用例 | 结果 |
| --- | --- | --- | --- |
| `.tmp\t6-iso-t1` | `lib/meetings.js` | T1/T2 六条 | `# pass 6 # fail 0` |
| `.tmp\t6-iso-t3` | `lib/engine.js`、`index.js`、`prompts.js`、`copy.js` | `web capability is stage-specific…`、`apply registers /roundtable…`、`prompts carry the topic…` | `# pass 3 # fail 0` |

结论：T1/T2 仅需 `meetings.js`，T3 仅需其 4 个文件；两者互不依赖，非空洞。

## 3. T2 行为注入（timeout 中断 create + 迟到 handle）— PASS

脚本：`node preview/_evidence/stability2/inject_t6.mjs`（内存态，`agents.create` 永不 resolve，不触模）

- **T2a PASS**：`create()` 永不 resolve，`childTimeoutMs=runTimeoutMs=120` → `status=failed`、失败原因 `会议超时（120 毫秒）已中止。`、`manager.active.size === 0`（槽位释放）。
- **T2b PASS**：超时后 handle 才 resolve → `disposeCalls=1`、`lateOrchestrators=1`、`active=0`（迟到 handle 恰好 dispose 一次，不泄漏）。

## 4. T1 行为注入（终态写连续失败 → 内存 shadow + reconcile 不改判）— PASS

- **T1a PASS**：让 `write()` 在终态记录上连续失败（仅终态失败、running/queued 快照照常落盘）→ `persistTerminal` 走满 4 次尝试仍失败，内存保留 shadow；`record.status=completed`、shadow 顶层 `status=completed`；`reconcile()` 返回 `completed`（不是 `interrupted`）；随后 shadow 单次 heal 成功为 `completed`。证据串：`attempts=6 shadowCompleted=completed reconciled=completed healed=completed`（4 次终态尝试 + reconcile 与 dispose 各 1 次 heal）。
- **T1b PASS**：正常可写场景下终态 `completed` 已 durable；新建 manager 读回 `completed`，且不含 `meetingInterruptedNote`。证据：`disk=completed freshManager=completed`。

## 5. T3 行为注入（stage-specific web 能力）— PASS

- **T3a PASS**（`webToolsForStage` 表）：`answer=[web_search,web_fetch]`；`answer+附件=[]`；`discussion=[]`；`discussion+附件=[]`；`review=[]`；`arbiter+附件=[]`。
- **T3b PASS**（`runChild` plan + `restrictChildTools` 实际 guard）：上表在 plan 中一致；有附件 answer 的 web 被拒为 `ZH.toolDeniedAttachments`，discussion/review/arbiter 被拒为 `ZH.toolDeniedStage`；review/arbiter 放行 `structured_output`。
- **T3c PASS**（整场会议级）：带图片附件的会议中 answer×2/review/arbiter 的 allow 均无 web；纯文字会议中两个 answer 各自保留 `[web_search, web_fetch]`。

## 6. deployed 同步 — PASS

对 `lib/*.js` 与 `deployed/dsh-roundtable/lib/*.js` 逐文件 SHA256：

```
TOTAL=10 MATCH=10
```

10 个文件（api、attachments、client、copy、core、engine、index、meetings、prompts、stage）全部一致。

## 7. 结论

| 项 | 结论 |
| --- | --- |
| 全量回归 81/81 + check 10/10 | PASS |
| 非空洞对照（基线失败 + 单点隔离通过） | PASS |
| T2 行为注入（超时中断 / 迟到 dispose=1） | PASS |
| T1 行为注入（终态重试 + shadow + reconcile 不改判） | PASS |
| T3 行为注入（逐 stage allow + guard） | PASS |
| deployed 10/10 sha256 一致 | PASS |

无阻塞缺陷；T1–T3 可按当前工作区状态进入后续顾问终审/提交。
