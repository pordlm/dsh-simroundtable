// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Durable roundtable meetings.
 *
 * A meeting is one roundtable run with a durable record under
 * `<workspace>/.roundtable/<id>.json` plus the in-memory run that produces it.
 * The page API drives this module; the slash command and the model tool keep
 * using the same engine without persisting anything.
 *
 * Design rules that matter:
 *
 * - Starting a meeting never blocks on model discovery. The record is written
 *   as `queued`, the HTTP call returns, and the run resolves the catalog in the
 *   background. A wrong model therefore shows up as a failed meeting with a
 *   readable reason instead of a hanging request.
 * - A host restart cannot resume a run. Records left `running`/`queued` by a
 *   previous process are marked `interrupted` when read, never silently
 *   resumed and never reported as finished.
 * - Cancelling stops the children first and leaves a terminal record behind.
 * - Nothing here pretends a degraded run succeeded: fallback answers carry
 *   `finalAnswer.fallback = true` and a matching limitation entry.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import {
  ROUNDTABLE_DIR,
  assignAnswerIds,
  buildDirectory,
  findModel,
  formatMeeting,
  isMeetingTerminal,
  meetingDetail,
  meetingSummary,
  modelKey,
  nowIso,
  render,
  shortMessage,
  truncateText,
} from "./core.js";
import {
  AttachmentError,
  adoptUploads,
  attachmentLimits,
  attachmentTextBlock,
  resolveImageSupport,
} from "./attachments.js";
import { requireSubagentProvider, runDeliberation } from "./engine.js";

/** Directory (relative to a workspace root) that owns meeting records. */
export const MEETING_DIRECTORY = ROUNDTABLE_DIR;
const MEETING_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u;

/** A request problem that the page API can translate into a status code. */
export class MeetingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "MeetingError";
    this.code = code;
    this.status = status;
  }
}

