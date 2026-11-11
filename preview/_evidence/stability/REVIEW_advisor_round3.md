# 顾问第三轮终审

总判：**可以提交**。本轮范围内 F1（TTL）、F1b（4096 淘汰）、F2（导出跨工作区响应）、F3（取消跨详情响应）均 PASS。上一轮阻塞项 F1-R2 已关闭。

本轮读取当前 engine/index/client、T17 新增测试，并检查 `git diff HEAD^ HEAD -- lib/engine.js lib/index.js test/apply.test.mjs`。工作区在检查时已是提交 `3a8e2d5`，普通及 cached diff 均为空，因此审核的是已提交源码与父提交的差异。没有单独 T17 中间提交可比较；其最终实现与新增测试已逐段读取。仅新增本报告，不修改生产代码。

## F1：TTL 到期后迟到创建 — PASS

依据：

- `lib/engine.js:163` revokeChildPlan 将 pending plan 标为 revoked，并于 `lib/engine.js:172` 登记拒绝 id。
- `lib/engine.js:174` 定时器调用 expireChildPlanTombstone；`lib/engine.js:144` 只释放 revoked plan；retireChildPlan（`lib/engine.js:117`）不删除拒绝记录。
- `lib/engine.js:87` isRefusedChild 直接返回 Map.has(childId)，无默认放行值或反向判断。
- `lib/index.js:607` plan 缺失时，在 `lib/index.js:613` 检查拒绝记录并抛错；尚有 revoked plan 时 `lib/index.js:622` 亦直接拒绝。

亲自重跑上一轮同样的内存 probe：导入真实 engine，以真实 index 源码调用 apply 捕获实际 agent/created 监听器（仅替换 dsh-llm 导入为 createUserMessage stub、相对导入换绝对 file URL）。写入目标 pending plan → revokeChildPlan → 捕获并运行真实 setTimeout 注册的 300000ms 回调。断言 plan 缺失、isRefusedChild=true、真实 created 抛 /工具限制/、restrict/guard/get 总调用数为 0，全部成立。不是仅调用测试 helper 推断定时器行为。

## F1b：4096 淘汰与清理时机 — PASS

依据：

- `lib/engine.js:84` 使用 Map 保存未结算 activation；`lib/engine.js:91` 只增加拒绝 id，已无 REFUSED_CHILD_LIMIT/FIFO 淘汰循环。
- `lib/engine.js:102` settleRefusedChild 是唯一删除入口；retireChildPlan、expireChildPlanTombstone 不再修改拒绝集合。
- 清理调用逐处检查：同步 startActivation 抛错（`lib/engine.js:272`）、await activation 拒绝（`lib/engine.js:291`）发生在 activation 已失败后；迟到 handle 在 `lib/engine.js:319` await disposeOnce 后才于 `lib/engine.js:322` 清理；正常 handle 的 finally 在 `lib/engine.js:333` await disposeOnce 后于下一行清理；`lib/index.js:646` 的 agent/disposed 只清理对应 id。
- `test/apply.test.mjs:620` 新用例覆盖 5000 个其他 plan retire 后仍拒绝目标，并等迟到 handle dispose 后才解除；`test/apply.test.mjs:667` 覆盖结算一个 id 不释放另一个未结算 id。本轮亲自复跑通过。

亲自重跑上一轮 4096 probe，并将数量扩为 5000：紧接上述 TTL 回调后，依次写入、retire 5000 个 filler plan，再触发目标真实 created。目标 isRefusedChild 仍 true，created 仍抛 /工具限制/，权限 hooks=0。原先第二轮的“目标被挤掉、created 不抛”结果已无法复现。

反向检查：只 settle 目标 id 后其拒绝解除，第二个未结算 id 仍被拒绝；foreign id 不受影响；第二个 id 的 agent/disposed 才解除它。全部断言成立。

另用真实 runChild 做了独立的延迟 dispose probe：startActivation 挂起 → 15ms 子任务超时 → TTL 清理 plan → release 迟到 handle，但让 handle.dispose 的 Promise 继续挂起。确认 dispose 已进入且拒绝 id 仍在；只有手动 resolve dispose 并排空微任务后，isRefusedChild 才变 false。排除了“收到 handle 就提前释放拒绝”的清理时序。

边界说明：此结论基于宿主的一次 activation 对应一次创建生命周期；已结算/已 disposed 的同 id 不再属于可能首次迟到创建的 activation。provider 永不结算时记录会保留，源码已明确这种内存取舍。disposeHandle 仍为 best effort；dispose 异常不证明成功销毁，但此处 handle 已经返回，创建阶段已经结束，不能据此推断尚未发生的首次创建重新获准。本轮没有发现可复现的同等缺失即放行路径。

## F2：导出旧响应覆盖新工作区 — PASS

- `lib/client.js:992` 捕获 token，`lib/client.js:993` 捕获 workspaceId；GET 失败/成功、picker 完成、POST 成功/失败分别在 `lib/client.js:1005`、`lib/client.js:1009`、`lib/client.js:1013`、`lib/client.js:1034`、`lib/client.js:1046` 进行 workspace 与 detailId 守卫。
- POST 使用捕获的 workspaceId（`lib/client.js:1032`）。第二轮亲自复现的 GET reject 跨 workspace 场景已经关闭，本轮读取确认守卫未回退。
- `test/client.test.mjs:1379` 的迟到导出成功跨 workspace 断言在本轮 client 回归中再次通过。该项裁决原发现，不宣称穷举同会议重复导出的所有时序。

## F3：cancel A 迟到响应覆盖详情 B — PASS

- `lib/client.js:963`、`lib/client.js:964` 捕获 workspace token 与 meeting id；成功与失败在 `lib/client.js:976`、`lib/client.js:979` 均检查 stillValid(token, { detailId: id }) 后才写 store。
- 第二轮原 probe 已确认 A cancel 回包实际释放后，B 仍保持 detailId=b / meeting.id=b。本轮读取确认该逻辑保持，并亲自运行 `test/client.test.mjs:1435` 对应迟到取消成功回归，通过。

## 验证与验收范围

本顾问本轮实际执行：

1. Node ESM 内存真实监听器 probe：exit 0。输出 TTL actual timer callback PASS；5000 retirements PASS；per-id settlement / disposed / foreign PASS。
2. Node ESM 真实 runChild 延迟 dispose probe：exit 0。dispose 未完成时 refusal 保留；完成后解除，全部断言通过。
3. `node --test test/apply.test.mjs test/client.test.mjs`：exit 0，13 tests / 13 pass / 0 fail，duration_ms 12486.7173。其中 apply 12 条，client 一个 Node 文件级 test 内含全部断言。权限 restrict 抛错、guard 抛错、越权回读、迟到 handle、TTL、5000 条边界、分 id 清理及前端回归全部通过。

未重复 T18 的全量 73/73、全 lib check 与 deployed 10/10 哈希同步；其结果作为依赖验证，以上为本顾问独立证据。无 probe 文件落盘。

前三轮累计原发现：超时语义、附件普通失败回滚第一轮通过；F2/F3 第二轮关闭；最后阻塞的 TTL/容量淘汰边界本轮关闭。因此就本次稳定性修复及本顾问审查范围，**可以提交**。已公开历史 token 的轮换仍须由持有方处理，历史删除/轮换不在本轮代码终审内；本判定不表示泄露凭据已失效。
