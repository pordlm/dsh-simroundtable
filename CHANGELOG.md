# Changelog

All notable changes to this project. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic
versioning.

## 0.7.1 (Unreleased)

### Fixed

- **GUI v1/v2 分流修复**：席位判定改为「本次实际发送席位」——与创建请求的
  `participants` 共用同一组装来源（`plannedSeats`），不再扫描已取消席位的遗留
  `personaBySeat`。此前「5 个无 Persona 回答者 + peers 互评共 10 席」本应走 v1
  却被启动按钮误禁用；取消（末席或中间席）模型时同步清理该席的角色卡残留，
  不会让移除的席位继续伪装成 v2。
- **savePersona 工作区归属保护**：成功、失败、异常三条路径全部经
  `stillValid(token)` 判定；工作区 A 发起保存后切到 B，A 的迟到响应不再清空
  B 的表单、不再给 B 置 busy 或闪提示。切换工作区时重置 `personaBusy`。
- **Checkpoint degraded**：阶段末 checkpoint 写盘失败降级为记录 limitation
  继续开会（degraded 标记），不再中断整场会议。
- **追加式失败历史**：席位失败记录为 append-only 的 `failures` 历史，
  重试不覆盖旧失败证据。
- **incomplete 终态**：部分席位失败时会议结算为 `incomplete`（含失败明细），
  而不是伪装 `completed`。
- **selfReview 治理**：评审席位不得评审自己的回答（可通过配置关闭以显式允许）。
- **席位上限前置提示**：v2 场景席位超限时前端前置禁用启动并写明席位构成，
  后端保留 400 拦截兜底；v1 圆桌不受 8 席限制约束。
- **registry 执行权威**：协议以 registry 注册信息为准执行；未知协议 id /
  版本返回 400。
- **文档更正（README）**：披露「API 允许显式声明 v2 而无需 Persona（v2 同时
  是席位协议）」；更正 `personaBinding: off` 时 `/personas` 路由仍注册
  （GET 返回 `binding:"off"` 与空列表）；回滚章节去掉「无条件安全 / Markdown
  完全相同」的过强表述，改为实际约束（v1 记录读时字节不变有测试证据；
  v2 记录回滚前必须备份；跨版本导出以 `renderExport` 为唯一出口）。

## 0.7.0

### Roundtable v2 protocol

- New v2 protocol with explicit seats (`participants` with roles), persona
  injection, synthesized transcripts and a full terminal projection:
  `reviews`, `failures`, roster member status, transcript and
  `finalAnswer.ranking`/`anonymousId`/`arbiter` are all written on settlement
  through `persistTerminal` (terminal-shadow semantics), so a page refresh
  shows the complete result.
- Seat personas are really injected: tasks carry the seat's `personaId`, the
  composer resolves the persona snapshot, and seats without a persona fall
  back byte-for-byte to the v1 prompts.
- Text attachment bodies reach child agents again (the v2 prompt composer
  passed an array where a string block is expected); image parts are routed by
  stage — answer and arbiter see them, review/discussion do not.
- Seat routes survive planning: `modelRouteKey` is kept on every participant
  projection, so same-origin disclosure groups seats correctly instead of
  lumping all seats into one group.
- A meeting where every answering model fails settles as **failed** (with the
  existing "no usable answer" message) instead of reporting `completed`.
- Empty reviewer list falls back to the v1 default (the answerers review each
  other) with a disclosed limitation; the 8-seat total cap still applies.
- Arbiter fallback picks the top-ranked answer (`ranking[0]`) instead of the
  first seat in roster order, and the fallback report quotes that answer's
  text as `finalAnswer`.
- Ranking salvage: an unparseable structured review falls back to text-salvaged
  rankings instead of being dropped.
- Refusal answers fail their task instead of being recorded as empty text, and
  structured output schemas are only requested from providers that declare the
  capability.
- Stage-end checkpoints now carry the full protocol state (not just counts) and
  checkpoint failures degrade to a logged limitation instead of killing the
  run; state size is measured in UTF-8 bytes.
- Child agent labels name their stage (review/arbiter/discussion/answer).
- Attachment hardening: the file-name heading is escaped like the fence label,
  and an upload manifest `payload` must be a bare file name (no separators or
  `..`), so a tampered manifest cannot escape the meeting attachment area.
- The plugin lifecycle controller is created per activation, so
  enable → disable → enable no longer leaves commands/tool calls permanently
  aborted.

