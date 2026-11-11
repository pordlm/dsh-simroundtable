# 稳定性修复顾问终审

结论：**FAIL / needs_revision**。整场超时与常规附件失败回滚已闭环；前端仍有可复现的迟到响应覆盖，子 Agent 撤销策略的五分钟到期行为仍不满足插件自身的异步 fail-closed 承诺。建议修订后重新验证再提交。

审查范围：只读检查生产代码及现有测试；仅新增本报告。依赖材料为 T2–T5、T9–T11 的结果，但以下结论来自独立代码追踪、重点回归复跑和内存最小复现。没有调用真实模型，没有修改宿主安装文件。

## 1. 整场超时语义：PASS

- `lib/meetings.js:753–756` 在 run deadline 同步设置 `run.timedOut = true` 后 abort。`lib/meetings.js:848–852` 在 settle 前检查 timedOut，`lib/meetings.js:315–320` 在 settle 内再次检查并写 failed。取消/关闭宿主的终态也由 `lib/meetings.js:314` 保留。
- 引擎没有再把整场 abort 当单个模型失败：`lib/engine.js:293–303` 定义 abort 闸门，分别于 `lib/engine.js:345`、`lib/engine.js:427`、`lib/engine.js:501`、`lib/engine.js:658`、`lib/engine.js:742`、`lib/engine.js:763` 检查；仲裁 catch 后不能构造成功 fallback。
- `lib/core.js:136–148` 的单子任务 deadline 返回前仍执行 signal.throwIfAborted；`lib/index.js:291` 对 command/tool 的整场超时作最终检查。
- 测试依据：`test/meetings.test.mjs:371`、`test/meetings.test.mjs:401`、`test/meetings.test.mjs:454` 覆盖首次阶段挂起、后续阶段超时与 engine abort 拒绝，独立复跑通过。
- 还差什么：本项无阻塞修订。超时不能强制中断不响应 signal 的外部服务；例如目录后的父 Agent 创建依赖宿主完成，故此 PASS 指“不把已观察到的整场 abort 持久化为 completed”，不承诺任意外部调用都能按 deadline 及时退出。

## 2. 子 Agent 权限 fail-closed：FAIL（F1，high）

已经正确处理：

- `lib/index.js:514–594` 强制要求 restrict/guard/get；restrict 不生效时读回探测泄露工具；guard 抛错时使创建失败。`lib/index.js:623–629` 不再吞权限安装错误。
- 查验当前宿主的真实契约：`C:/Users/pordl/AppData/Roaming/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent/lib/index.js:710` 串行 await agent/created，因此 listener 抛错确实可阻断创建，不仅是测试桩的假设。
- `lib/engine.js:222–251` 对迟到 handle 检查 revoked / childSignal.aborted 并 dispose；`test/apply.test.mjs:390`、`test/apply.test.mjs:417`、`test/apply.test.mjs:441`、`test/apply.test.mjs:465` 独立复跑通过。

剩余问题：

- `lib/engine.js:105–116` 给 revoked plan 设置 300000ms timer，回调无条件 `childPlans.delete(childId)`；它没有确认 startActivation 已 settle。
- `lib/index.js:604–606` 遇到 plan 缺失直接 return。于是仍在创建中的 activation 超过撤销后的五分钟才发 agent/created，就不再安装策略，也不拒绝创建。`lib/engine.js:244–248` 在拿到 handle 后才 dispose 无法代替创建前的权限闸门。
- 最小复现使用真实导出的 childPlans / revokeChildPlan，仅把 setTimeout 替换为捕获回调：pending → revoke → 断言 revoked → 执行 300000ms 的回调 → 断言 map 中已无该 childId。无需真实等待五分钟，也未改文件。
- **风险边界**：当前 DSH 0.2.2-rc.1 的 subagent manager 在 prepareContinuable 后仍检查 signal（安装路径 `node_modules/@deepseek-ai/dsh-subagent/lib/index.js:1428`、`:1434`、`:1439`），这会缓解正常宿主路径。本审查没有证明真实宿主在该路径执行了未受限工具；证实的是插件的失效窗口及其依赖宿主额外检查才能安全。不得把它写成“已验证生产权限逃逸”。

必需修订：未决 activation 的撤销标记至少存活到 activation 确定失败或 handle 已被处置，不能仅因墙钟 TTL 到期而变成“不是我们的 child”。清理应与 activation 生命周期绑定；为超过 TTL 仍未结束创建的情况补回归，并断言 agent/created 拒绝、模型步骤与非白名单工具均未执行。若采用有界结构，也必须保留可靠的归属/拒绝依据。

## 3. 工作区隔离与前端 generation：FAIL（F2、F3，medium）

已经正确处理：

