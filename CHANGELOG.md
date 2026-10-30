# Changelog

All notable changes to this project. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic
versioning.

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