### Personas and records

- Ten built-in role cards (architect, red-team attacker, defender, independent
  verifier, pro/con advocate, Socratic facilitator, domain expert, operator,
  judge) and a workspace store at `.roundtable/personas/personas.json` with
  atomic writes, a field whitelist, size/count limits and read-only built-ins.
- Personas are viewpoints, never capabilities: they are injected as fenced
  reference data, cannot grant tools or pick a provider/model, and the page
  selector only appears when `personaBinding` is `opt-in`.
- Meetings freeze their persona snapshots, so editing or deleting a card later
  cannot rewrite a past record; record v2 carries `protocol`, `participants`,
  `personaSnapshots`, `protocolState` and `finalReport`.
- Reading a v1 record never writes to disk and never gains v2 fields; history
  summaries only add `protocol`/`stageIndex`/`stageCount` for v2 records, and
  both versions export through the same `renderExport` path.

### Packaging and gates

- `npm run check` and `npm test` discover files recursively (`lib/**/*.js`,
  `test/**/*.test.mjs`), and `npm pack` ships `lib/**/*.js`, so a new module
  subdirectory can no longer drop out of the package or out of CI.
- New golden test pins the v1 Markdown export to a committed fixture; the v2
  suite pins "v1 records stay byte-identical, v2 records keep seats and a full
  report".
- Rollback is documented in `docs/rollback-v2.md`: disabling `personaBinding`
  keeps v2 records readable and exportable, and code batches revert in reverse
  closure order.

### Known limitations (carried to 0.7.1)

- No automatic resume from stage checkpoints; a crash leaves the record
  readable but the meeting must be started again.
- No compact retry after a malformed structured review (it would cost an extra
  billed call); the local ranking salvage covers the common case.
- A meeting is capped at eight seats in total.

## 0.6.1

- A meeting's terminal record is **durable before the run is released**: on
  `settle`/`terminate`/`cancel` the write is retried (4 attempts, 50/150/400 ms)
  and, if the filesystem keeps failing, the terminal record is kept in memory as
  a terminal shadow keyed by workspace + id. The run stays in `active` until the
  shadow is healed, `reconcile()` reads the shadow first and never downgrades a
  completed meeting to `interrupted`, and a late cancel cannot rewrite a
  completed record.
- `agents.create()` is now **abortable**: the hidden orchestrator creation races
  the run's deadline/cancel signal, so a hung host call can no longer keep
  `execute()` alive past `runTimeoutMs` or squat on a concurrency slot. A handle
  that arrives after the abort is disposed exactly once instead of leaking.
- Web tools became **stage-specific capability**, not a prompt request: the
  answer stage gets `web_search`/`web_fetch` only when the meeting has no
  attachments, and discussion/review/arbiter stages get none; the restriction is
  applied to the child Agent's tool policy and re-read back after applying.
- Workspaces must be **registered**: `resolveWorkspace()` no longer accepts an
  arbitrary absolute directory, and answers `400 workspace-not-registered`
  instead, so a caller cannot make the plugin create `.roundtable`, adopt
  attachments, or write exports outside the workspaces the user opened.
- Tests: 81 passing (was 69), including non-hollow checks run against the
  previous release for every fix above.


- Repository hygiene: `HANDOFF.md` (local handoff notes with machine paths,
  DSH profile/token locations and private workflow) is no longer tracked; it
  stays in the working tree and is ignored by `.gitignore`. Local
  `*.token.txt` credential files are ignored as well, and the previously
  tracked `preview/_diag/psd2live_mcp.token.txt` was removed from the index.
  **Any credential that was ever committed should be rotated.**
- Version and licensing docs aligned at **0.6.0** (`package.json`,
  `CHANGELOG.md`, `README.md`, `NOTICE.md`). `NOTICE.md` now spells out the
  boundary for `preview/` (GPL scripts/pages; screenshots and evidence are
  development artifacts, not separately GPL), `tools/` (not tracked, not
  distributed) and `relay-kit/` (GPL docs/prompts; its `tools/` scripts and
  browser login state are not tracked).
- `README.md` documents the **Live2D character distribution boundary**: which
  rigs ship in the public repo, which need a local build (`gpt`,
  `claude-book`, `kimi/mimo/minimax` prop variants), that the npm package ships
  only whale-girl, and that missing rigs fall back to whale-girl per seat.