/** camelCase copy key → kebab-case API error code (`invalidRoster`). */
function errorCodeOf(key) {
  return String(key).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function badRequest(copy, key, values) {
  const template = copy[key] ?? copy.invalidRequest;
  return new MeetingError(errorCodeOf(key), render(template, values ?? {}), 400);
}

/** Case-insensitive path comparison on Windows, exact elsewhere. */
function samePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = resolvePath(left);
  const b = resolvePath(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the workspace a meeting belongs to.
 *
 * Accepts a workspace id, an absolute directory path, or nothing (the first
 * registered workspace). Paths that are not absolute or not directories are
 * rejected; the plugin never writes `.roundtable` outside a real workspace.
 */
export function resolveWorkspace(ctx, wanted, copy) {
  let registered = [];
  try {
    registered = Array.isArray(ctx.get?.("workspaceRegistry")?.list?.())
      ? ctx.get("workspaceRegistry").list()
      : [];
  } catch {
    registered = [];
  }
  const raw = typeof wanted === "string" ? wanted.trim() : "";
  if (raw === "") {
    if (registered.length > 0) {
      const first = registered[0];
      return { path: first.path, id: first.id, title: first.title, registered };
    }
    throw badRequest(copy, "workspaceMissing");
  }
  const byId = registered.find((workspace) => String(workspace.id) === raw);
  if (byId !== undefined) {
    return { path: byId.path, id: byId.id, title: byId.title, registered };
  }
  if (!isAbsolute(raw)) throw badRequest(copy, "invalidWorkspace", { path: raw });
  const normalized = resolvePath(raw);
  const match = registered.find((workspace) => samePath(workspace.path, normalized));
  if (match !== undefined) {
    return { path: match.path, id: match.id, title: match.title, registered };
  }
  if (!isDirectory(normalized)) throw badRequest(copy, "invalidWorkspace", { path: raw });
  return { path: normalized, registered };
}

/** Parse one `{ provider, model }` reference from JSON input. */
function parseRef(value, copy) {
  if (typeof value === "string") {
    const key = value.trim();
    const slash = key.indexOf("/");
    if (slash > 0 && slash < key.length - 1) {
      return { key, provider: key.slice(0, slash), model: key.slice(slash + 1) };
    }
    throw badRequest(copy, "invalidRequest", { message: key });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(copy, "invalidRequest", { message: String(value) });
  }
  const provider = typeof value.provider === "string" ? value.provider.trim() : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (provider === "" || model === "") {
    throw badRequest(copy, "invalidRequest", { message: `${provider || "?"}/${model || "?"}` });
  }
  return { key: modelKey(provider, model), provider, model };
}

function parseRefList(value, copy) {
  if (!Array.isArray(value)) throw badRequest(copy, "invalidRequest", { message: "models" });
  const seen = new Set();
  const refs = [];
  for (const item of value) {
    const ref = parseRef(item, copy);
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);
    refs.push(ref);
  }
  return refs;
}

function validateRoster(input, copy, config) {
  const answerers = parseRefList(input.answerers, copy);
  if (answerers.length < 2 || answerers.length > 8) throw badRequest(copy, "invalidRoster");
  const reviewers = input.reviewers === undefined
    ? answerers.map((ref) => ({ ...ref }))
    : parseRefList(input.reviewers, copy);
  if (reviewers.length < 1 || reviewers.length > 8) throw badRequest(copy, "invalidRoster");
  const arbiter = input.arbiter === undefined ? undefined : parseRef(input.arbiter, copy);
  const rawRounds = input.rounds === undefined ? 1 : input.rounds;
  const rounds = typeof rawRounds === "string" && rawRounds.trim() !== "" ? Number(rawRounds) : rawRounds;
  if (!Number.isSafeInteger(rounds) || rounds < 0 || rounds > config.maxRounds) {
    throw badRequest(copy, "invalidRoundCount", { max: config.maxRounds });
  }
  return { answerers, reviewers, arbiter, rounds };
}

function emptyProgress() {
  return { stageIndex: 0, stageCount: 0, completed: 0, total: 0 };
}

function rosterSlot(ref, anonymousId) {
  return {
    key: ref.key ?? modelKey(ref.provider, ref.model),
    anonymousId,
    provider: ref.provider,
    providerName: ref.providerName,
    model: ref.model,
    modelName: ref.modelName,
    label: ref.label ?? `${ref.modelName ?? ref.model} · ${ref.providerName ?? ref.provider}`,
    status: "pending",
  };
}

function stageIndexOf(stage, rounds) {
  const order = rounds > 0
    ? ["answering", "discussing", "reviewing", "deciding"]
    : ["answering", "reviewing", "deciding"];
  const index = order.indexOf(stage);
  return index < 0 ? 0 : index + 1;
}

function stageCountOf(rounds) {
  return rounds > 0 ? 5 : 4;
}

/** One meeting's durable record plus the live run that fills it. */
class MeetingRun {
  constructor(manager, record) {
    this.manager = manager;
    this.record = record;
    this.controller = new AbortController();
    this.timedOut = false;
    this.orchestrator = undefined;
    this.promise = undefined;
  }

  write() {
    this.manager.write(this.record);
  }

  emit(event) {
    const record = this.record;
    // A cancelled or interrupted run must stay terminal: late progress events
    // from children that are still winding down would otherwise resurrect it.
    if (record.status === "cancelled" || record.status === "interrupted") return;
    const at = event.at ?? nowIso();
    switch (event.type) {
      case "stage": {
        record.stage = event.stage;
        record.stageLabel = event.stageLabel;
        if (event.round !== undefined) record.currentRound = event.round;
        record.progress.stageIndex = stageIndexOf(event.stage, record.rounds);
        record.progress.stageCount = stageCountOf(record.rounds);
        break;
      }
      case "member": {
        const list = event.role === "answerer"
          ? record.roster.answerers
          : event.role === "reviewer"
            ? record.roster.reviewers
            : (record.roster.arbiter === undefined ? [] : [record.roster.arbiter]);
        const member = list.find((item) => item.key === event.key);
        if (member !== undefined) {
          member.status = event.status;
          member.stage = event.stage;
          if (event.error !== undefined) member.error = event.error;
          if (event.status === "done" || event.status === "failed") {
            record.progress.completed = Math.min(record.progress.total, record.progress.completed + 1);
          }
        }
        break;
      }
      case "transcript": {
        const seq = record.transcript.length + 1;
        record.transcript.push({ seq, ...event.entry, at });
        if (record.transcript.length > 200) record.transcript.shift();
        break;
      }
      case "review": {
        record.reviews.push({ ...event.review, anonymous: true });
        break;
      }
      case "failure": {
        const failure = event.failure;
        const duplicate = record.failures.some((item) => item.stage === failure.stage
          && item.entry?.key === failure.entry?.key
          && item.message === failure.message);
        if (!duplicate) {
          record.failures.push({
            stage: failure.stage,
            entry: failure.entry === undefined ? undefined : { ...failure.entry },
            message: failure.message,
            at,
          });
        }
        break;
      }
      default:
        break;
    }
    record.updatedAt = at;
    this.write();
  }

  /** Fold the engine's final data into the durable record. */
  settle(data) {
    const record = this.record;
    const copy = this.manager.copy();
    if (record.status === "cancelled" || record.status === "interrupted") return;
    record.status = "completed";
    record.stage = "completed";
    record.stageLabel = "completed";
    record.currentRound = record.rounds;
    record.endedAt = nowIso();
    record.progress.completed = record.progress.total;
    record.progress.stageIndex = stageCountOf(record.rounds);
    record.progress.stageCount = stageCountOf(record.rounds);
    record.roundsRun = data.roundsRun;
    record.answers = data.answers.map((answer) => ({
      anonymousId: answer.id,
      actorKey: answer.entry.key,
      provider: answer.entry.provider,
      providerName: answer.entry.providerName,
      model: answer.entry.model,
      modelName: answer.entry.modelName,
      label: answer.entry.label,
      text: answer.text,
      revised: answer.revised,
    }));
    record.ranking = data.ranking;
    record.reviews = data.reviews.map((review) => ({
      reviewerKey: review.reviewerKey,
      reviewerLabel: review.reviewerLabel,
      anonymous: true,
      selfReview: review.selfReview === true,
      // The page numbers each reviewer's own ordering, so a review carries its
      // vote as rows (`answerId` + `averageRank`) instead of a bare id list.
      ranking: (Array.isArray(review.ranking) ? review.ranking : []).map((answerId, index) => ({
        answerId: typeof answerId === "string" ? answerId : answerId?.answerId,
        averageRank: index + 1,
      })),
      ...(review.rankingCompact
        ? { note: copy.reviewCompactNote }
        : review.rankingSalvaged
          ? { note: copy.rankingSalvagedNote }
          : review.rankingNormalized
            ? { note: copy.rankingNormalizedNote }
            : {}),
    }));
    const finalText = data.finalText ?? "";
    record.finalAnswer = {
      text: finalText,
      fallback: data.finalFallback === true,
      anonymousId: data.finalAnswerId,
      authorKey: data.finalAuthor?.key,
      authorLabel: data.finalAuthor?.label,
      arbiter: data.arbiterResult === undefined
        ? null
        : {
            key: data.arbiterResult.entry.key,
            label: data.arbiterResult.entry.label,
            provider: data.arbiterResult.entry.provider,
            model: data.arbiterResult.entry.model,
            text: data.arbiterResult.answerMarkdown,
          },
      ranking: data.ranking,
    };
    record.failures = data.failures.map((failure) => ({
      stage: failure.stage,
      entry: failure.entry === undefined ? undefined : {
        key: failure.entry.key,
        provider: failure.entry.provider,
        providerName: failure.entry.providerName,
        model: failure.entry.model,
        modelName: failure.entry.modelName,
        label: failure.entry.label,
      },
      message: failure.message,
      at: record.endedAt,
    }));
    record.notes = data.notes;
    record.limitations = data.limitations;
    record.maxAnswerChars = data.maxAnswerChars;
    record.updatedAt = record.endedAt;
    this.write();
  }

  /** Mark the record failed/interrupted/cancelled exactly once. */
  terminate(status, message, extra = {}) {
    const record = this.record;
    if (record.status === "cancelled" || record.status === "interrupted") {
      // A cancel or host shutdown already won the race; keep its record.
      return;
    }
    record.status = status;
    record.stage = status;
    record.stageLabel = status;
    record.endedAt = record.endedAt ?? nowIso();
    record.updatedAt = nowIso();
    if (message !== undefined) {
      record.failures.push({
        stage: status,
        message,
        at: record.updatedAt,
        ...extra,
      });
    }
    this.write();
  }
}

/**
 * Owns every durable meeting of one plugin instance.
 *
 * The manager is created by `apply()` and disposed with the plugin fiber: on
 * disposal every live run is stopped and its record is marked `interrupted`
 * instead of being left as a phantom `running` row.
 */
export class MeetingManager {
  constructor({ ctx, config, copyFor, resolveLocale }) {
    this.ctx = ctx;
    this.config = config;
    this.copyFor = copyFor;
    this.resolveLocale = resolveLocale;
    this.active = new Map();
    /** path → { stamp, summary }: the page polls the list route, so finished
     * records are summarised once per file version instead of per request. */
    this.summaries = new Map();
    this.disposed = false;
  }

  copy() {
    return this.copyFor(this.resolveLocale());
  }

  pathOf(workspace, id) {
    return join(workspace, MEETING_DIRECTORY, `${id}.json`);
  }

  write(record) {
    try {
      const path = this.pathOf(record.workspace, record.id);
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      renameSync(temporary, path);
      this.summaries.delete(path);
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-simroundtable: could not write meeting record: ${shortMessage(error, "unknown error")}`);
    }
  }

  read(workspace, id, copy) {
    if (!MEETING_ID.test(id)) throw new MeetingError("meeting-not-found", render(copy.meetingNotFound, { id }), 404);
    const path = this.pathOf(workspace, id);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new MeetingError("meeting-not-found", render(copy.meetingNotFound, { id }), 404);
    }
    if (typeof parsed !== "object" || parsed === null || parsed.id !== id) {
      throw new MeetingError("meeting-not-found", render(copy.meetingNotFound, { id }), 404);
    }
    return this.reconcile(parsed, copy);
  }

  /**
   * A record that claims to be running but has no live run belongs to a dead
   * process. Mark it interrupted (and persist that fact) instead of pretending
   * the meeting still progresses.
   */
  reconcile(record, copy) {
    if (record.status !== "running" && record.status !== "queued") return record;
    if (this.active.has(record.id)) return record;
    const at = nowIso();
    record.status = "interrupted";
    record.stage = "interrupted";
    record.stageLabel = "interrupted";
    record.endedAt = record.endedAt ?? at;
    record.updatedAt = at;
    record.limitations = Array.isArray(record.limitations) ? record.limitations : [];
    if (!record.limitations.includes(copy.meetingInterruptedNote)) {
      record.limitations.push(copy.meetingInterruptedNote);
    }
    record.failures = Array.isArray(record.failures) ? record.failures : [];
    record.failures.push({ stage: "interrupted", message: copy.meetingInterruptedNote, at });
    this.write(record);
    return record;
  }

  list(workspacePath, limit) {
    const copy = this.copy();
    const directory = join(workspacePath, MEETING_DIRECTORY);
    let names = [];
    try {
      names = readdirSync(directory).filter((name) => name.endsWith(".json"));
    } catch {
      names = [];
    }
    const meetings = [];
    const seen = new Set();
    for (const name of names) {
      const id = name.slice(0, -".json".length);
      if (!MEETING_ID.test(id)) continue;
      const path = join(directory, name);
      seen.add(path);
      // A live run is the freshest possible source: no disk read at all.
      const live = this.active.get(id);
      if (live !== undefined) {
        meetings.push(meetingSummary(live.record));
        continue;
      }
      // The page polls this route every ~1s, so finished records are summarised
      // once per file version instead of being re-parsed on every poll.
      let stamp;
      try {
        const stats = statSync(path);
        stamp = `${stats.mtimeMs}:${stats.size}`;
      } catch {
        continue;
      }
      const cached = this.summaries.get(path);
      if (cached !== undefined && cached.stamp === stamp) {
        meetings.push(cached.summary);
        continue;
      }
      try {
        const record = this.read(workspacePath, id, copy);
        const summary = meetingSummary(record);
        this.summaries.set(path, { stamp, summary });
        meetings.push(summary);
      } catch {
        // A corrupt or half-written record is skipped, not fatal.
      }
    }
    for (const path of [...this.summaries.keys()]) {
      if (!seen.has(path)) this.summaries.delete(path);
    }
    meetings.sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
    const cap = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : this.config.meetingHistoryLimit;
    return { workspace: workspacePath, meetings: meetings.slice(0, cap) };
  }

  detail(workspacePath, id) {
    const copy = this.copy();
    return meetingDetail(this.read(workspacePath, id, copy));
  }

  markdown(workspacePath, id) {
    const copy = this.copy();
    return formatMeeting(this.read(workspacePath, id, copy), copy);
  }

  /**
   * Write the Markdown export next to the meeting record and return its path.
   *
   * The page prefers the browser's own save dialog, but the desktop shell does
   * not reliably hand page downloads to a save dialog, so this is the fallback
   * that always produces a real file: `<workspace>/.roundtable/exports/roundtable-<id>.md`.
   * It stays inside the meeting's own workspace — nothing is written elsewhere.
   */
  saveMarkdown(workspacePath, id) {
    const markdown = this.markdown(workspacePath, id);
    const directory = join(workspacePath, MEETING_DIRECTORY, "exports");
    const filename = `roundtable-${id}.md`;
    const path = join(directory, filename);
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path, markdown, "utf8");
    } catch (error) {
      const copy = this.copy();
      throw new MeetingError(
        "export-failed",
        render(copy.exportSaveFailed, { message: String(error?.message ?? error) }),
        500,
      );
    }
    return { path, filename, bytes: Buffer.byteLength(markdown, "utf8") };
  }

  /**
   * Validate the request, persist a `queued` record, and start the run in the
   * background. Returns the initial detail immediately.
   */
  async create(input) {
    const copy = this.copy();
    if (this.disposed) throw new MeetingError("meeting-unavailable", copy.apiUnavailable, 503);
    if (this.active.size >= this.config.maxConcurrentMeetings) {
      throw badRequest(copy, "meetingTooMany", { n: this.config.maxConcurrentMeetings });
    }
    const workspace = resolveWorkspace(this.ctx, input?.workspace, copy).path;
    const topic = typeof input?.topic === "string" ? input.topic.trim() : "";
    if (topic === "") throw badRequest(copy, "invalidRequest", { message: copy.invalidTopic });
    if (topic.length > 20_000) throw badRequest(copy, "invalidRequest", { message: "topic" });
    const sessionId = typeof input?.sessionId === "string" && input.sessionId.trim() !== ""
      ? input.sessionId.trim()
      : undefined;
    const roster = validateRoster(input ?? {}, copy, this.config);

    const id = randomUUID();
    const at = nowIso();
    const rounds = roster.rounds;
    // Adopt uploads before the record exists, so a rejected attachment never
    // leaves a half-started meeting behind.
    const limits = attachmentLimits(this.config);
    const uploadIds = Array.isArray(input?.attachments)
      ? input.attachments.map((item) => (typeof item === "string" ? item : item?.id)).filter((item) => typeof item === "string")
      : [];
    if (uploadIds.length > limits.maxFiles) {
      throw badRequest(copy, "attachmentTooMany", { max: limits.maxFiles });
    }
    if (limits.maxFiles === 0 && uploadIds.length > 0) {
      throw badRequest(copy, "attachmentTooMany", { max: 0 });
    }
    let adopted = [];
    if (uploadIds.length > 0) {
      try {
        adopted = adoptUploads({ workspace, ids: uploadIds, meetingId: id, copy });
      } catch (error) {
        if (error instanceof AttachmentError) throw new MeetingError(error.code, error.message, error.status);
        throw error;
      }
    }
    const attachments = adopted.map((attachment) => ({ ...attachment }));
    const record = {
      version: 1,
      id,
      topic,
      workspace,
      sessionId,
      status: "queued",
      stage: "queued",
      stageLabel: "queued",
      rounds,
      currentRound: 0,
      roundsRun: 0,
      createdAt: at,
      startedAt: undefined,
      endedAt: undefined,
      updatedAt: at,
      attachments,
      roster: {
        answerers: roster.answerers.map((ref) => rosterSlot(ref)),
        reviewers: roster.reviewers.map((ref) => rosterSlot(ref)),
        arbiter: roster.arbiter === undefined ? undefined : rosterSlot(roster.arbiter),
      },
      progress: {
        ...emptyProgress(),
        total: roster.answerers.length + roster.reviewers.length + 1,
        stageCount: stageCountOf(rounds),
      },
      transcript: [],
      reviews: [],
      ranking: [],
      answers: [],
      finalAnswer: null,
      failures: [],
      limitations: [],
      notes: [],
      autoArbiter: roster.arbiter === undefined,
    };

    const run = new MeetingRun(this, record);
    this.write(record);
    this.active.set(id, run);
    run.promise = this.execute(run, roster).catch((error) => {
      this.ctx.logger?.warn?.(`dsh-simroundtable: meeting ${id} crashed: ${shortMessage(error, "unknown error")}`);
      run.terminate("failed", shortMessage(error, copy.meetingStartFailed));
    }).finally(() => {
      this.active.delete(id);
    });
    return meetingDetail(this.reconcile(record, copy));
  }

  /** Resolve the roster against the live catalog and run the engine. */
  async execute(run, roster) {
    const copy = this.copy();
    const record = run.record;
    record.status = "running";
    record.stage = "queued";
    record.startedAt = nowIso();
    record.updatedAt = record.startedAt;
    run.write();

    const timer = setTimeout(() => {
      run.timedOut = true;
      run.controller.abort(new Error(render(copy.meetingTimedOut, { ms: this.config.runTimeoutMs })));
    }, this.config.runTimeoutMs);
    timer.unref?.();

    try {
      const directory = await buildDirectory(this.ctx.llm, {
        signal: run.controller.signal,
        timeoutMs: this.config.catalogTimeoutMs,
        copy,
      });
      if (directory.models.length === 0) throw new MeetingError("no-models", copy.noModels, 503);

      const resolveRef = (ref) => {
        const entry = findModel(directory, { provider: ref.provider, model: ref.model });
        if (entry === undefined) throw new MeetingError("unknown-models", render(copy.unknownModels, { list: ref.key }), 400);
        return entry;
      };
      const answerers = roster.answerers.map(resolveRef);
      const reviewers = roster.reviewers.map(resolveRef);
      const seating = assignAnswerIds(answerers);
      const arbiter = roster.arbiter === undefined
        ? answerers[0]
        : resolveRef(roster.arbiter);
      const autoArbiter = roster.arbiter === undefined;

      record.roster.answerers = seating.map((assignment) => rosterSlot(assignment.entry, assignment.id));
      record.roster.reviewers = reviewers.map((entry) => rosterSlot(entry));
      record.roster.arbiter = rosterSlot(arbiter);
      record.updatedAt = nowIso();
      run.write();

      const provider = requireSubagentProvider(this.ctx, this.config, copy);
      const parentAgent = await this.resolveParentAgent(run);

      // Topic attachments: text is inlined once for every stage that reads the
      // topic; images are addressed per route because a text-only model must
      // not receive one (the subagent layer would reject the whole stage).
      const attachments = Array.isArray(record.attachments) ? record.attachments : [];
      const textBlock = attachmentTextBlock(record.workspace, attachments, copy, this.config);
      const extraLimitations = [];
      if (textBlock.truncated.length > 0) {
        extraLimitations.push(render(copy.attachmentTextTruncated, { list: textBlock.truncated.join("、") }));
      }
      if (textBlock.omitted.length > 0) {
        extraLimitations.push(render(copy.attachmentTextOmitted, { list: textBlock.omitted.join("、") }));
      }
      const imageAttachments = attachments.filter((item) => item?.kind === "image" && item.ref !== undefined);
      const imagePartsByKey = new Map();
      const skipped = [];
      const receiving = [...answerers, arbiter];
      const seen = new Set();
      for (const entry of receiving) {
        const key = modelKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        if (imageAttachments.length === 0) continue;
        const supports = await resolveImageSupport(this.ctx.llm, entry, run.controller.signal);
        if (supports === false) {
          skipped.push(entry.label ?? entry.modelName ?? entry.model);
          continue;
        }
        imagePartsByKey.set(key, imageAttachments.map((item) => ({ type: "image", attachment: item.ref })));
      }
      if (skipped.length > 0) {
        extraLimitations.push(render(copy.attachmentImagesSkipped, { list: skipped.join("、") }));
      }

      const data = await runDeliberation({
        ctx: this.ctx,
        config: this.config,
        parentAgent,
        provider,
        directory,
        selection: {
          topic: record.topic,
          answerers,
          reviewers,
          arbiter,
          rounds: record.rounds,
          seating: seating.map((assignment) => assignment.entry),
          autoArbiter,
          attachmentText: textBlock.text,
          imagePartsByKey,
          extraLimitations,
        },
        copy,
        signal: run.controller.signal,
        hooks: { emit: (event) => run.emit(event) },
      });
      run.settle(data);
    } catch (error) {
      if (record.status === "cancelled") return;
      if (run.timedOut) {
        run.terminate("failed", render(copy.meetingTimedOut, { ms: this.config.runTimeoutMs }));
        return;
      }
      if (error instanceof MeetingError) {
        run.terminate("failed", error.message);
        return;
      }
      const code = error?.code;
      if (run.controller.signal.aborted || code === "ROUNDTABLE_CANCELLED" || code === "ABORT_ERR" || code === "ASK_ABORTED") {
        run.terminate("cancelled", copy.meetingCancelledNote);
        return;
      }
      run.terminate("failed", shortMessage(error, copy.meetingStartFailed));
    } finally {
      clearTimeout(timer);
      try {
        await run.orchestrator?.dispose();
      } catch {
        // The orchestrator may already be gone with the plugin.
      }
      run.orchestrator = undefined;
    }
  }

  /**
   * Meetings need a live parent Agent for their children. Prefer the session
   * the page came from, else create a hidden orchestrator whose header cwd is
   * the meeting workspace so children inherit that working directory.
   */
  async resolveParentAgent(run) {
    const record = run.record;
    const agents = this.ctx.get?.("agents");
    if (agents?.create === undefined) {
      throw new MeetingError("agents-unavailable", this.copy().agentsUnavailable, 503);
    }
    if (record.sessionId !== undefined) {
      try {
        const live = agents.get?.(record.sessionId);
        if (live !== undefined && live !== null) return live;
      } catch {
        // Fall through to a fresh orchestrator.
      }
    }
    const handle = await agents.create({
      sessionId: randomUUID(),
      meta: { cwd: record.workspace, origin: "subagent" },
    });
    run.orchestrator = handle;
    return handle.agent;
  }

  /** Stop one live run and leave a terminal record behind. */
  cancel(workspacePath, id) {
    const copy = this.copy();
    const run = this.active.get(id);
    // The live run owns the authoritative in-memory record; reading the file
    // would give us a copy that later progress writes silently overwrite.
    const record = run === undefined ? this.read(workspacePath, id, copy) : run.record;
    if (run === undefined) {
      if (!isMeetingTerminal(record.status)) {
        // Not live and not terminal: the reconcile above should have covered
        // this, so treat it as an interrupted leftover.
        record.status = "interrupted";
        record.stage = "interrupted";
        record.endedAt = nowIso();
        this.write(record);
      }
      return meetingDetail(record);
    }
    record.status = "cancelled";
    record.stage = "cancelled";
    record.stageLabel = "cancelled";
    record.endedAt = nowIso();
    record.updatedAt = record.endedAt;
    record.notes = Array.isArray(record.notes) ? record.notes : [];
    if (!record.notes.includes(copy.meetingCancelledNote)) record.notes.push(copy.meetingCancelledNote);
    this.write(record);
    run.controller.abort(new Error(copy.cancelled));
    return meetingDetail(record);
  }

  /** Stop every live run and mark it interrupted: the host is going away. */
  dispose() {
    this.disposed = true;
    const copy = this.copy();
    const pending = [];
    for (const run of this.active.values()) {
      const record = run.record;
      if (!isMeetingTerminal(record.status)) {
        record.status = "interrupted";
        record.stage = "interrupted";
        record.stageLabel = "interrupted";
        record.endedAt = record.endedAt ?? nowIso();
        record.updatedAt = nowIso();
        record.limitations = Array.isArray(record.limitations) ? record.limitations : [];
        if (!record.limitations.includes(copy.meetingInterruptedNote)) {
          record.limitations.push(copy.meetingInterruptedNote);
        }
        this.write(record);
      }
      run.controller.abort(new Error(copy.meetingInterruptedNote));
      if (run.promise !== undefined) pending.push(run.promise);
    }
    this.active.clear();
    return Promise.allSettled(pending);
  }
}

/** Truncate helper kept here so API responses stay bounded. */
export function boundedText(text, limit = 200_000) {
  return truncateText(String(text ?? ""), limit);
}
