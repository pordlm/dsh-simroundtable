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
  LETTERS,
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
  textOfResult,
  truncateText,
} from "./core.js";
import {
  AttachmentError,
  adoptUploads,
  attachmentLimits,
  attachmentTextBlock,
  pruneUploadsThrottled,
  releaseAdoptedUploads,
  resolveImageSupport,
} from "./attachments.js";
import { requireSubagentProvider, runChild, runDeliberation } from "./engine.js";
import { stageIndexOf } from "./stages.js";
import { PersonaStore } from "./personas/store.js";
import { personaBindingOf } from "./personas/schema.js";
import {
  modelRouteKey,
  normalizeParticipant,
  validateParticipants,
} from "./participants.js";
import { renderExport } from "./render.js";
import { ROUNDTABLE_ID } from "./protocols/roundtable-protocol.js";
import { requireRuntimeProtocol } from "./protocols/registry.js";
import { runProtocol } from "./protocols/runner.js";

/** Directory (relative to a workspace root) that owns meeting records. */
export const MEETING_DIRECTORY = ROUNDTABLE_DIR;
const MEETING_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u;

/**
 * Waits between attempts to make a terminal record durable.
 *
 * A terminal write is the only copy of a meeting's real outcome, so it is
 * retried instead of being treated like a progress snapshot. Three waits mean
 * four attempts; a lock held for a fraction of a second or a slow flush is
 * covered, a disk that is truly gone is not worth blocking the event loop for
 * longer. The values are also the test-visible contract: a test that fails
 * `n` writes sees `n` retries.
 */
const TERMINAL_WRITE_BACKOFF_MS = [50, 150, 400];

/**
 * Block the current thread for `ms` milliseconds.
 *
 * Terminal persistence is synchronous on purpose: `settle()`, `terminate()`,
 * `cancel()` and `dispose()` all run outside an async context and must know
 * whether the terminal state is durable *before* the run leaves `active`.
 * `Atomics.wait` sleeps without spinning, and the total wait is bounded by
 * `TERMINAL_WRITE_BACKOFF_MS`.
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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

/**
 * Resolve the workspace a meeting belongs to.
 *
 * Only a workspace the host has registered is accepted: its id, or its
 * registered directory path; nothing means the first registered workspace.
 * An absolute directory the host never registered is rejected with
 * `workspace-not-registered`. The page API takes the workspace from the
 * request, so accepting any writable absolute directory would let a caller
 * make the plugin create `.roundtable`, store attachments, or write exports
 * outside every workspace the user actually opened.
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
  throw badRequest(copy, "workspaceNotRegistered", { path: raw });
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

function parseRefList(value, copy, { dedupe = true } = {}) {
  if (!Array.isArray(value)) throw badRequest(copy, "invalidRequest", { message: "models" });
  const seen = new Set();
  const refs = [];
  for (const item of value) {
    const ref = parseRef(item, copy);
    if (dedupe && seen.has(ref.key)) continue;
    seen.add(ref.key);
    refs.push(ref);
  }
  return refs;
}

function validateRoster(input, copy, config, { dedupe = true } = {}) {
  const answerers = parseRefList(input.answerers, copy, { dedupe });
  if (answerers.length < 2 || answerers.length > 8) throw badRequest(copy, "invalidRoster");
  const reviewers = input.reviewers === undefined
    ? answerers.map((ref) => ({ ...ref }))
    : parseRefList(input.reviewers, copy, { dedupe });
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

/** Languages a meeting may run in. `auto` follows the topic's language. */
const MEETING_LANGUAGES = new Set(["auto", "zh", "en"]);

/**
 * Read the requested output language.
 *
 * Absent means `auto`, so a client that never sent the field keeps working and
 * records written before the language selector existed read back unchanged.
 * Anything outside the three known values is rejected instead of silently
 * turning into `auto`: a typo must not look like a successful choice.
 */