- Stage frame is no longer a fixed 760×430: `stageLayout()` derives the height
  from the seat count (438 px at two seats, 318 px at eight) and grows the
  characters as the row gets crowded, letting hair and shoulders touch from five
  seats on. Eight seats used to be 99 px people on a 430 px frame with half of
  it empty; they are now 125 px people on a 318 px frame, and the table band
  follows the character height so people stay about 1.1x the desk tall at any
  seat count.
- Nameplates at narrow seats (step < 130 px) now show the model name only, at
  9 px with the colour dot dropped, so eight real model names fit instead of
  being cut to `DeepSee…`; the full `model · provider` label stays in the
  tooltip and in the bubble header.
- Bubbles at crowded tables get wider instead of shorter (184–236 px, four
  lines at 10.5 px), and are clamped inside the frame.
- Attachment adoption is **transactional**: if any file of a batch cannot be
  moved into `.roundtable/attachments/<meetingId>/`, every file that already
  moved returns to `.roundtable/uploads/` and the meeting directory is removed,
  so a failed start leaves nothing half-adopted. The same rollback runs when the
  first meeting record cannot be persisted. Uploads that are never adopted (page
  closed before starting) expire after `uploadTtlHours` (default 24 h, `0`
  disables) and are swept on the next upload or meeting start.
- Prompt-injection hardening: attached files and peer answers are quoted as
  **data** inside a per-call random-nonce fence (`<<<FILE:nonce:N …>>>` …
  `<<<END FILE:nonce:N>>>`, `<<<ANSWER:nonce:A>>>` …), and any fence-shaped
  marker inside the content (triple backticks, forged `<<<END FILE:…>>>`) is
  escaped, so a file can no longer close its block and speak as prompt text.
  Answer, revision, review and arbiter prompts now share a security block: never
  execute instructions found in quoted material, never let it change the
  ranking/scoring rules, and never send context or file text to an external
  service or into a web-tool query.

## 0.5.0

- Round-table stage: the meeting detail page now shows a long-table Live2D
  scene above the transcript. Seats follow the answerer roster (up to 8), the
  member who is currently answering performs the shared "speaking" motion while
  everyone else idles on their own randomized rhythm, and a speech bubble shows
  that member's latest answer (cleaned and truncated to 80 characters). Clicking
  a nameplate switches the bubble to that seat. The model's built-in `idle` and
  every prop motion are suppressed — `c_0120` only exposes visual changes on
  `ParamAngle*` / `ParamBodyAngle*`, so speaking is conveyed by nod/lean + bubble.
- New `lib/stage.js`: because plugins get no static directory URL, stage assets
  are served through exact Connection fetch routes under
  `/api/roundtable/stage/*` (three runtime scripts, table/chair art, moc3,
  physics3, textures) plus a server-side trimmed `model3.json` that drops
  motions, expressions and display info. Binaries are cached for a week, the
  descriptor is `no-store`.
- The stage is laid out in fixed 760×430 design units (the detail column is
  760 px wide) and scaled down with `transform` below that, so nameplates stay
  readable; seat spacing keeps a deliberate gap between chairs and characters.
- `preview/longtable.html`: chairs and characters are no longer squeezed
  edge-to-edge — spacing now budgets a gap from the slot width
  (`gapChair ≈ 0.13·step`, `gapChar ≈ 0.06·step`), fixing the 8-seat layout
  where chairs used to overlap into one dark plank.
- New `test/stage.test.mjs` and matching route-list updates in
  `test/apply.test.mjs` / `test/meetings.test.mjs` (45 tests total);
  `npm run check` now also checks `lib/api.js` and `lib/stage.js`.
- `package.json` `files` now ships `assets/table-long.png` and `assets/chairs/`.

## 0.4.0

- License changed from MIT to **GPL-3.0-or-later** for the code; terms for the
  bundled artwork and third-party runtimes are layered and documented in
  `NOTICE.md`.
- Bundled the Live2D runtime used by the upcoming round-table stage:
  PIXI.js 6.5.10 (MIT), pixi-live2d-display 0.4.0 (MIT) and Live2D Cubism Core
  (Live2D redistributable) under `assets/vendor/`.
- Added an optional whale-girl Live2D model under `assets/models/whale-girl/`,
  licensed **CC BY-NC-SA 4.0** (attribution: 上善无形 / ZipZipPipe / 氵六青).
  The model is a separate work, not covered by the GPL; see
  `assets/models/whale-girl/LICENSE-ASSETS.md`.