- 服务端 `lib/meetings.js:915–917` 对跨 workspace cancel 返回 404，`lib/meetings.js:527–532`、`lib/meetings.js:635–637` 按 workspace 计并发。
- 客户端 `lib/client.js:510–516` 用 generation + workspaceId，切换时 `lib/client.js:696–714` 递增 generation/pollToken 并清数据。列表、目录、上传、能力、创建、详情、跨 workspace 取消的正常成功与失败分支均有闸门。pollLoop 由 pollToken 隔离。

F2：导出链未纳入 generation（`lib/client.js:955–1015`）。

- fetchExport 的 catch 在 `lib/client.js:971` 无条件写 exportState/exportError；picker 后与 workspace fallback 返回后的所有 store.set 同样未检查 token。`selectWorkspace` 不清 exportState/exportText/exportInfo，所以旧导出可污染新 workspace 并让新会议暂时不能导出。
- 最小复现：store workspace=A、detailId=meeting-a → actions.exportMeeting() 的 fetch 挂起 → actions.selectWorkspace('B') → A 导出 reject('late A export error')。真实 client source 的断言通过：workspaceId 仍 B，但 exportState=error，exportError=`Export failed：late A export error`。
- 必需修订：导出及其各 await 后的 store 写入必须核对工作区代际与当前详情/导出操作身份；workspace 或详情切换时重置导出状态。对于已获用户授权并开始的实际写文件行为可单独处理，但迟到结果不得改变当前视图。补成功/失败/fallback 的跨 workspace 测试。

F3：同工作区取消旧会议会覆盖新详情（`lib/client.js:934–953`）。

- cancelMeeting 只核对 workspaceToken，没有核对发起时 detailId / pollToken。用户在取消 A 尚未返回时打开 B，A 的响应在 `lib/client.js:949` 将 store.meeting 换回 A；错误分支也可把 A 的错误放进 B。
- 最小复现：同 workspace=W，打开 running A → cancelMeeting() 挂起 → await openDetail('b') 返回 completed B → resolve A cancel。真实 source 断言通过：`store.detailId === 'b'`，但 `store.meeting.id === 'a'`。
- 必需修订：取消结果写回前校验当前视图和会议身份/详情代际；补同 workspace 切详情的成功及失败迟到测试。跨 workspace 守卫本身有效，不应因此删除。

## 4. 附件事务回滚：PASS（有明确能力边界）

- `lib/attachments.js:353–394` 每次成功 rename 立即登记 moved；后续读取 manifest 或 rename 出错均在 catch 调用 rollbackAdoption。`lib/attachments.js:326–342` 倒序搬回 uploads，全部恢复后删除此次 meeting 目录。
- 初始 record strict 写失败时，`lib/meetings.js:716–731` 在 active.set / execute 前调用 releaseAdoptedUploads；`lib/attachments.js:403–430` 恢复文件及清理空 meeting 目录。
- `test/attachments.test.mjs:320` 用第三个 target 的非空目录实际触发 rename 失败，断言三个 upload 都可读、meeting 目录消失；`test/attachments.test.mjs:348` 验证显式 release；`test/meetings.test.mjs:304` 验证 write 抛错与附件回退联动。独立复跑均通过。
- 还差什么：不宣称文件系统本身拒绝回滚 rename 时也能保证自动恢复。`lib/attachments.js:331–336`、`lib/attachments.js:419–423` 选择保留原地字节而非删除，此时文件可能仍留在 attachments；调用侧当前不记录单独恢复失败信息。属于已识别的 best-effort 边界，常规“第三个迁移失败/首写失败”请求路径已经有实际恢复证据。本轮未将不可写文件系统的二次恢复失败列为阻塞项。

## 独立验证记录

命令：`node --test test/apply.test.mjs test/meetings.test.mjs test/attachments.test.mjs test/client.test.mjs`

结果：exit 0，46 tests / 46 pass / 0 fail，duration 1514.3596ms。该结果验证已有回归，**没有覆盖** F1 的 TTL 后迟到、F2 导出、F3 同 workspace 切详情取消。

另跑两个内存 Node ESM 最小复现（未落地代码文件）：

1. revoked plan 的 300000ms 到期删除 + 旧 workspace 导出 reject 写入新 workspace：exit 0，全部断言成立。
2. 取消 A 后打开 B、再接收 A 的取消结果：exit 0，确认 detailId=b / meeting.id=a。

T11 提供的全量 69/69 与 deployed 10/10 同步作为依赖证据保留；本终审未重复全量及同步，且其通过不能替代上述新增边界的验证。

## 放行条件

修复 F1、F2、F3 并补非空洞回归后，再运行全量测试/check、同步部署副本并复核上述失败分支。本报告当前不放行提交/推送。历史公开 token 的轮换仍按 T10/T11 的既有风险说明处理，本次未读取或复制其值。
