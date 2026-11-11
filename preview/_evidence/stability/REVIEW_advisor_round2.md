# 顾问第二轮终审

总判：**仍不可提交**。F2、F3 的原复现已关闭；F1 的普通 TTL 后迟到创建已被拦截，但新增 4096 条拒绝记录淘汰逻辑重新引入同等的缺失即放行分支，权限生命周期仍未闭环。

本轮先读取 REVIEW_advisor.md，再检查 T13/T14 涉及的 engine/index/client 与新增 apply/client 测试 diff、当前源码。仅新增本报告，不修改生产代码。T15 的独立验证作为依赖证据，以下 probe 与回归由本顾问重新执行。

## F1 权限 TTL 后放行：FAIL

普通 TTL 场景已经修复：

- `lib/engine.js:137–140` 的 expireChildPlanTombstone 通过 retireChildPlan 释放 plan；`lib/engine.js:123–127` 将 id 转入 refusedChildren。
- `lib/index.js:606–618` 在 plan 缺失时检查 isRefusedChild，为 true 就抛创建错误，未直接放行。
- 新测试 `test/apply.test.mjs:535–571` 验证 revoked → expire → created 抛错，`test/apply.test.mjs:574–609` 验证显式 retire 后拒绝、外来 child 不受影响。上述测试本轮独立复跑通过。

但还存在等价放行分支：

- `lib/engine.js:78` 把 REFUSED_CHILD_LIMIT 固定为 4096；`lib/engine.js:85–92` 不区分 activation 是否仍未决，只要拒绝集合超限就删除最旧 id。
- `lib/index.js:612–618` 在 id 不再存在 refusedChildren 时依旧 return。尚未返回 handle 的旧 activation 因此在 4096 个其他 plan 被 retire 后恢复为“外来 child”。此时创建监听器既不拒绝，也不调用 restrict/guard。
- 这只是把上一轮的墙钟触发条件换成激活数量；仍未保留“该创建属于本插件且已撤销”的可靠依据。当前宿主仍有 signal 检查缓解，本报告没有宣称发生真实生产工具逃逸。

本顾问最小复现（exit 0，全部断言成立）：

1. 导入真实 engine 模块；以真实 index 源码调用 apply，捕获其 agent/created listener。唯一替身为 dsh-llm 的 createUserMessage 导入及宿主注册上下文，不修改 listener 代码，也不启动真实模型。
2. 延续上一轮 probe：写入目标 pending plan，revokeChildPlan；捕获并运行真实 setTimeout 的 300000ms 回调。
3. 断言 childPlans 无目标、isRefusedChild 为 true，调用真实 created listener，断言抛错。证明原 TTL 窗口确实已拦截。
4. 依次创建并 retire 4096 个不同的其他 plan，代表后续正常完成/拒绝的 activation；目标 activation 始终未 resolve。
5. 断言目标 isRefusedChild 变为 false；再次调用真实 created listener，断言不抛错且 restrict/guard/get 调用数均为 0。证明 fail-open 由集合淘汰触发，而非 probe 没走到创建逻辑。

必须修订：对仍可能发出 agent/created 的未决 activation 保留不可被容量淘汰的拒绝/归属证据，直到 activation 确定失败或迟到 handle 已被处置；只有确定不再可能创建的历史记录才可有界淘汰。补“目标未决 + TTL 到期 + 4096 次其他 retire + 迟到 created”的回归。单纯增大 4096 上限不能解决生命周期问题。

## F2 导出缺代际守卫：PASS

- `lib/client.js:524–527` 的 stillValid 同时检查 workspace generation/id 与可选 detailId。
- `lib/client.js:992–993` 捕获导出发起时 token/workspaceId；fetchExport catch/成功、picker 返回、workspace POST 成功/失败分别在 `lib/client.js:1005`、`:1009`、`:1013`、`:1034`、`:1046` 检查相同守卫。
- workspace POST 使用捕获的 workspaceId（`lib/client.js:1032`），不会迟到时改指向新 workspace。workspace 与 openDetail 路径新增导出状态清理，避免旧 working/saved 面板残留。
- `test/client.test.mjs:1379–1433` 覆盖跨 workspace 的迟到保存成功响应，本轮通过。
- 亲自重跑上一轮相同失败 probe：workspace=A/detail=meeting-a → exportMeeting 的 GET 挂起 → selectWorkspace(B) → GET reject('late A export error')。现在断言 workspace=B、exportState=idle、exportError=null 全通过；请求确实启动并通过捕获的 reject 完成，未跳过触发条件。
- 本项仅裁决上一轮跨 workspace 导出污染，现有实现的 detailId 检查不等同于独立导出操作编号；本轮没有将所有同会议重复导出的时序声明为已穷举。

## F3 cancel 缺 detail id 校验：PASS

- `lib/client.js:963–964` 捕获 workspace token 与 meeting.id；成功/失败分别在 `lib/client.js:976`、`:979` 使用 stillValid(token, { detailId: id }) 后才写 store。
- `test/client.test.mjs:1435–1490` 覆盖 cancel X 挂起 → 打开 Y → 收到 X 的取消成功响应，本轮独立通过。
- 亲自重跑上一轮同样顺序的 probe：workspace=W/detail=a/running A → cancelMeeting 挂起 → await openDetail('b') 返回 completed B → resolve A cancel。现在 detailId=b、meeting.id=b，原来的 detailId=b / meeting.id=a 不再出现。断言确认 cancel 回包实际被释放并处理，非未触发。

## 本轮验证结果

- `node --test test/apply.test.mjs test/client.test.mjs`：exit 0，11 tests / 11 pass / 0 fail，duration_ms 12524.7449（apply 10 条，client 文件 1 个 Node test，内部含多块断言）。
- 合并重跑上一轮两个 Node ESM 内存 probe：exit 0。输出依次为 TTL 场景 BLOCKED、4096 次 retire 后 FAIL-OPEN、导出 reject BLOCKED、旧取消回包 BLOCKED。
- 未重复 T15 的全量 71/71、check 与 deployed 同步；这些依赖结果不覆盖新发现的容量淘汰窗口。未创建 probe 文件、未修改生产代码。

第二轮结论：F1 FAIL，F2 PASS，F3 PASS。**仍不可提交**。
