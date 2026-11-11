# T7 顾问终审：T1 / T2 / T3

终审结论：**PASS，T1 / T2 / T3 当前修复闭环，可交付。** 终审期间发现并复现的 F1、F2 已由 captain 修复；本报告保留修复前证据，并在各项末尾记录复核结果。

范围：只读检查实际代码与 README_t6.md；仅新增本报告，未修改实现或测试。复核重跑 `node preview/_evidence/stability2/inject_t6.mjs`，7/7 PASS；下述边界没有被该脚本覆盖。此前全量 81/81 与 check 10/10 证据见 README_t6.md:16–23，不能据此排除新发现的竞态。

## T1 终态 durable — PASS（F1 已修复复核）

主流程符合目标：lib/meetings.js:591–608 的 persistTerminal 共尝试四次，失败后保存 shadow；lib/meetings.js:610–628 保存完整 structuredClone(record)，包含 finalAnswer、答案、排名、评审、错误、时间及工作区，足够同一 manager 生命周期内恢复；lib/meetings.js:664–668 的 releaseRun 有 shadow 则保留 active；lib/meetings.js:698–708 的 reconcile 优先 shadow 并尝试 heal，不会把该 completed shadow 改判 interrupted。lib/meetings.js:323 与 :387 的终态 guard 也阻止迟到事件覆盖。

**F1 / high：dispose 无条件删除尚未 durable 的 run。**

位置：lib/meetings.js:1225–1226。最后一次 heal 可以失败，但下一行仍执行 `this.active.clear()`。这直接违反“终态写成功前不得从 active 摘掉”的约束。shadow 在旧 manager 上仍可读，故此路径自身不会在旧 manager 中改判 interrupted；但是旧 manager 被替换后，内存 shadow 无法转移，新 manager 只看到旧 running 文件，遂按 :710–724 判 interrupted。内存 shadow 本就无法抵御进程崩溃；这里的问题是正常 dispose 也主动绕过了 active 保留规则。

最小复现（仓库根目录执行 Node ESM）：

```js
import { MeetingManager } from './lib/meetings.js';
import { copyFor } from './lib/copy.js';
const manager = new MeetingManager({
  ctx: { logger: { warn() {} } }, config: {},
  copyFor: () => copyFor('zh'), resolveLocale: () => 'zh'
});
manager.write = () => false;
const record = { id: '12345678', workspace: process.cwd(),
  status: 'completed', finalAnswer: { text: 'finished' } };
manager.keepTerminalShadow(record, new Error('disk unavailable'));
manager.active.set(record.id, { record, controller: new AbortController() });
await manager.dispose();
console.log(manager.active.size, manager.terminalShadow.size);
```

实测输出 `0 1`：写失败、shadow 仍存在，active 已清空。预期 active 保留该 run；关闭/热重载时尚未落盘的终态需有明确保留及重试归属，不能仅声称 durable。

修复要求：消除无条件 clear；确保清理流程只释放已持久化记录，并说明 manager 生命周期结束时未落盘 shadow 的保留/恢复归属。增加 dispose + 持续写失败的回归用例。

退避评价：lib/meetings.js:67–79 固定 50+150+400=600ms 的 Atomics.wait 阻塞整个 Node 事件循环；这是每条终态写盘失败的等待上限，并非全局上限，也不包含同步文件 I/O 时延。默认小并发、罕见故障下可作为当前折中，不单独列为阻塞；批量 dispose 会线性累计，其他会议 timer/cancel 也会延迟，应在后续改为异步有界重试并维持同样所有权约束。

**F1 复核结果（已解决）**：当前 lib/meetings.js:1229–1233 已替换为逐 run 检查 shadow，仅无 shadow 时删除 active。同一最小注入重跑得到 `{ active: 1, shadow: 1 }`；针对性回归 `node --test --test-name-pattern='same tick|completed record whose write keeps failing' test/meetings.test.mjs` 为 2/2 PASS。当前 manager 生命周期内的不丢终态要求满足。持久故障期间进程强制退出无法靠内存 shadow 保证恢复，这属于本方案明确边界；本结论不把 write/rename 成功等同于带 fsync 的断电持久性。

## T2 agents.create 可取消 — PASS（F2 已修复复核）

一般路径正常：lib/meetings.js:256–281 的 raceAbort 能在 create 永不 resolve 时退出；:1131–1146 的迟到回调可处理“先 abort，后续任务才 resolve”的情况，原独立脚本也验证 dispose=1、late=1。

**F2 / high：同一同步栈先 resolve create、再 abort，handle 无主且未 dispose。**

位置：lib/meetings.js:1131–1148。`creating.then` 清理回调先注册，resolve 后排入 microtask，但此时 abandoned 仍 false；紧接同步 abort 使 raceAbort 拒绝。清理回调先执行并直接 return，随后 await 的 catch 才置 abandoned=true，已经错过唯一清理机会。run.orchestrator 从未赋值，execute.finally 也无法兜底。

