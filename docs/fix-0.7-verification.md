# fix-0.7-verification — 0.7修复.md P1/P2 回归验收报告（t29）

- 日期：2026-11-16；分支 main；验证者 impl-glm（只改 `docs/` 与 `test/`）
- 方法：真实测试实跑（fake 宿主子代理双，无真实模型调用、无部署、无 DSH 重启）+ `test/manual/probe-fix-0.7-regression.mjs` 探针（`test/manual/` 不在 `npm test` 收集范围内，见 `scripts/test.mjs:21`）
- 结论：**t25/t26/t27/t28 四批修复全部复验通过；v1 行为字节不变证明成立；未发现新缺陷**

## 0) 命令实跑输出

| 命令 | 结果 |
|---|---|
| `npm test` | `# tests 162 / # pass 162 / # fail 0 / # skipped 0`，`# duration_ms 4245.0797`（node v22.20.0，node --test 递归收集，`test/manual/` 排除） |
| `npm run check` | `dsh-simroundtable: node --check passed for all 24 files under lib/`，exit 0 |
| `node --test test/roundtable-golden.test.mjs`（合批） | 3/3 ok：`v1 record renders the pinned Markdown export byte for byte`、`v1 export keeps the roundtable-<id>.md file name`、`the golden fixture is a v1 record with no v2 fields` |
| `node test/manual/probe-fix-0.7-regression.mjs` | `probes: 10/10 passed`（明细见 §2 探针列） |

## 1) t25–t28 acceptance 逐条复验（探测方式 → 实际输出）

### t25（A1：GUI v1/v2 分流与 Persona 工作区归属）

| acceptance 条目 | 探测方式 | 实际输出 | 判定 |
|---|---|---|---|
| hasPersona 只看实际发送席位；无 Persona 不发 participants/protocol | `client.test.mjs`「A1: persona gating…」子断言 + 探针 A2（落盘记录） | A1 测试 ok；探针 A2：`protocol=undefined, participants=undefined, version=1` | 通过 |
| loadPersonas workspaceToken+stillValid；切换清空重载 | `client.test.mjs` A1 测试内 ws-late / ws-2 断言 | A1 测试 ok（迟到响应丢弃、切换后 personaBySeat={} 并加载新列表） | 通过 |
| personaId 归属校验（未知 id 剔除+提示） | `client.test.mjs` A1（a1=p-gone → 无 participants 且 personaNote 出现） | A1 测试 ok | 通过 |
| reviewer/arbiter 不继承 answerer persona | `client.test.mjs` A1（r1/j1 personaId===undefined，a1==\"p-1\"） | A1 测试 ok | 通过 |

### t26（A2：checkpoint degraded、errorLog、selfReview）

| acceptance 条目 | 探测方式 | 实际输出 | 判定 |
|---|---|---|---|
| write() 返回布尔；false/throw → sticky degraded + 去重 limitation | `test/checkpoint-degraded.test.mjs` 用例 1 | ok：`a failed checkpoint write degrades visibly and stays sticky after the terminal write`（terminal 成功写后 onDisk.persistence.degraded 仍 true） | 通过 |
| 正常路径无 persistence 键；v1 记录不新增该键 | checkpoint-degraded 用例 2、3 | ok：`a healthy run carries no persistence key`、`a v1 record never gains the persistence key` | 通过 |
| 追加式 errorLog，成功不删失败；incomplete 读 errorLog | `test/roundtable-v2-failures.test.mjs` 3 例 | ok：`reduce keeps an append-only errorLog…`、`buildReport marks the report incomplete when any task failed, even with reviews`、`the settlement projects the errorLog into record.failures with the participantId` | 通过 |
| selfReview 按 modelRouteKey | `test/self-review.test.mjs` 2 例 | ok：`a reviewer on an answerer's route is disclosed as a self-review`（true）/ `a reviewer on its own route is not a self-review`（false） | 通过 |

### t27（B1：八席前置提示 + README）

| acceptance 条目 | 探测方式 | 实际输出 | 判定 |
|---|---|---|---|
| 席位提示只在 v2 场景；8 可用、>8 前置禁用+构成说明 | `client.test.mjs`「B1: 8-seat cap is visible and blocking only for v2 (persona) meetings」 | ok（8 席可启动 / 11 席按钮禁用+actionError 含「最多 8」+计数行 / 无 persona 同阵容走 v1 无提示） | 通过 |
| v1 不被误伤 | 同上（v1 无提示、正常 POST） | ok | 通过 |
| README 补齐（/personas、v1/v2 差异、8 席上限、阶段级工具权限、修 :251 过期描述） | 读 README「会议模式与角色卡（0.7）」节 + HTTP API 表 | 已含 personaBinding off/opt-in、GET/POST /personas、记录差异与回滚、8 席上限与空评审回退、阶段级工具权限；开发节测试收集描述已改递归 | 通过 |
| 五模式完成度与 #7 已知限制如实 | 读 README 同节 | Persona 已交付（0.7.0），Red Team/Pro-Con/Socratic/Pre-mortem 未实现；同模型多席位仅 API、Seat Card 计划 0.8 | 通过 |