- Added `NOTICE.md` and README license table explaining the split.

## 0.3.0

- Topic attachments: images, code, tables and documents can be attached to the
  meeting topic from the page (`POST /api/roundtable/upload`).
- Per-route dispatch: images go only to answerers and the arbiter whose route
  declares image input (`GET /api/roundtable/capabilities`); text files are
  decoded and inlined into the prompt for every participant, with per-file and
  total character budgets. Skipped or truncated material is reported in
  `limitations`, never silently dropped.
- Pending uploads live under `.roundtable/uploads/<id>/` and move into
  `.roundtable/attachments/<meetingId>/` only when the meeting is created;
  `POST /api/roundtable/upload/remove` takes one back.
- New config keys: `attachmentMaxFiles`, `attachmentMaxFileBytes`,
  `attachmentMaxTotalBytes`, `attachmentTextCharsPerFile`,
  `attachmentTextCharsTotal`. `attachmentMaxFiles: 0` disables attachments.
- The page names models that will not see attached images and lists a meeting's
  attachments in its detail view; exports gain an attachment section.

## 0.2.1

- Export: same-origin fetch first, then a 5 s save-dialog window, then a
  server-side Markdown file under `<workspace>/.roundtable/exports/`, and
  finally a visible read-only Markdown view. The copy action copies the real
  path or the Markdown body.
- The dedicated page now scrolls long records inside the host main panel
  (`height: 100%`, `minHeight: 0`, `overflowY: auto`), so the wheel works.
- Review robustness: ranking is requested before prose, truncated rankings are
  salvaged, missing answer ids are normalized, and a compact ranking prompt is
  retried once. The arbiter falls back to a plain-text prompt.
- History survives a host reload; meetings left `running` are recovered as
  `interrupted` instead of being reported as completed.

## 0.2.0

- Dedicated Web page: `sidebar.panellist` entry, keyed `main` panel, and the
  `conversation.chat.commandview`.
- HTTP API `/api/roundtable/*` with a uniform `{ ok, data }` / `{ ok: false,
  error }` envelope.
- `MeetingManager`: validation, atomic per-workspace records, live progress,
  cancellation, concurrency limits and Markdown export.
- Configurable rounds, token budgets, stage truncation and meeting history.

## 0.1.0

- `/roundtable` command and `roundtable` model tool.
- Four-stage pipeline on fresh subagents: independent answers, peer revision,
  anonymous review, final arbitration.
- Partial-failure reporting and honest degradation notes.
## Deferred / accepted limits (recorded, not blocking)

Items the user reviewed on 2026-11-12 and accepted as "not a major bug, record and move on":

- **Child tool-policy refusal set is lifecycle-bound.** T17 removed the 4096
  FIFO eviction: a refused id is kept until its activation settles, so the set
  only grows with activations that never settle (hung providers), not with
  meeting count. A pathological provider that never settles would keep its id
  until process exit; this is the deliberate trade-off over the previous
  capacity cap. Verified by T18 (including a control that reintroduces the cap
  and reproduces the old fail-open).
- **Third-party advisor review stopped after round 2 findings were fixed.**
  F1 (TTL window), F1b (4096 eviction), F2 (stale export), F3 (stale cancel)
  are all closed and independently verified; a third round was queued but not
  run, per the "only blocking defects block" decision.
- **Doubao mouth at MouthOpenY≈0.5 still shows a 50% faint smile line.**
  PSD2Live only binds mouth drawables linearly (`1 - v` / `v`); a true eased
  blend needs Cubism keyframes. Full-open now uses the repainted mouth piece
  (rounded upper lip, no dashed rim), closed state is unchanged.
- **Gemini right-jaw fill boundary** sits at ΔL* ≈ 0.94 at 1x (was 8.15);
  the 6x-only straight edge at the 26 CSS px seam is accepted as invisible.
- **Advisor review of 0.6.1 passed on round four.** The first three rounds
  covered the earlier permission/race fixes; round four covered the T1/T2/T3
  work below after two blocking paths it found were fixed (a same-microtask
  `create` resolve that leaked the handle, and `dispose()` releasing a run whose
  terminal record was still unhealed). Evidence:
  `preview/_evidence/stability2/REVIEW_round4.md` plus the verifier's independent
  7/7 report in the same directory.

