# 回滚记录 v2（Phase 1，PR-4+5 同批）

这批改动让会议可以选择性地写入 **record version 2**：`protocol`/`participants`/
`personaSnapshots`/`protocolState`/`finalReport`。v1 会议完全不写这些字段，读取、
列表、导出都保持逐字节不变。

## 什么时候需要回滚

- 页面上出现 Persona 选择器后，会议创建失败或记录损坏；
- `.roundtable/*.json` 里出现 `version: 2` 但工作台无法打开详情/导出；
- 宿主升级后 `personaBinding` 缺失导致配置校验失败。

## 关闭能力（不撤代码，首选）

1. 把插件配置里的 `personaBinding` 改为 `off`（`cordis.patch.yml` 或用户配置）；
2. 在「插件」页把 dsh-simroundtable 关一次再打开（配置只在装载时读取）；
3. 结果：`/api/roundtable/personas` 仍存在但 `GET` 返回 `binding: "off"`，页面不再
   渲染选择器，`POST /meetings` 带 `personaId` 会得到 400 `persona-not-supported`；
   新建会议回到 v1 路径。已存在的 v2 记录仍可读、可导出（v2 渲染器保留）。

## 撤代码（完整回滚）

按 `docs/phase1-plan-v2.md` §8.2 的闭包逆序执行：

```
PR-6 → PR-5 → PR-4（先把所有 v2 会议跑到终态，并导出 JSON/Markdown 备份）
      → PR-3 → PR-2 → PR-1 → PR-0
```

只有栈顶批次可以单独 revert；其余批次必须从栈顶依次撤。revert PR-4 之前：

1. 确认没有 `status` 不是终态的 v2 会议（`queued`/`running`）；
2. 对每场 v2 会议执行导出（`GET /api/roundtable/meeting/export?...&format=json`
   与 Markdown 各存一份），因为撤掉 PR-4 后 v2 记录不再能由页面打开；
3. 在临时 worktree 上应用 revert，只检查**保留下来的文件**是否还有悬空 import，
   再跑该回退版本的 `npm run check` / `npm test` / `npm pack --dry-run`。

## v2 记录的最小形状

```jsonc
{
  "version": 2,
  "protocol": { "id": "roundtable", "version": 2, "config": { "rounds": 0 } },
  "participants": [{ "id": "a1", "provider": "p1", "model": "p1-model", "role": "answerer", "personaId": "…", "personaName": "…" }],
  "personaSnapshots": { "…": { "id": "…", "name": "…", "version": 1 } },
  "protocolState": { "stage": "…", "stageIndex": 3, "stageCount": 3, "seats": [], "counts": {} },
  "finalReport": { "markdown": "…", "fallback": false, "incomplete": false, "ranking": [], "sameRouteNotes": [] }
}
```

`protocolState` 只保存可 JSON 化的裁剪快照，任何 handle / AbortController 都不会写盘。