### t28（B2：registry 执行权威）

| acceptance 条目 | 探测方式 | 实际输出 | 判定 |
|---|---|---|---|
| roundtable@2 runtime enabled=true，listProtocols 仍只列 v1 | `test/registry.test.mjs`（`roundtable v2 is registered and enabled for the runtime (B2 #1)` + listProtocols 冻结断言） | ok | 通过 |
| create 前置 registry 校验（expensive 之前）；未知 id/version 400；binding=off+persona 400 | `test/protocol-registry.test.mjs` B2 #2/#3/#4 + 探针 H1 | B2 #2/#3/#4 ok；探针 H1：`400 persona-not-supported` | 通过 |
| v2 显式声明可达 | protocol-registry B2 #1 | ok（完成且 record.protocol.version=2） | 通过 |
| 普通 v1 不受影响 | protocol-registry B2 #5 + 探针 A2 | ok | 通过 |
| execute 复用 registry 解析（不再直接取 roundtableV2） | grep `lib/meetings.js` 无 roundtableV2 引用；executeProtocol 走 requireRuntimeProtocol | 零引用，解析单一来源 | 通过 |

## 2) 场景矩阵逐项取证

| # | 场景 | 命令或测试名 | 实际输出 | 判定 |
|---|---|---|---|---|
| 1 | 无 Persona 圆桌走 v1（无 protocol/participants 字段） | 探针 A2（`node test/manual/probe-fix-0.7-regression.mjs`）；protocol-registry B2 #5 | `protocol=undefined, participants=undefined, version=1, status=completed` | 通过 |
| 2 | v1 会议 detail/list/markdown 前后磁盘字节与 mtime 不变 | 探针 A1 | `bytes equal=true, mtime 1794764007726.2556 → 1794764007726.2556` | 通过 |
| 3 | v1 Markdown 导出仍渲染（golden 字节钉死） | `test/roundtable-golden.test.mjs` 3 例 + 探针 A3 | golden 字节比对 ok；探针导出头 `# 圆桌会议记录…`（1074 chars） | 通过 |
| 4 | 单席位 Persona → v2 | 探针 B1（a1 personaId=focus-hunter，其余无） | `protocol={"id":"roundtable","version":2,…}, participants=4, personas=["focus-hunter"], status=completed` | 通过 |
| 5 | 全席位 Persona → v2 | 探针 C1（4/4 席 persona） | `protocol.version=2, personas=["focus-hunter","red-teamer","focus-hunter","red-teamer"], status=completed` | 通过 |
| 6 | 切换工作区后 Persona 映射清空并重载 | `client.test.mjs` A1（selectWorkspace 清 personas/personaBySeat/personaBinding 并 loadPersonas；迟到响应丢弃） | A1 测试 ok | 通过 |
| 7 | 空 reviewer 回退互评 | `settle-v2.test.mjs`「an empty reviewer list falls back to answerers reviewing each other」+ 探针 E1 | 测试 ok；探针：`reviewers=["rv-1","rv-2"], limitations=["未指定评审者：由作答模型互相评审（与默认互评一致）。"], status=completed` | 通过 |
| 8 | 部分失败 → incomplete | `roundtable-v2-failures.test.mjs`（errorLog/incomplete/failures 3 例）+ `settle-v2.test.mjs`「a partially failed run…」+ 探针 F1 | 探针：`status=completed, finalReport.incomplete=true, failures=["answer/a1"]` | 通过 |
| 9 | 全失败 → failed | `settle-v2.test.mjs`「a run whose answerers all fail is failed, not completed」+ 探针 G1 | 探针：`status=failed, stage=failed, failures=1` | 通过 |
| 10 | checkpoint 写盘失败 → degraded（模拟） | `test/checkpoint-degraded.test.mjs` 3 例（stub manager.write running 期返回 false） | 3/3 ok（degraded 粘性、正常路径无 persistence 键、v1 不新增键） | 通过 |
| 11 | 8 席可用 | `client.test.mjs` B1（8 席 participants=8、按钮未禁用、正常 POST）；后端 8 席上限 `lib/participants.js:27` | B1 ok | 通过 |
| 12 | 9 席前置拦截（前端禁用） | `client.test.mjs` B1（5+5+1=11 席：start 按钮禁用、无 POST、actionError 含「最多 8」+构成计数行） | B1 ok | 通过 |
| 13 | 9 席前置拦截（后端 400） | 探针 D1（9 participants 直投 manager.create） | `400 participant-count: Expected 2–8 participants, received 9.; child activations=0`（子代理零启动，expensive 前拦截） | 通过 |
| 14 | registry 下 roundtable@2 enabled 可达 | protocol-registry B2 #1 + registry.test（`roundtable v2 is registered and enabled for the runtime`） | ok | 通过 |
| 15 | 未知协议 id / version → 400 | protocol-registry B2 #2/#3 | `unknown-protocol` + status 400 | 通过 |
| 16 | personaBinding=off + persona 席位 → 400 | protocol-registry B2 #4 + 探针 H1 | `400 persona-not-supported` | 通过 |
| 17 | personaBinding=off 临时工作副本：普通圆桌完整开会并导出（v1 路径不受伤） | 临时副本 `%TEMP%\rt-offcopy-e5aa5d03`（复制 lib/ + test/helpers，`normalizeConfig({personaBinding:"off"})`，rounds=1 全流程） | `personaBinding = off`；`status=completed, answers=2, reviews=2`；导出 `exports/roundtable-46c7a1e8….md` 1988 bytes、头 `# 圆桌会议记录…`；落盘记录 protocol 缺席（v1） | 通过 |
| 18 | 同模型不同 Persona / 同 Persona 跨角色席位身份 | `test/participants.test.mjs` 用例 1、2、4 | ok（路由相同席位不同、指纹不同、独立性不宣称） | 通过 |
| 19 | Persona 快照缺失拒单、persona 不能扩权工具策略 | `test/persona-adapter.test.mjs` 用例 16、17 | ok（`a persona id without a snapshot is refused before any task runs`；`an unknown child stage has no tool policy, and persona cannot widen it`） | 通过 |