function requestedLanguage(value, copy) {
  if (value === undefined || value === null) return "auto";
  if (typeof value !== "string") throw badRequest(copy, "invalidRequest", { message: "language" });
  const language = value.trim().toLowerCase();
  if (language === "") return "auto";
  if (MEETING_LANGUAGES.has(language)) return language;
  throw badRequest(copy, "invalidRequest", { message: `language: ${value.trim()}` });
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

function stageCountOf(rounds) {
  return rounds > 0 ? 5 : 4;
}

/** v1 request fields expressed as v2 seats (only when no participants are given). */
function seatsFromRoster(roster) {
  const seats = [];
  roster.answerers.forEach((ref, index) => {
    seats.push({ id: `a${index + 1}`, provider: ref.provider, model: ref.model, role: "answerer" });
  });
  roster.reviewers.forEach((ref, index) => {
    seats.push({ id: `r${index + 1}`, provider: ref.provider, model: ref.model, role: "reviewer" });
  });
  if (roster.arbiter !== undefined) {
    seats.push({
      id: "arbiter",
      provider: roster.arbiter.provider,
      model: roster.arbiter.model,
      role: "arbiter",
    });
  }
  return seats;
}

/** Roster slots derived from v2 participants, so the page keeps one shape. */
function rosterFromParticipants(participants) {
  const slot = (seat) => {
    const entry = rosterSlot(seat);
    // v2 seats can duplicate a route key (same model twice), so every slot
    // also carries the seat id; lookups prefer it over the route key.
    const withId = seat.id === undefined ? entry : { ...entry, participantId: seat.id };
    return seat.personaName === undefined ? withId : { ...withId, personaName: seat.personaName };
  };
  const byRole = (role) => participants.filter((seat) => seat.role === role).map(slot);
  const arbiter = participants.find((seat) => seat.role === "arbiter");
  return {
    answerers: byRole("answerer"),
    reviewers: byRole("reviewer"),
    arbiter: arbiter === undefined ? undefined : slot(arbiter),
  };
}

/** Tasks a v2 run will execute: answers, discussion rounds, reviews, arbiter. */
function protocolTaskTotal(participants, rounds) {
  const answerers = participants.filter((seat) => seat.role === "answerer").length;
  const reviewers = participants.filter((seat) => seat.role === "reviewer").length;
  return answerers * (rounds + 1) + reviewers + 1;
}

/** Stage count a v2 run will visit: answering, N discussions, reviewing, deciding. */
function protocolStageCount(rounds) {
  return rounds + 3;
}

/** The trimmed state a v2 record persists between stages (never handles). */
function initialProtocolState(participants, rounds) {
  return {
    stage: "answering",
    stageIndex: 0,
    stageCount: protocolStageCount(rounds),
    seats: participants.length,
    counts: { answers: 0, reviews: 0 },
  };
}

/**
 * Resolve the requested protocol through the registry — the single authority
 * for protocol id, version and enabled state.
 *
 * This runs first in `create()`, before any expensive work (workspace sweep,
 * concurrency budget, upload adoption): a bad protocol declaration is a plain
 * 400 and nothing else happens. Returns undefined for the v1 default, so every
 * existing request path stays untouched.
 *
 * Persona declarations are validated here too: seats carrying a personaId are
 * refused unless the capability is opted in. Declaring v2 without any persona
 * stays legal — v2 is also the seat-based protocol (reviewer synthesis, stage
 * gating), so a persona-less v2 run is a supported request shape, not an error.
 *
 * @returns {{id: string, version: number, protocol: object} | undefined}
 */
function resolveProtocolRequest({ input, config, copy }) {
  const declared = input?.protocol;
  let id;
  let version;
  if (declared !== undefined && declared !== null) {
    id = typeof declared === "string" ? declared : declared?.id;
    version = typeof declared === "object" ? declared?.version : undefined;
  }
  const suppliedParticipants = Array.isArray(input?.participants) && input.participants.length > 0
    ? input.participants
    : undefined;
  // Persona declarations are validated with the protocol resolution, before
  // any expensive work; planV2 re-checks per normalized seat as defense.
  const personaIds = [...new Set(
    (suppliedParticipants ?? []).map((seat) => seat?.personaId).filter((value) => typeof value === "string"),
  )];
  if (personaIds.length > 0 && personaBindingOf(config) !== "opt-in") {
    throw new MeetingError("persona-not-supported", copy.personaNotSupported ?? copy.invalidRequest, 400);
  }
  try {
    if (declared === undefined || declared === null) {
      // No declaration: only a participants payload lifts the request to v2.
      if (suppliedParticipants === undefined) return undefined;
      return requireRuntimeProtocol(ROUNDTABLE_ID, 2);
    }
    // A declared request resolves whatever it named — an unknown id or version
    // is a registry decision, not a meeting-layer string match.
    const resolved = requireRuntimeProtocol(id, version);
    if (resolved.version === 2 || suppliedParticipants !== undefined) {
      // Seats make the request a v2 run even when the declaration omitted the
      // version; a resolved v1 declaration without seats stays v1.
      return resolved.version === 2 ? resolved : requireRuntimeProtocol(resolved.id, 2);
    }
    return undefined;
  } catch (error) {
    if (error && typeof error.code === "string") {
      throw new MeetingError(error.code, error.message, 400);
    }
    throw error;
  }
}

/**
 * Decide whether this request is a v2 run, and if so validate it.
 *
 * v1 is the default: without `participants` or a resolved v2 protocol this
 * returns undefined and every existing request path stays untouched. Persona
 * seats are refused unless the capability is opted in, and an unknown persona
 * is a 400 rather than a silent fallback (a silently persona-less meeting
 * would look like the feature worked).
 */
function planV2({ input, roster, config, personaStore, copy, protocolPlan }) {
  const declaredVersion = protocolPlan?.version === 2 ? 2 : 1;
  const supplied = Array.isArray(input?.participants) && input.participants.length > 0
    ? input.participants
    : undefined;
  if (supplied === undefined && declaredVersion !== 2) return undefined;

  const seats = (supplied ?? seatsFromRoster(roster)).map((raw, index) => normalizeParticipant(raw, raw?.role, index));
  // An empty reviewer list means "the answerers review each other" — the v1
  // default. Synthesize one reviewer seat per answerer; the 8-seat total cap
  // below still applies, so big answerer sets are refused with a 400.
  let reviewerFallback = false;
  if (!seats.some((seat) => seat.role === "reviewer")) {
    const used = new Set(seats.map((seat) => seat.participantId));
    const answererSeats = seats.filter((seat) => seat.role === "answerer");
    let counter = 0;
    for (const seat of answererSeats) {
      let id = `rv-${counter += 1}`;
      while (used.has(id)) id = `rv-${counter += 1}`;
      used.add(id);
      // A fresh id keeps the reviewer seat distinct from its answerer seat
      // even though both share the model route (same-origin by design).
      seats.push(normalizeParticipant(
        { participantId: id, provider: seat.provider, model: seat.model, role: "reviewer" },
        "reviewer",
        seats.length,
      ));
    }
    reviewerFallback = true;
  }
  validateParticipants(seats, undefined, copy);
  const personaIds = [...new Set(seats.map((seat) => seat.personaId).filter((id) => typeof id === "string"))];
  if (personaIds.length > 0 && personaBindingOf(config) !== "opt-in") {
    throw new MeetingError("persona-not-supported", copy.personaNotSupported ?? copy.invalidRequest, 400);
  }
  let snapshots = {};
  if (personaIds.length > 0) {
    snapshots = personaStore.snapshot(personaIds);
    for (const id of personaIds) {
      if (snapshots[id] === undefined) {
        throw new MeetingError("persona-unknown", render(copy.personaUnknown ?? copy.invalidRequest, { id }), 400);
      }
    }
  }
  const participants = seats.map((seat) => {
    // `normalizeParticipant` represents "no persona" as null (the id model
    // keeps the distinction explicit), while the record omits the field.
    const personaId = typeof seat.personaId === "string" ? seat.personaId : undefined;
    return {
      // `normalizeParticipant` names the seat `participantId`; the record keeps
      // the shorter `id` and the protocol layer reads it back as participantId.
      id: seat.participantId ?? seat.id,
      provider: seat.provider,
      model: seat.model,
      role: seat.role,
      // The route key must survive planning: the report's same-origin notes
      // group seats by it, and a dropped key lumps every seat into one group.
      modelRouteKey: seat.modelRouteKey ?? modelRouteKey(seat),
      ...(personaId === undefined
        ? {}
        : { personaId, personaName: snapshots[personaId]?.name }),
    };
  });
  if (!participants.some((seat) => seat.role === "answerer")) throw badRequest(copy, "invalidRoster");
  return { participants, snapshots, version: 2, ...(reviewerFallback ? { reviewerFallback: true } : {}) };
}

/**
 * Reject `promise` as soon as `signal` aborts, without giving up ownership of
 * it: the caller keeps the original promise so a handle that arrives after the
 * abort can still be disposed. A plain `Promise.race` would leave that handle
 * dangling (the host may finish creating an orchestrator nobody can use).
 */
function raceAbort(promise, signal, copy) {
  if (signal.aborted) return Promise.reject(abortFailure(copy));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortFailure(copy));
    };
    const cleanup = () => {
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {
        // A signal from a closed host may reject listener changes.
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function abortFailure(copy) {
  const error = new Error(copy.cancelled);
  error.code = "ABORT_ERR";
  return error;
}

function disposeQuietly(handle) {
  try {
    const result = handle?.dispose?.();
    if (result !== undefined && typeof result.then === "function") result.catch(() => {});
  } catch {
    // Disposal is best effort: the host may already have torn it down.
  }
}

/** One meeting's durable record plus the live run that fills it. */
class MeetingRun {
  constructor(manager, record) {
    this.manager = manager;
    this.record = record;
    this.controller = new AbortController();
    this.timedOut = false;
    this.orchestrator = undefined;
    // Counts host-created orchestrators that arrived after the run gave up on
    // them; the tests assert this so "disposed instead of leaked" is provable.
    this.lateOrchestrators = 0;
    this.promise = undefined;
  }

  write() {
    // The manager swallows disk failures and reports them as `false` (except
    // in strict mode, where it throws): callers that must react to a degraded
    // checkpoint need the boolean, not just the side effect.
    return this.manager.write(this.record);
  }

  emit(event) {
    const record = this.record;
    // A finished run must stay terminal: late progress events from children
    // that are still winding down would otherwise resurrect it (e.g. a
    // timed-out run rewriting its stage label) or rewrite the record that was
    // just made durable with the completed outcome.
    if (isMeetingTerminal(record.status)) return;
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
      case "protocol-state": {
        // v2 checkpoint events used to be dropped by `default`. They carry the
        // trimmed snapshot only: handles and controllers never reach a record.
        record.protocolState = event.state;
        if (typeof event.stageIndex === "number") record.progress.stageIndex = event.stageIndex;
        break;
      }
      case "artifact":
      case "finding":
      case "question":
      case "decision": {
        const list = record[`${event.type}s`];
        if (Array.isArray(list)) {
          list.push({ ...event.entry, at });
          if (list.length > 50) list.shift();
        }
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
    if (isMeetingTerminal(record.status)) return record;
    if (this.timedOut) {
      // The engine degrades stage failures into a fallback answer. A run that
      // hit its deadline is not a completed deliberation: never persist one
      // as such, even if the deadline raced the last stage.
      this.terminate("failed", render(copy.meetingTimedOut, { ms: this.manager.config.runTimeoutMs }));
      return;
    }
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
    // The completed record carries the answers, the review votes and the final
    // answer. A best-effort write here is what used to lose a finished meeting:
    // the disk stayed on the last `running` snapshot, `reconcile()` rewrote it
    // as `interrupted`, and the real result was gone. This write must succeed
    // (or leave a terminal shadow) before the run leaves `active`.
    this.manager.persistTerminal(record);
    return record;
  }

  /** Mark the record failed/interrupted/cancelled exactly once. */
  terminate(status, message, extra = {}) {
    const record = this.record;
    if (isMeetingTerminal(record.status)) {
      // A cancel, a deadline or a finished deliberation already won the race:
      // the first terminal outcome is the real one and must not be rewritten.
      return false;
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
    this.manager.persistTerminal(record);
    return true;
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
    /**
     * Terminal outcomes that could not be written to disk, keyed by
     * `terminalShadowKey(workspace, id)`.
     *
     * A meeting is only allowed to leave `active` once its terminal record is
     * durable. When every retry fails, the record still exists — in memory —
     * and this map is what keeps it real: `reconcile()` reads the shadow before
     * it considers rewriting anything as `interrupted`, and a later successful
     * write heals the file and clears the shadow.
     */
    this.terminalShadow = new Map();
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

  /**
   * Persist one record.
   *
   * A failed write during a run is logged and the meeting keeps going: losing a
   * progress snapshot is better than killing models that are already answering.
   * `strict` is for a new meeting's first write, where a durable record is the
   * precondition for starting anything at all — nothing may burn a model behind
   * a meeting the user cannot find again.
   */
  write(record, { strict = false } = {}) {
    try {
      const path = this.pathOf(record.workspace, record.id);
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      renameSync(temporary, path);
      this.summaries.delete(path);
      return true;
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-simroundtable: could not write meeting record: ${shortMessage(error, "unknown error")}`);
      if (strict) throw error;
      return false;
    }
  }

  terminalShadowKey(workspace, id) {
    const path = resolvePath(workspace);
    return `${process.platform === "win32" ? path.toLowerCase() : path}\u0000${id}`;
  }

  /**
   * Persist a terminal record (completed/failed/cancelled/interrupted) with a
   * strong guarantee: either the file now holds that outcome, or the outcome is
   * kept in memory as a terminal shadow.
   *
   * Losing a terminal record is not like losing a progress snapshot. The disk
   * would still say `running`, `reconcile()` would rewrite it to `interrupted`,
   * and a meeting that actually produced a final answer would come back as a
   * broken one. So this retries (4 attempts, 50/150/400ms backoff) and, if the
   * filesystem stays broken, records the outcome in `terminalShadow` — the
   * caller must then keep the run in `active` until the shadow heals.
   *
   * Deliberately synchronous: the whole point is that the terminal state is
   * decided and recorded before the promise settles.
   *
   * @returns {boolean} true when the record is durable (no shadow needed).
   */
  persistTerminal(record) {
    let lastError;
    for (let attempt = 0; attempt <= TERMINAL_WRITE_BACKOFF_MS.length; attempt += 1) {
      if (attempt > 0) sleepSync(TERMINAL_WRITE_BACKOFF_MS[attempt - 1]);
      try {
        if (this.write(record, { strict: true }) !== false) {
          // A previous terminal write may have left a shadow behind; this one
          // supersedes it, so drop the memory copy and release the run.
          this.forgetTerminalShadow(this.terminalShadowKey(record.workspace, record.id), { release: true });
          return true;
        }
      } catch (error) {
        lastError = error;
      }
    }
    this.keepTerminalShadow(record, lastError);
    return false;
  }

  keepTerminalShadow(record, error) {
    const key = this.terminalShadowKey(record.workspace, record.id);
    const snapshot = structuredClone(record);
    this.terminalShadow.set(key, {
      key,
      id: record.id,
      workspace: record.workspace,
      // The fields `reconcile()` and the routes need are duplicated at the top
      // level so a shadow is inspectable without reading the whole record.
      status: snapshot.status,
      stage: snapshot.stage,
      stageLabel: snapshot.stageLabel,
      endedAt: snapshot.endedAt,
      finalAnswer: snapshot.finalAnswer ?? null,
      record: snapshot,
      attempts: TERMINAL_WRITE_BACKOFF_MS.length + 1,
      error: shortMessage(error, "unknown error"),
      at: nowIso(),
    });
  }

  forgetTerminalShadow(key, { release = false } = {}) {
    const shadow = this.terminalShadow.get(key);
    if (!shadow) return false;
    this.terminalShadow.delete(key);
    if (release) {
      const run = this.active.get(shadow.id);
      // Only release a run this shadow made terminal; a newer live run with the
      // same id (there is none today, but the map is the authority) stays.
      if (run && isMeetingTerminal(run.record.status)) this.active.delete(shadow.id);
    }
    return true;
  }

  /**
   * Try once, without backoff, to turn a shadow into a durable record.
   * Called from `reconcile()` so a later read (a page refresh, `list()`, a
   * restart) repairs the file as soon as the filesystem works again.
   */
  healTerminalShadow(shadow) {
    try {
      if (this.write(shadow.record) === false) return false;
    } catch {
      return false;
    }
    this.forgetTerminalShadow(shadow.key, { release: true });
    return true;
  }

  /**
   * Drop a finished run from `active` — unless its terminal record is still
   * only in the shadow, in which case the run stays (terminal) so that reads
   * keep returning the real outcome instead of a phantom `running` file.
   */
  releaseRun(run) {
    const key = this.terminalShadowKey(run.record.workspace, run.record.id);
    if (this.terminalShadow.has(key)) return false;
    this.active.delete(run.record.id);
    return true;
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
    // Records written before the language selector existed have no `language`
    // field; they read back as `auto`, exactly like a request that omits it.
    if (!MEETING_LANGUAGES.has(parsed.language)) parsed.language = "auto";
    return this.reconcile(parsed, copy);
  }

  /**
   * A record that claims to be running but has no live run belongs to a dead
   * process. Mark it interrupted (and persist that fact) instead of pretending
   * the meeting still progresses.
   *
   * The terminal shadow is checked first: a shadow means the run *did* finish
   * and only the final write failed, so the file's `running` status is stale
   * information and must never be rewritten as `interrupted`.
   */
  reconcile(record, copy) {
    const shadow = this.terminalShadow.get(this.terminalShadowKey(record.workspace, record.id));
    if (shadow) {
      if (isMeetingTerminal(record.status)) {
        // The file was repaired in the meantime (or another reader won the
        // race): the shadow is obsolete.
        this.forgetTerminalShadow(shadow.key, { release: true });
        return record;
      }
      this.healTerminalShadow(shadow);
      return structuredClone(shadow.record);
    }
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

  /**
   * Live runs (queued or running) that belong to one workspace.
   *
   * `maxConcurrentMeetings` is a per-workspace budget, so the global `active`
   * map is filtered here instead of being counted whole. `samePath` keeps
   * Windows separators and drive-letter case from splitting one workspace in
   * two. A run whose record is already terminal (kept only because its
   * terminal write failed) is no longer consuming a model: it must not make the
   * workspace look busy.
   */
  activeIn(workspacePath) {
    let count = 0;
    for (const run of this.active.values()) {
      if (isMeetingTerminal(run.record.status)) continue;
      if (samePath(run.record.workspace, workspacePath)) count += 1;
    }
    return count;
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
    return renderExport(this.read(workspacePath, id, copy), copy).markdown;
  }

  /** One workspace's persona store. Built per call: a store is cheap and the
   * record is the authority, not a cached instance. */
  personasFor(workspacePath) {
    return new PersonaStore({ workspace: workspacePath });
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
    const copy = this.copy();
    const { markdown, filename } = renderExport(this.read(workspacePath, id, copy), copy);
    const directory = join(workspacePath, MEETING_DIRECTORY, "exports");
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
    // Protocol resolution is the first gate, before the workspace sweep, the
    // concurrency budget or upload adoption: a bad protocol declaration is a
    // plain 400 and nothing else happens.
    const protocolPlan = resolveProtocolRequest({ input: input ?? {}, config: this.config, copy });
    // The cap is per workspace (README: 同一工作区并发会议数), so the limit is
    // checked against this workspace's live runs, not the global map: two
    // workspaces each keep their own budget.
    const workspace = resolveWorkspace(this.ctx, input?.workspace, copy).path;
    if (this.activeIn(workspace) >= this.config.maxConcurrentMeetings) {
      throw badRequest(copy, "meetingTooMany", { n: this.config.maxConcurrentMeetings });
    }
    const topic = typeof input?.topic === "string" ? input.topic.trim() : "";
    if (topic === "") throw badRequest(copy, "invalidRequest", { message: copy.invalidTopic });
    if (topic.length > 20_000) throw badRequest(copy, "invalidRequest", { message: "topic" });
    const sessionId = typeof input?.sessionId === "string" && input.sessionId.trim() !== ""
      ? input.sessionId.trim()
      : undefined;
    // A v2 request may name seats instead of the v1 roster slots. Validate a
    // roster derived from those seats so the shared scheduling/progress code
    // still has answerer/reviewer/arbiter counts, while v1 requests pass their
    // own shape through untouched.
    const supplied = Array.isArray(input?.participants) && input.participants.length > 0 ? input.participants : undefined;
    const rosterInput = supplied === undefined
      ? (input ?? {})
      : (() => {
          const answerers = supplied.filter((seat) => seat?.role === "answerer").map((seat) => ({ provider: seat.provider, model: seat.model }));
          const reviewers = supplied.filter((seat) => seat?.role === "reviewer").map((seat) => ({ provider: seat.provider, model: seat.model }));
          const arbiterSeat = supplied.find((seat) => seat?.role === "arbiter");
          return {
            ...input,
            answerers,
            // An empty reviewers list means "the answerers review each other",
            // which is exactly how v1 expresses the default.
            ...(reviewers.length === 0 ? { reviewers: undefined } : { reviewers }),
            arbiter: arbiterSeat === undefined ? undefined : { provider: arbiterSeat.provider, model: arbiterSeat.model },
          };
        })();
    // A v2 seat list is already normalized and may legally repeat a route
    // (same-origin seats); only the free-form v1 roster refs are deduped.
    const roster = validateRoster(rosterInput, copy, this.config, { dedupe: supplied === undefined });
    const language = requestedLanguage(input?.language, copy);
    const v2 = planV2({
      input: input ?? {},
      roster,
      config: this.config,
      personaStore: this.personasFor(workspace),
      copy,
      protocolPlan,
    });

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
    // Starting a meeting is a workspace touch: sweep uploads an abandoned page
    // left behind, without touching the ids this meeting is about to adopt.
    pruneUploadsThrottled({ workspace, config: this.config, keep: uploadIds });
    const attachments = adopted.map((attachment) => ({ ...attachment }));
    const record = {
      version: v2 === undefined ? 1 : 2,
      id,
      topic,
      workspace,
      sessionId,
      language,
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
      ...(v2 === undefined
        ? {}
        : {
            protocol: { id: protocolPlan.id, version: protocolPlan.version, config: { rounds } },
            participants: v2.participants,
            personaSnapshots: v2.snapshots,
            protocolState: initialProtocolState(v2.participants, rounds),
            artifacts: [],
            findings: [],
            questions: [],
            decisions: [],
            finalReport: null,
          }),
      roster: v2 === undefined
        ? {
            answerers: roster.answerers.map((ref) => rosterSlot(ref)),
            reviewers: roster.reviewers.map((ref) => rosterSlot(ref)),
            arbiter: roster.arbiter === undefined ? undefined : rosterSlot(roster.arbiter),
          }
        : rosterFromParticipants(v2.participants),
      progress: {
        ...emptyProgress(),
        total: v2 === undefined
          ? roster.answerers.length + roster.reviewers.length + 1
          : protocolTaskTotal(v2.participants, rounds),
        stageCount: v2 === undefined ? stageCountOf(rounds) : protocolStageCount(rounds),
      },
      transcript: [],
      reviews: [],
      ranking: [],
      answers: [],
      finalAnswer: null,
      failures: [],
      limitations: v2?.reviewerFallback === true ? [copy.reviewerFallbackNote] : [],
      notes: [],
      autoArbiter: roster.arbiter === undefined,
    };

    const run = new MeetingRun(this, record);
    try {
      this.write(record, { strict: true });
    } catch (error) {
      // No durable record, no meeting: starting the engine here would spend
      // models on a run the page can never list, open, or cancel. The adopted
      // attachments go back to the upload area so a retry can reuse them.
      try {
        releaseAdoptedUploads({ workspace, meetingId: id, adopted });
      } catch {
        // Best effort: an abandoned attachment directory is inert.
      }
      throw new MeetingError(
        "meeting-persist-failed",
        render(copy.meetingStartFailed, { message: shortMessage(error, "unknown error") }),
        500,
      );
    }
    this.active.set(id, run);
    const started = v2 === undefined
      ? this.execute(run, roster)
      : this.executeProtocol(run, v2.participants);
    run.promise = started.catch((error) => {
      this.ctx.logger?.warn?.(`dsh-simroundtable: meeting ${id} crashed: ${shortMessage(error, "unknown error")}`);
      run.terminate("failed", shortMessage(error, copy.meetingStartFailed));
    }).finally(() => {
      // Only leave `active` once the terminal record is durable: a run kept
      // alive by a terminal shadow must keep answering reads with its real
      // outcome (`reconcile()` would otherwise call the stale file
      // `interrupted`).
      this.releaseRun(run);
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
          language: record.language ?? "auto",
          answerers,
          reviewers,
          arbiter,
          rounds: record.rounds,
          seating: seating.map((assignment) => assignment.entry),
          autoArbiter,
          // Any attachment turns the answer stage's web capability off; the
          // image-only case has no text to derive this from, so pass it
          // explicitly from the record.
          hasAttachments: attachments.length > 0,
          attachmentText: textBlock.text,
          imagePartsByKey,
          extraLimitations,
        },
        copy,
        signal: run.controller.signal,
        hooks: { emit: (event) => run.emit(event) },
      });
      // `runDeliberation` refuses to finish an aborted run, but this guard is
      // the meeting's own contract: a run that hit its deadline is a failed
      // meeting, never a completed one carrying a degraded answer.
      if (run.timedOut) {
        run.terminate("failed", render(copy.meetingTimedOut, { ms: this.config.runTimeoutMs }));
        return;
      }
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
   * Resolve v2 seats against the live catalog, then drive the protocol runner.
   *
   * The runner owns stage order and budgets; this method owns the only place a
   * child agent is spawned. Every task therefore goes through `runChild`, which
   * keeps the tool policy and the child-plan bookkeeping exactly as they are for
   * the v1 engine.
   */
  async executeProtocol(run, seats) {
    const copy = this.copy();
    const record = run.record;
    record.status = "running";
    record.stage = "answering";
    record.stageLabel = copy.stageAnswer;
    record.startedAt = nowIso();
    record.updatedAt = record.startedAt;
    run.write();

    const timer = setTimeout(() => {
      run.timedOut = true;
      run.controller.abort(new Error(render(copy.meetingTimedOut, { ms: this.config.runTimeoutMs })));
    }, this.config.runTimeoutMs);
    timer.unref?.();

    try {
      // The registry is the single authority for what runs: re-resolve from
      // the record's protocol declaration instead of reaching for the v2
      // module directly, so create and execute can never disagree.
      let runtimeProtocol;
      try {
        runtimeProtocol = requireRuntimeProtocol(record.protocol?.id, record.protocol?.version);
      } catch (error) {
        if (error && typeof error.code === "string") {
          throw new MeetingError(error.code, error.message, 400);
        }
        throw error;
      }
      if (runtimeProtocol.version !== 2) {
        throw new MeetingError("unknown-protocol", copy.unknownProtocol ?? copy.invalidRequest, 400);
      }
      const protocol = runtimeProtocol.protocol;
      const directory = await buildDirectory(this.ctx.llm, {
        signal: run.controller.signal,
        timeoutMs: this.config.catalogTimeoutMs,
        copy,
      });
      if (directory.models.length === 0) throw new MeetingError("no-models", copy.noModels, 503);

      const entries = new Map();
      for (const seat of seats) {
        const entry = findModel(directory, { provider: seat.provider, model: seat.model });
        if (entry === undefined) {
          throw new MeetingError("unknown-models", render(copy.unknownModels, { list: modelRouteKey(seat) }), 400);
        }
        entries.set(seat.id, entry);
      }

      const answererSeats = seats.filter((seat) => seat.role === "answerer");
      const seating = assignAnswerIds(answererSeats.map((seat) => entries.get(seat.id)));
      const anonymousOf = new Map(answererSeats.map((seat, index) => [seat.id, seating[index].id]));
      const slotOf = (seat) => {
        const entry = entries.get(seat.id);
        const slot = rosterSlot(entry, anonymousOf.get(seat.id));
        return seat.personaId === undefined
          ? slot
          : { ...slot, personaId: seat.personaId, personaName: seat.personaName };
      };
      const arbiterSeat = seats.find((seat) => seat.role === "arbiter");
      record.roster = {
        answerers: answererSeats.map(slotOf),
        reviewers: seats.filter((seat) => seat.role === "reviewer").map(slotOf),
        arbiter: arbiterSeat === undefined ? undefined : slotOf(arbiterSeat),
      };
      record.updatedAt = nowIso();
      run.write();

      const provider = requireSubagentProvider(this.ctx, this.config, copy);
      const parentAgent = await this.resolveParentAgent(run);

      const attachments = Array.isArray(record.attachments) ? record.attachments : [];
      const textBlock = attachmentTextBlock(record.workspace, attachments, copy, this.config);
      if (textBlock.truncated.length > 0) {
        record.limitations.push(render(copy.attachmentTextTruncated, { list: textBlock.truncated.join("、") }));
      }
      if (textBlock.omitted.length > 0) {
        record.limitations.push(render(copy.attachmentTextOmitted, { list: textBlock.omitted.join("、") }));
      }
      const imageAttachments = attachments.filter((item) => item?.kind === "image" && item.ref !== undefined);
      const imagePartsByKey = new Map();
      const skipped = [];
      const seen = new Set();
      for (const seat of seats) {
        const entry = entries.get(seat.id);
        const key = modelKey(entry);
        // Only answerers and the arbiter see the images — the same `receiving`
        // set as the v1 engine; reviewers must not receive image parts.
        if (seat.role !== "answerer" && seat.role !== "arbiter") continue;
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
        record.limitations.push(render(copy.attachmentImagesSkipped, { list: skipped.join("、") }));
      }

      const context = {
        topic: record.topic,
        language: record.language ?? "auto",
        participants: seats.map((seat) => ({
          participantId: seat.id,
          provider: seat.provider,
          model: seat.model,
          role: seat.role,
          // Route key + persona id must ride along: the report groups same-origin
          // seats by route, and the composer resolves personas per seat.
          modelRouteKey: modelRouteKey(seat),
          personaId: seat.personaId,
        })),
        personaSnapshots: record.personaSnapshots ?? {},
        attachments,
        attachmentText: textBlock.text,
        imagePartsByKey,
        hasAttachments: attachments.length > 0,
        config: { rounds: record.rounds },
        copy,
      };

      const executeTask = async ({ task, prompt, signal }) => {
        const seat = seats.find((item) => item.id === task.participantId);
        const entry = entries.get(task.participantId);
        const stage = task.stage;
        // The child label names the stage it runs, not always "answer".
        const stageLabel = stage === "review"
          ? copy.stageReview
          : stage === "arbiter"
            ? copy.stageArbiter
            : stage === "discussion"
              ? copy.stageDiscussion
              : copy.stageAnswer;
        const label = `${stageLabel} ${anonymousOf.get(task.participantId) ?? task.participantId} · ${entry.modelName ?? entry.model}`;
        const maxTokens = stage === "review"
          ? this.config.reviewMaxTokens
          : stage === "arbiter"
            ? this.config.arbiterMaxTokens
            : this.config.answerMaxTokens;
        const result = await runChild({
          ctx: this.ctx,
          config: this.config,
          parentAgent,
          provider,
          copy,
          signal,
          stage,
          protocol: ROUNDTABLE_ID,
          hasAttachments: context.hasAttachments,
          stageLabel: label,
          entry,
          prompt,
          // Images ride only with answer and arbiter tasks; reviews and
          // discussions see the anonymized text, never the attachments.
          extraParts: stage === "answer" || stage === "arbiter"
            ? imagePartsByKey.get(modelKey(entry))
            : undefined,
          maxTokens,
          // Structured output needs the provider to advertise the capability,
          // like the v1 engine does; otherwise the child gets plain text.
          outputSchema: provider?.capabilities?.outputSchema
            ? protocol.outputSchema(task)
            : undefined,
        });
        // Same refusal gate as the v1 engine: a refusal is a failed stage with
        // its diagnostic, never an empty answer silently accepted.
        if (result?.stopReason === "refusal") {
          throw new Error(result.diagnostic || copy.emptyAnswer);
        }
        return {
          text: textOfResult(result),
          structured: result?.structured,
          seat: seat?.id,
        };
      };

      let checkpointed = "";
      const result = await runProtocol({
        protocol,
        request: {
          topic: record.topic,
          participants: context.participants,
          personaSnapshots: record.personaSnapshots ?? {},
          config: { rounds: record.rounds },
        },
        context,
        executeTask,
        limits: { participants: { min: 2, max: 8 } },
        signal: run.controller.signal,
        copy,
        checkpoint: async ({ by, stage, state }) => {
          // A checkpoint failure must never kill a healthy meeting: degrade to
          // a limitation and keep running (the run stays recoverable by
          // re-reading its record, never by an aborted protocol). The manager
          // reports a failed write as `false`, so both that and a throw land
          // in the same catch below.
          const degrade = (reason) => {
            if (run.controller.signal.aborted) return;
            // Sticky: once persistence degraded, the field stays even after a
            // later successful write, so the user always knows it happened.
            record.persistence = {
              ...(record.persistence ?? {}),
              degraded: true,
              failedAt: nowIso(),
              lastFailedStage: stage ?? record.stage,
              ...(reason ? { lastError: reason } : {}),
            };
            if (!record.limitations.includes(copy.checkpointDegradedNote)) {
              record.limitations.push(copy.checkpointDegradedNote);
            }
            this.ctx.logger?.warn?.(
              `dsh-simroundtable: meeting ${record.id} checkpoint degraded at ${record.persistence.lastFailedStage}`,
            );
          };
          try {
            if (by === "stage-end") {
              // The full post-stage state is the durable trail: answers and
              // reviews with their text survive an interruption/cancel.
              record.protocolFullState = state;
              record.updatedAt = nowIso();
              if (run.write() === false) degrade("persist-false");
              return;
            }
            if (by !== "stage-start" || stage === checkpointed) return;
            checkpointed = stage;
            record.protocolState = state;
            record.stage = stage;
            record.progress.stageIndex = stageIndexOf(stage, record.rounds);
            record.updatedAt = nowIso();
            if (run.write() === false) degrade("persist-false");
          } catch (error) {
            if (run.controller.signal.aborted) throw error;
            degrade(shortMessage(error, "unknown error"));
          }
        },
      });
      if (run.timedOut) {
        run.terminate("failed", render(copy.meetingTimedOut, { ms: this.config.runTimeoutMs }));
        return;
      }
      this.settleProtocol(run, result);
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

  /** Fold a protocol run's report into the durable v2 record. */
  settleProtocol(run, result) {
    const record = run.record;
    if (isMeetingTerminal(record.status)) return record;
    const copy = this.copy();
    const report = result?.report ?? {};
    const state = result?.state ?? {};
    const participants = record.participants ?? [];
    const answerers = participants.filter((seat) => seat.role === "answerer");

    // Anonymous answer labels, in seat order — the same letters the prompts use.
    const labelOf = new Map(answerers.map((seat, index) => [seat.id, LETTERS[index] ?? `?${index + 1}`]));
    const answerTextOf = (seat) => {
      const stored = state.answers?.[seat.id];
      return typeof stored?.text === "string" ? stored.text : "";
    };
    const answeredSeats = answerers.filter((seat) => answerTextOf(seat).trim() !== "");
    if (answeredSeats.length === 0) {
      // No usable answer and nothing for the arbiter to fall back to: the run
      // is a failure, never a "completed" meeting with an empty report.
      run.terminate("failed", copy.noAnswers);
      return record;
    }

    // Seat → roster slot. Route keys can collide across roles (a reviewer may
    // reuse an answerer's route), so every v2 slot carries its seat id and the
    // route key is only the v1-style fallback.
    const findSlot = (list, seat) => {
      if (seat === undefined) return undefined;
      const slots = Array.isArray(list) ? list : [];
      return slots.find((member) => member.participantId === seat.id)
        ?? slots.find((member) => member.key === modelRouteKey(seat));
    };
    const slotFor = (seat) => {
      if (seat === undefined) return undefined;
      if (seat.role === "reviewer") return findSlot(record.roster.reviewers, seat);
      if (seat.role === "arbiter") return findSlot([record.roster.arbiter], seat);
      return findSlot(record.roster.answerers, seat)
        ?? findSlot(record.roster.reviewers, seat)
        ?? findSlot([record.roster.arbiter], seat);
    };

    record.status = "completed";
    record.stage = "completed";
    record.stageLabel = "completed";
    record.currentRound = record.rounds;
    record.endedAt = nowIso();
    record.progress.completed = record.progress.total;
    record.progress.stageIndex = record.progress.stageCount;
    record.protocolState = result?.snapshot ?? record.protocolState;
    // The full post-stage state is the durable trail for reviews/failures.
    record.protocolFullState = state;
    const ranking = Array.isArray(report.ranking) ? report.ranking : [];
    record.finalReport = {
      markdown: String(report.markdown ?? ""),
      fallback: report.fallback === true,
      incomplete: report.incomplete === true,
      ranking,
      sameRouteNotes: Array.isArray(report.sameRouteNotes) ? report.sameRouteNotes : [],
    };
    record.ranking = ranking;

    const leading = ranking[0]?.answerId !== undefined
      ? answeredSeats.find((seat) => labelOf.get(seat.id) === ranking[0].answerId)
      : undefined;
    const leadingSeat = leading ?? answeredSeats[0];
    const arbiterSeat = participants.find((seat) => seat.id === state.arbiter?.participantId);
    const arbiterSlot = arbiterSeat === undefined
      ? undefined
      : record.roster.arbiter?.key === modelRouteKey(arbiterSeat)
        ? record.roster.arbiter
        : undefined;
    record.finalAnswer = {
      // The report wraps the whole run; the page shows the arbiter's answer, so
      // prefer the protocol's plain answer text and fall back to the report.
      text: typeof report.answerMarkdown === "string" && report.answerMarkdown !== ""
        ? report.answerMarkdown
        : record.finalReport.markdown,
      anonymousId: labelOf.get(leadingSeat?.id),
      authorKey: leadingSeat === undefined ? undefined : modelRouteKey(leadingSeat),
      authorLabel: leadingSeat?.label ?? leadingSeat?.model,
      ...(state.arbiter?.markdown
        ? {
            arbiter: {
              key: arbiterSlot?.key ?? (arbiterSeat === undefined ? undefined : modelRouteKey(arbiterSeat)),
              label: arbiterSlot?.label ?? arbiterSeat?.label ?? arbiterSeat?.model,
              provider: arbiterSeat?.provider,
              model: arbiterSeat?.model,
              text: state.arbiter.markdown,
            },
          }
        : {}),
      // Always a boolean, like the v1 settlement: the page reads it directly.
      fallback: record.finalReport.fallback === true,
      ranking,
    };
    if (record.finalReport.fallback) {
      record.limitations.push(copy.arbiterFallbackNote ?? "Arbiter failed; deterministic report used.");
    }

    // The page still renders `answers`; v2 keeps them as a projection of the
    // protocol state, never as a second source of truth.
    record.answers = answerers.map((seat) => {
      const slot = findSlot(record.roster.answerers, seat);
      const stored = state.answers?.[seat.id] ?? {};
      return {
        anonymousId: labelOf.get(seat.id) ?? slot?.anonymousId,
        actorKey: modelRouteKey(seat),
        participantId: seat.id,
        provider: seat.provider,
        model: seat.model,
        providerName: slot?.providerName,
        modelName: slot?.modelName,
        text: typeof stored.text === "string" ? stored.text : "",
        revised: (typeof stored.round === "number" ? stored.round : 0) > 0,
      };
    });

    // Review rows, in the v1 shape the detail page and export already render.
    // A review is a self-review when the reviewer shares an answerer's route
    // (default peers mode): the route, not the seat, is the identity v1 used.
    const answerRoutes = new Set(answerers.map((seat) => modelRouteKey(seat)));
    const reviewerSeats = participants.filter((seat) => seat.role === "reviewer");
    record.reviews = reviewerSeats.flatMap((seat) => {
      const review = state.reviews?.[seat.id];
      if (review === undefined) return [];
      const slot = findSlot(record.roster.reviewers, seat);
      return [{
        reviewerKey: modelRouteKey(seat),
        reviewerLabel: slot?.label ?? seat.label ?? seat.model ?? seat.id,
        anonymous: true,
        selfReview: review.selfReview === true || answerRoutes.has(modelRouteKey(seat)),
        ranking: (review.ranking ?? []).map((answerId, index) => ({ answerId, averageRank: index + 1 })),
        ...(review.rankingNormalized === true ? { note: copy.rankingNormalizedNote } : {}),
        ...(review.rankingSalvaged === true ? { note: copy.rankingSalvagedNote } : {}),
      }];
    });

    // Failures the runner collected per task (stage, message), v1 shape. The
    // protocol keeps an append-only errorLog so a later success by the same
    // seat does not erase an earlier task-level failure; `state.errors` is
    // only the last-status snapshot and stays as a fallback for old states.
    record.failures = (state.errorLog ?? Object.entries(state.errors ?? {}).map(([participantId, failure]) => ({
      participantId,
      ...failure,
    }))).map((failure) => {
      const participantId = failure.participantId;
      const seat = participants.find((entry) => entry.id === participantId);
      const slot = slotFor(seat);
      return {
        stage: failure.stage,
        entry: slot === undefined && seat === undefined
          ? undefined
          : {
              key: slot?.key ?? modelRouteKey(seat),
              provider: seat?.provider,
              providerName: slot?.providerName ?? seat?.providerName,
              model: seat?.model,
              modelName: slot?.modelName ?? seat?.modelName,
              label: slot?.label ?? seat?.label ?? seat?.model ?? participantId,
            },
        message: failure.error,
        at: failure.at ?? record.endedAt,
        participantId,
      };
    });

    // Roster members end the run with a terminal status; the page derives
    // progress from `status`, so a settled record must not stay "pending".
    const settleMembers = (seats) => {
      for (const seat of seats) {
        const slot = slotFor(seat);
        if (slot === undefined) continue;
        const status = state.seatStatus?.[seat.id];
        if (status === "ok") {
          slot.status = "done";
        } else if (status !== undefined) {
          slot.status = "failed";
          slot.error = state.errors?.[seat.id]?.error;
        }
      }
    };
    settleMembers(participants);

    // A compact transcript so an interrupted/completed run stays readable in
    // the same shape the v1 engine emits.
    const titleFor = (stage, round) => stage === "discussion"
      ? render(copy.stageDiscussionRound, { round, total: record.rounds })
      : stage === "answer"
        ? copy.stageAnswer
        : stage === "review"
          ? copy.stageReview
          : copy.stageArbiter;
    record.transcript = [];
    for (const seat of answerers) {
      const text = answerTextOf(seat);
      if (text.trim() === "") continue;
      const slot = findSlot(record.roster.answerers, seat);
      record.transcript.push({
        stage: "answering",
        role: "answerer",
        actorKey: modelRouteKey(seat),
        anonymousId: labelOf.get(seat.id),
        title: copy.stageAnswer,
        text: truncateText(text, 8000),
        at: record.endedAt,
        ...((slot === undefined ? {} : { label: slot.label })),
      });
    }
    for (const seat of reviewerSeats) {
      const review = state.reviews?.[seat.id];
      if (review === undefined) continue;
      const slot = findSlot(record.roster.reviewers, seat);
      record.transcript.push({
        stage: "reviewing",
        role: "reviewer",
        actorKey: modelRouteKey(seat),
        title: copy.stageReview,
        text: truncateText(JSON.stringify({ ranking: review.ranking ?? [] }), 2000),
        at: record.endedAt,
        ...(slot === undefined ? {} : { label: slot.label }),
      });
    }
    if (state.arbiter?.markdown) {
      record.transcript.push({
        stage: "deciding",
        role: "arbiter",
        actorKey: arbiterSlot?.key ?? (arbiterSeat === undefined ? undefined : modelRouteKey(arbiterSeat)),
        title: copy.stageArbiter,
        text: truncateText(state.arbiter.markdown, 8000),
        at: record.endedAt,
        ...(arbiterSlot === undefined ? {} : { label: arbiterSlot.label }),
      });
    }
    record.transcript = record.transcript.map((entry, index) => ({ seq: index + 1, ...entry }));

    record.updatedAt = record.endedAt;
    // Terminal settlement goes through persistTerminal, like the v1 settle:
    // the write must succeed or leave a durable shadow behind.
    this.persistTerminal(record);
  }

  /**
   * Meetings need a live parent Agent for their children. Prefer the session
   * the page came from, else create a hidden orchestrator whose header cwd is
   * the meeting workspace so children inherit that working directory.
   */
  async resolveParentAgent(run) {
    const record = run.record;
    const copy = this.copy();
    const agents = this.ctx.get?.("agents");
    if (agents?.create === undefined) {
      throw new MeetingError("agents-unavailable", copy.agentsUnavailable, 503);
    }
    if (record.sessionId !== undefined) {
      try {
        const live = agents.get?.(record.sessionId);
        if (live !== undefined && live !== null) return live;
      } catch {
        // Fall through to a fresh orchestrator.
      }
    }
    // The run's deadline/cancel must also bound the host call that creates the
    // hidden orchestrator: `agents.create()` can hang on a broken provider, and
    // a bare `await` here would keep `execute()` alive past runTimeoutMs and
    // hold a concurrency slot forever.
    const creating = agents.create({
      sessionId: randomUUID(),
      meta: { cwd: record.workspace, origin: "subagent" },
    });
    let abandoned = false;
    // Ownership survives the abort: if the handle only arrives after the run is
    // gone, dispose it here instead of leaking an orchestrator. The signal (not
    // just `abandoned`) decides, because the create promise and the abort can
    // settle in the same microtask batch: a `then` queued before the `await`
    // catch would still see `abandoned === false` and skip the dispose.
    creating.then(
      (late) => {
        if (!abandoned && !run.controller.signal.aborted) return;
        disposeQuietly(late);
        run.lateOrchestrators += 1;
      },
      () => {
        // A create that rejects after the abort has nothing to clean up.
      },
    );
    let handle;
    try {
      handle = await raceAbort(creating, run.controller.signal, copy);
    } catch (error) {
      abandoned = true;
      throw error;
    }
    run.orchestrator = handle;
    return handle.agent;
  }

  /** Stop one live run and leave a terminal record behind. */
  cancel(workspacePath, id) {
    const copy = this.copy();
    const run = this.active.get(id);
    // The active map is keyed by id only, so a live run must prove it belongs
    // to the workspace the caller is asking about. Otherwise one workspace
    // could stop another workspace's meeting through a guessed id: report the
    // same 404 a foreign on-disk record would produce and touch nothing.
    if (run !== undefined && !samePath(run.record.workspace, workspacePath)) {
      throw new MeetingError("meeting-not-found", render(copy.meetingNotFound, { id }), 404);
    }
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
    if (isMeetingTerminal(record.status)) {
      // The run already finished (or was already cancelled) and may be kept
      // alive only by its terminal shadow; a late cancel must not rewrite a
      // `completed` record as `cancelled`.
      return meetingDetail(record);
    }
    record.status = "cancelled";
    record.stage = "cancelled";
    record.stageLabel = "cancelled";
    record.endedAt = nowIso();
    record.updatedAt = record.endedAt;
    record.notes = Array.isArray(record.notes) ? record.notes : [];
    if (!record.notes.includes(copy.meetingCancelledNote)) record.notes.push(copy.meetingCancelledNote);
    // Same strong guarantee as settle/terminate: the cancel is only real once
    // it is durable, so a broken filesystem leaves a terminal shadow behind.
    this.persistTerminal(record);
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
        // Interrupted is terminal too: a shutdown during a broken filesystem
        // must not leave a `running` file that a restart reads as interrupted
        // while the children are still being aborted.
        this.persistTerminal(record);
      }
      run.controller.abort(new Error(copy.meetingInterruptedNote));
      if (run.promise !== undefined) pending.push(run.promise);
    }
    // Last chance for the shadows: one write each, no backoff. Whatever still
    // cannot be written stays in memory, where `reconcile()` keeps serving the
    // real terminal outcome for as long as this manager lives — and its run
    // stays in `active`, because "durable before released" has not happened yet.
    for (const shadow of [...this.terminalShadow.values()]) this.healTerminalShadow(shadow);
    for (const [id, run] of [...this.active]) {
      const key = this.terminalShadowKey(run.record.workspace, run.record.id ?? id);
      if (!this.terminalShadow.has(key)) this.active.delete(id);
    }
    return Promise.allSettled(pending);
  }
}

/** Truncate helper kept here so API responses stay bounded. */
export function boundedText(text, limit = 200_000) {
  return truncateText(String(text ?? ""), limit);
}