最小复现（复用上例 import）：

```js
let release, disposed = 0;
const creating = new Promise(resolve => { release = resolve; });
const manager = new MeetingManager({
  ctx: { get: () => ({ create: () => creating }) }, config: {},
  copyFor: () => copyFor('zh'), resolveLocale: () => 'zh'
});
const run = { record: { workspace: process.cwd() },
  controller: new AbortController(), lateOrchestrators: 0 };
const obtaining = manager.resolveParentAgent(run).then(
  () => 'delivered', () => 'aborted');
release({ agent: { id: 'parent' }, dispose() { disposed++; } });
run.controller.abort();
console.log(await obtaining);
await Promise.resolve();
console.log({ disposed, late: run.lateOrchestrators, owned: !!run.orchestrator });
```

实测：`aborted`，`{ disposed: 0, late: 0, owned: false }`。对照“先 abort 再 resolve”得到 disposed=1、late=1；“仅 resolve”得到 delivered、disposed=0、owned=true。这是确定性 microtask 顺序，无需真实模型或计时碰运气。

修复要求：用单一所有权状态协调 create 完成与 abort，或保存已解析 handle 并由拒绝分支补清理；确保每个 handle 恰好归属正常路径或 dispose 路径。增加 resolve→abort 同栈测试及反向顺序测试。

未发现当前代码会把已经正常交付的 handle 因 abandoned 回调再次 dispose 的路径：正常交付不会进入 catch，abandoned 保持 false；正常 execute.finally dispose 是预期清理。当前确证问题是漏 dispose，而非 use-after-dispose。

**F2 复核结果（已解决）**：当前 lib/meetings.js:1134–1138 判据已改为 `if (!abandoned && !run.controller.signal.aborted) return;`。同一最小注入重跑：resolve→abort 为 aborted/disposed=1/late=1/owned=false；abort→resolve 同样清理一次；仅 resolve 为 delivered/disposed=0/late=0/owned=true。新增 test/meetings.test.mjs:472 的同帧取消回归通过；未发现新判据会清理已交付 handle 的等价路径：then 一旦正常跳过便不会再次执行，已交付 handle 由 execute.finally 负责。新判据查询 signal 发生于交付前，若 abort 已赢得 race，handle 清理是正确归属。

## T3 stage-specific web — PASS

- lib/engine.js:94–97：仅 answer 且无附件允许 WEB_TOOLS，其余 stage 默认空表；:272–285 将表写入 child plan。
- lib/engine.js:469–471：附件判定是显式标志 **或**非空 attachmentText **或** imagePartsByKey Map 非空。纯文本附件无图仍会命中 text；页面调用 lib/meetings.js:1053–1058 还传 attachments.length>0，因此空文本、文本被截断/省略、图像路由均不支持的附件仍禁 web，无漏判。
- lib/index.js:533–546 调用真实 tools.restrict({allow})，:553–575 从子工具视图回读并 fail closed，:579–584 的 guard 再检查执行权限；:610–650 的 created 监听在首步前绑定策略。因此限制实际进入工具可见性，不只依赖 prompt。
- lib/index.js:582 放行 run_code 是 PTC 传输例外。已读当前 DSH 0.2.2-rc.1 宿主实现：`C:/Users/pordl/AppData/Roaming/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-tool-executor-ptc/lib/index.js:501–510` 将同一 agent/toolSet 传给嵌套执行，:564–566 经 executor.prepare/dispatch；`.../dsh-tools/lib/pipeline.js:260–265` 与 `.../dsh-tools/lib/index.js:530–533` 按 scope/toolSet 查可执行工具。因此放行 transport 不会恢复被隐藏的 web 能力，不能通过 SDK 直接绕过阶段限制。该结论针对当前宿主版本。
- 独立注入重跑 7/7 通过，含 stage allow 表、guard 和有附件整场会议。

边界说明：“无附件 answer at most twice”目前仍是 prompt 预算，guard 没有调用次数计数（lib/index.js:579–584）。本任务 T3 明确要求禁用阶段进入能力边界；该目标已达到。若产品要求“第三次 web 调用也必须硬拒绝”，需要另加 per-child 计数，目前不能宣称次数在能力层被强制限制。

## 交付判定

**可以交付：T1 / T2 / T3 PASS，F1 / F2 已修复且通过独立注入与针对性回归。** captain 报告最终提交 cacccaa，全量 82/82、check 10/10 通过；本终审亲自重跑原独立注入 7/7、两条边界回归 2/2，以及修复前后对照注入。一次复核命令恰逢共享文件写入，首个 Node 子进程遇到瞬时 SyntaxError；待文件写入完成后相同注入成功，最终文件可正常 import，该瞬时结果未算作通过证据。