## 3) 新增/修改测试真实性

- t25–t28 新增文件全部实跑且非 skip：`npm test` 输出 `# skipped 0`、`# fail 0`。
- 本任务新增探针 `test/manual/probe-fix-0.7-regression.mjs` 放在 `test/manual/`（`scripts/test.mjs:21` 显式排除该目录），不会被 `npm test` 收集——这是有意放置：探针依赖共享 harness 且输出供本报告引用，非套件断言。

## 4) 本次未验证项与剩余已知限制

**未验证项（及原因）**
1. 真实模型会议端到端：任务禁止真实模型调用；全链路仅由 fake 宿主子代理双覆盖（与 t25–t28 同等深度）。
2. 浏览器 GUI 实际渲染（Live2D 舞台、席位计数行的视觉呈现）：`client.test.mjs` 为视图树断言，未做真浏览器截图验证（B1 的 UI 呈现属「必须真浏览器验证」类，与 t4 计划一致）。
3. GitHub Release 是否已发（audit #9c）：本地无法核实，需 captain 用 `gh release create` 或网页确认。
4. audit #9b 中「阶段级权限」README 之外的低危文档项（原文 §1140 未逐行核实）未复查。

**有意偏离（非缺陷）**
- **无 Persona 声明 v2 仍合法**：`lib/meetings.js:353-356` —— 显式声明 `protocol:{id:"roundtable",version:2}` 而不带 participants（或带无 persona 的 participants）时仍按 v2 执行。这是 t28 拍板的语义：协议声明与 Persona 解耦，Persona 是否可用由 `personaBinding` 闸控制。与原文「有 Persona 才 v2」的表述有意不同，README 已如实披露。
- registry `listProtocols` 公开列表仍只列 v1（实验协议不公开），运行时 enabled=true 只影响执行可达性（t28 验收明文）。

**已知限制（沿 audit #7 / t27，未在本轮回归范围内）**
- GUI 不支持同模型重复席位（仅 API participants 可实现；Seat Card 计划 0.8）。
- Red Team / Pro-Con / Socratic / Pre-mortem 专用协议阶段未实现（0.7 非交付内容）。
- checkpoint degraded 语义为「内存标记 + 下次成功写兜底落盘」（sticky 标记），不中断运行；写盘持续失败仍依赖 persistTerminal 重试 + terminal shadow 兜底（settle-v2/meetings 既有用例覆盖）。

**本任务发现的缺陷**：无。（t25–t28 修复项全部复验通过；探针 10/10；162/162 测试全绿。）
