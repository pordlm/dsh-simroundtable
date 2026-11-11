// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Roundtable execution engine.
 *
 * One entry point — {@link runDeliberation} — drives the whole chain used by
 * the slash command, the model-facing tool, and the meeting page:
 *
 *   independent answers → optional peer-revision rounds → anonymous reviews →
 *   final arbiter (with a ranked-answer fallback).
 *
 * Every participant is a fresh child Agent spawned through the subagent
 * provider with an explicit `{ provider, model }` route, so one table can mix
 * models from any registered provider.
 *
 * The engine owns no UI and no persistence: progress is reported through an
 * optional `hooks.emit(event)` callback and the caller folds the returned data
 * into its own record. That keeps the meeting page's live progress and the
 * command's one-shot result on exactly the same execution path.
 */

import { randomUUID } from "node:crypto";
import {
  LETTERS,
  WEB_TOOLS,
  aggregateRankings,
  assignAnswerIds,
  extractJson,
  mapLimit,
  normalizeArbiter,
  normalizeReview,
  nowIso,
  render,
  salvageRanking,
  shortMessage,
  textOfResult,
  truncateText,
  uniqueStrings,
  withDeadline,
} from "./core.js";
import {
  ARBITER_SCHEMA,
  REVIEW_SCHEMA,
  answerPrompt,
  arbiterPlainPrompt,
  arbiterPrompt,
  discussionPrompt,
  reviewPrompt,
  reviewRankingPrompt,
} from "./prompts.js";

/**
 * Per-activation tool plans, keyed by the pre-minted child id.
 *
 * The global `agent/created` listener reads this map to attach the web-only
 * allow-list before the child can take a step. Exported so the plugin's
 * lifecycle hooks and the engine share one registry.
 *
 * A plan is `pending` until the listener applies the policy, then `applied`.
 * A run that gives up on a child (deadline, cancellation, spawn failure) marks
 * its plan `revoked` and leaves it as a tombstone for at least the activation
 * deadline: creation is asynchronous, so a handle can still arrive afterwards,
 * and a missing plan must never mean "no restriction" for a child of ours.
 * Revoking also records the id in `refusedChildren`, which outlives the
 * tombstone, so the listener can still tell "this child was refused" apart from
 * "not ours" until that activation is known to be over.
 */
export const childPlans = new Map();

/**
 * The four roundtable stages, and the web capability each one is allowed.
 *
 * | stage      | web tools                                    |
 * | ---------- | -------------------------------------------- |
 * | answer     | yes, but only when the meeting has no attachment |
 * | discussion | no                                           |
 * | review     | no (structured output only)                  |
 * | arbiter    | no (structured output only)                  |
 *
 * The answer stage keeps the historical two-lookup budget for a topic-only
 * meeting. A meeting that carries an attachment already has its evidence on the
 * table and must not mix it with fresh network results; every later stage works
 * from material that is already quoted, so it gets no network at all. This is a
 * capability fact, not prompt advice: {@link runChild} stores it on the plan and
 * the `agent/created` listener turns it into the child's allow-list.
 */
export const CHILD_STAGE = Object.freeze({
  answer: "answer",
  discussion: "discussion",
  review: "review",
  arbiter: "arbiter",
});

/** Web tools one stage may see; unknown stages fall back to none (fail-closed). */
export function webToolsForStage(stage, hasAttachments) {
  if (stage !== CHILD_STAGE.answer) return [];
  return hasAttachments === true ? [] : WEB_TOOLS;
}

/** Fallback tombstone window; a plan also carries the run's own deadline. */
const REVOKED_PLAN_TTL_MS = 5 * 60_000;

/**
 * Child ids whose plan is gone but whose activation may still land.
 *
 * An entry means "a creation for this id must be refused". Entries are added
 * when a plan is revoked while its activation is still unresolved, and removed
 * only once that activation is known to be over (handle disposed, spawn
 * rejected, or the child was disposed) — see `settleRefusedChild`.
 *
 * There is deliberately no size cap: evicting an id whose activation can still
 * arrive would let that creation run with no restriction at all. The map is
 * therefore bounded by activations that never settle (a hung provider), not by
 * the number of roundtables, because a settled activation always leaves it.
 */
const refusedChildren = new Map();

/** True when this child id was started by the roundtable but is no longer allowed. */
export function isRefusedChild(childId) {
  return refusedChildren.has(childId);
}

function rememberRefusedChild(childId) {
  if (!refusedChildren.has(childId)) refusedChildren.set(childId, Date.now());
}

/**
 * Release a child id once its activation is definitely over.
 *
 * Called after the handle was disposed, after a spawn was rejected, and when the
 * child is disposed. Until one of those happens the id stays refused, so a late
 * creation can never slip through on a stale or expired plan.
 */
export function settleRefusedChild(childId) {
  refusedChildren.delete(childId);
}

/** Live child activations, so disposal can cancel them all. */
export const activeHandles = new Set();

/**
 * Forget one child plan and its tombstone timer.
 *
 * Called when the child is gone (disposed, restricted and finished) or when a
 * revoked plan has already refused a late creation. The refusal marker is not
 * touched here: it is owned by the activation lifecycle, so dropping a plan can
 * never re-open the "creation without a policy" path.
 */
export function retireChildPlan(childId) {
  const plan = childPlans.get(childId);
  if (plan === undefined) return;
  if (plan.timer !== undefined) {
    clearTimeout(plan.timer);
    plan.timer = undefined;
  }
  // The restriction and guard live in the child's tool layer; drop them with
  // the plan so a long-lived process does not accumulate dead effects.
  for (const dispose of plan.disposers ?? []) {
    try {
      dispose();
    } catch {
      // Teardown is best effort; the child is already gone or being refused.
    }
  }
  plan.disposers = undefined;
  childPlans.delete(childId);
}

/**
 * Drop a revoked plan once its tombstone window has passed.
 *
 * Only the plan object is released; the refusal marker stays until the
 * activation settles, so an even later creation is still refused. Shared by the
 * tombstone timer and the tests that simulate an expired TTL.
 */
export function expireChildPlanTombstone(childId) {
  const plan = childPlans.get(childId);
  if (plan === undefined || plan.state !== "revoked") return;
  retireChildPlan(childId);
}

/**
 * Keep a child from running after its run gave up on it.
 *
 * The plan becomes a revoked tombstone until the TTL expires: a late
 * `agent/created` then fails the creation instead of running an unrestricted
 * child, and a child that already received its policy keeps the guard until it
 * is disposed (the tombstone is cleared by `agent/disposed`).
 *
 * The refusal marker outlives the tombstone because it is tied to the
 * activation, not to the plan: it is only released once the activation is known
 * to be over (handle disposed or spawn rejected). A child whose policy was
 * already applied cannot be created again, so its plan is simply retired.
 */
export function revokeChildPlan(childId, reason) {
  const plan = childPlans.get(childId);
  if (plan === undefined) return;
  if (plan.state === "applied") {
    retireChildPlan(childId);
    return;
  }
  plan.state = "revoked";
  plan.reason = reason;
  rememberRefusedChild(childId);
  if (plan.timer === undefined) {
    const timer = setTimeout(() => {
      expireChildPlanTombstone(childId);
    }, plan.tombstoneMs ?? REVOKED_PLAN_TTL_MS);
    timer.unref?.();
    plan.timer = timer;
  }
}

/** Dispose one abandoned child handle without letting disposal errors escape. */
async function disposeHandle(handle) {
  try {
    await handle?.dispose?.();
  } catch {
    // Disposal is best-effort; the run has already given up on this child.
  }
}

/** Report one progress event without ever failing the run over bookkeeping. */
function emit(hooks, event) {
  if (hooks === undefined || hooks === null) return;
  try {
    hooks.emit?.(event);
  } catch {
    // Progress is best-effort; the roundtable itself must keep going.
  }
}

/** Resolve the configured subagent provider, or explain why it cannot be used. */
export function requireSubagentProvider(ctx, config, copy) {
  const provider = ctx.subagents.getProvider(config.subagentProvider);
  if (provider === undefined) {
    throw new Error(render(copy.providerMissing, { provider: config.subagentProvider }));
  }
  if (provider.inheritsParentContext) {
    throw new Error(render(copy.providerInherits, { provider: config.subagentProvider }));
  }
  if (!provider.capabilities.agentOptions) {
    throw new Error(render(copy.providerNoAgentOptions, { provider: config.subagentProvider }));
  }
  return provider;
}

/**
 * Spawn one fresh child and wait for its terminal result.
 *
 * The pre-minted child id is the restriction key: the global `agent/created`
 * listener attaches the stage's allow-list before the child can take a step.
 * `stage` is required by every in-tree caller; omitting it is treated as a
 * stage with no web capability (fail-closed).
 */
export async function runChild({
  ctx,
  config,
  parentAgent,
  provider,
  copy,
  signal,
  stage,
  hasAttachments,
  stageLabel,
  entry,
  prompt,
  extraParts,
  maxTokens,
  outputSchema,
}) {
  const childId = randomUUID();
  const webTools = webToolsForStage(stage, hasAttachments);
  const plan = {
    allowed: new Set(),
    outputSchema: outputSchema !== undefined,
    copy,
    // The guard's denial message describes this stage's actual policy instead
    // of the historical "web only" wording.
    toolDenied: webTools.length > 0
      ? copy.toolDenied
      : stage === CHILD_STAGE.answer
        ? (copy.toolDeniedAttachments ?? copy.toolDenied)
        : (copy.toolDeniedStage ?? copy.toolDenied),
    stage,
    webTools,
    state: "pending",
    reason: undefined,
    timer: undefined,
    disposers: undefined,
    // A tombstone must outlive the activation it protects: the run itself gives
    // up after `childTimeoutMs`, but the handle it started can still arrive
    // afterwards, and that creation must be refused rather than slip through.
    tombstoneMs: Math.max(REVOKED_PLAN_TTL_MS, config.childTimeoutMs),
  };
  childPlans.set(childId, plan);

  // Creation is asynchronous, so the activation promise is kept outside the
  // deadline race: a handle can still arrive after this run gave up on the
  // child, and then this is the only owner left that can dispose it.
  const activate = (childSignal) => {
    let started;
    try {
      started = ctx.subagents.startActivation({
        provider: config.subagentProvider,
        label: stageLabel.slice(0, 120),
        childId,
        delivery: "caller",
        signal: childSignal,
        request: {
          parent: parentAgent,
          prompt: [{ type: "text", text: prompt }, ...(Array.isArray(extraParts) ? extraParts : [])],
          agentOptions: { provider: entry.provider, model: entry.model, maxTokens },
          ...(provider.capabilities.depthLimit ? { maxDepth: 1 } : {}),
          ...(outputSchema !== undefined ? { outputSchema } : {}),
        },
      });
    } catch (error) {
      // The provider refused synchronously; no child exists and none can.
      retireChildPlan(childId);
      settleRefusedChild(childId);
      throw error;
    }
    return started;
  };

  let done = false;
  try {
    const result = await withDeadline(
      signal,
      config.childTimeoutMs,
      render(copy.childTimedOut, { ms: config.childTimeoutMs }),
      async (childSignal) => {
        let handle;
        try {
          handle = await activate(childSignal);
        } catch (error) {
          // The activation itself failed: no child exists, so this id can never
          // need refusing again.
          retireChildPlan(childId);
          settleRefusedChild(childId);
          throw error;
        }

        activeHandles.add(handle);
        // Cancelling and finishing can both land on the same handle; dispose
        // it once and let every caller await that one disposal.
        let disposal;
        const disposeOnce = () => {
          disposal ??= disposeHandle(handle);
          return disposal;
        };
        const onAbort = () => {
          void disposeOnce();
        };
        childSignal.addEventListener("abort", onAbort, { once: true });

        // The deadline (or a cancel) may have fired while this activation was
        // still being created, and the plan may already be revoked. Such a
        // child must never take a step: dispose it and leave.
        if (plan.state === "revoked" || childSignal.aborted) {
          childSignal.removeEventListener("abort", onAbort);
          activeHandles.delete(handle);
          retireChildPlan(childId);
          await disposeOnce();
          // The handle is disposed, so this activation is over: the id no longer
          // needs to be refused (it can never be created again).
          settleRefusedChild(childId);
          const error = new Error(render(copy.childTimedOut, { ms: config.childTimeoutMs }));
          error.code = "ROUNDTABLE_CHILD_LATE";
          throw error;
        }

        try {
          return await handle.result;
        } finally {
          childSignal.removeEventListener("abort", onAbort);
          activeHandles.delete(handle);
          await disposeOnce();
          settleRefusedChild(childId);
        }
      },
    );
    done = true;
    return result;
  } catch (error) {
    // Fail-closed: anything that stops this child also stops a late creation
    // of it, so a straggling activation can never run without a restriction.
    revokeChildPlan(childId, error);
    throw error;
  } finally {
    if (done) retireChildPlan(childId);
  }
}

/** One structured failure entry, shared by every stage. */
export function stageFailure(stage, entry, error, copy) {
  return {
    stage,
    entry,
    message: shortMessage(error, copy.emptyOutput),
  };
}

/**
 * Refuse to keep working once the whole-run signal is aborted.
 *
 * A single stage failure is normally degraded (a missing review, a fallback
 * final answer), but a run-wide abort — the run deadline, a user cancel, plugin
 * disposal — must never be assembled into a completed deliberation. Checking
 * at stage boundaries stops the engine from spending more child calls and from
 * returning degraded data that the caller would persist as a success.
 */
function throwIfRunAborted(signal, copy) {
  if (signal === undefined || signal === null || signal.aborted !== true) return;
  const reason = signal.reason;
  const error = reason instanceof Error
    ? reason
    : new Error(shortMessage(reason, copy.cancelled));
  if (typeof error.code !== "string" && Object.isExtensible(error)) {
    error.code = "ROUNDTABLE_CANCELLED";
  }
  throw error;
}

/** One reviewer's ranking rendered as plain Markdown for the transcript. */
function reviewTranscriptText(review) {
  const lines = [];
  for (const answerId of review.ranking) {
    lines.push(`- ${answerId}`);
  }
  return lines.join("\n");
}

/**
 * Run the full chain for one fixed roster.
 *
 * @param selection - `{ topic, answerers, reviewers, arbiter, rounds, language }`;
 *   an optional `seating` array may pin the anonymized order (used by tests and
 *   by callers that want to preserve a page-side preview). `language` pins the
 *   output language for every stage: `auto` (or missing) follows the topic,
 *   `zh`/`en` force that language.
 * @param hooks - optional `{ emit(event) }` progress sink.
 * @returns the complete result data consumed by `formatResult`/meeting records.
 */
export async function runDeliberation({
  ctx,
  config,
  parentAgent,
  provider,
  directory,
  selection,
  copy,
  signal,
  hooks,
}) {
  const failures = [...directory.failures];
  const notes = [];
  const limitations = [];
  const assignments = Array.isArray(selection.seating) && selection.seating.length > 0
    ? selection.seating.map((entry, index) => ({ id: LETTERS[index], entry }))
    : assignAnswerIds(selection.answerers);
  const limit = config.maxConcurrentChildren;
  const answererKeys = new Set(assignments.map((assignment) => assignment.entry.key));

  // Attachment presence decides the answer stage's web capability. The meeting
  // page passes the explicit flag (it knows about image-only attachments);
  // deriving it from the two payloads keeps direct callers — and the command /
  // tool path, which has no attachments — correct without a new option.
  const hasAttachments = selection.hasAttachments === true
    || (typeof selection.attachmentText === "string" && selection.attachmentText.trim() !== "")
    || (selection.imagePartsByKey instanceof Map && selection.imagePartsByKey.size > 0);

  throwIfRunAborted(signal, copy);
  emit(hooks, { type: "stage", stage: "answering", stageLabel: copy.stageAnswer, at: nowIso() });

  const answerOutcomes = await mapLimit(assignments, limit, async (assignment) => {
    emit(hooks, {
      type: "member",
      role: "answerer",
      key: assignment.entry.key,
      anonymousId: assignment.id,
      status: "running",
      stage: "answering",
      at: nowIso(),
    });
    try {
      const result = await runChild({
        ctx,
        config,
        parentAgent,
        provider,
        copy,
        signal,
        stage: CHILD_STAGE.answer,
        hasAttachments,
        stageLabel: `${copy.stageAnswer} ${assignment.id} · ${assignment.entry.modelName}`,
        entry: assignment.entry,
        prompt: answerPrompt(selection.topic, selection.attachmentText, selection.language, {
          web: !hasAttachments,
        }),
        extraParts: selection.imagePartsByKey?.get(assignment.entry.key),
        maxTokens: config.answerMaxTokens,
        outputSchema: undefined,
      });
      const text = textOfResult(result);
      if (result.stopReason === "refusal") throw new Error(result.diagnostic || copy.emptyAnswer);
      if (text === "") throw new Error(result.diagnostic || copy.emptyAnswer);
      emit(hooks, {
        type: "member",
        role: "answerer",
        key: assignment.entry.key,
        anonymousId: assignment.id,
        status: "done",
        stage: "answering",
        at: nowIso(),
      });
      emit(hooks, {
        type: "transcript",
        entry: {
          stage: "answering",
          role: "answerer",
          actorKey: assignment.entry.key,
          anonymousId: assignment.id,
          title: copy.stageAnswer,
          text,
          at: nowIso(),
        },
      });
      return {
        id: assignment.id,
        entry: assignment.entry,
        text,
        revised: 0,
        stopReason: result.stopReason,
      };
    } catch (error) {
      const failure = stageFailure(copy.stageAnswer, assignment.entry, error, copy);
      failures.push(failure);
      emit(hooks, {
        type: "member",
        role: "answerer",
        key: assignment.entry.key,
        anonymousId: assignment.id,
        status: "failed",
        stage: "answering",
        error: failure.message,
        at: nowIso(),
      });
      emit(hooks, { type: "failure", failure, at: nowIso() });
      return undefined;
    }
  });
  const answers = answerOutcomes
    .filter((outcome) => outcome.status === "fulfilled" && outcome.value !== undefined)
    .map((outcome) => outcome.value);

  // The deadline may have expired while the panel was answering; fail the run
  // instead of reporting the surviving answers as a usable deliberation.
  throwIfRunAborted(signal, copy);
  if (answers.length === 0) throw new Error(copy.noAnswers);

  let roundsRun = 0;
  if (selection.rounds > 0) {
    if (answers.length < 2) {
      notes.push(copy.discussionSkipped);
    } else {
      for (let round = 1; round <= selection.rounds; round += 1) {
        emit(hooks, {
          type: "stage",
          stage: "discussing",
          stageLabel: render(copy.stageDiscussionRound, { round, total: selection.rounds }),
          round,
          currentRound: round,
          at: nowIso(),
        });
        const current = answers.map((answer) => ({
          id: answer.id,
          text: truncateText(answer.text, config.stageInputChars),
        }));
        const revisions = await mapLimit(answers, limit, async (answer) => {
          try {
            const result = await runChild({
              ctx,
              config,
              parentAgent,
              provider,
              copy,
              signal,
              stage: CHILD_STAGE.discussion,
              stageLabel: `${copy.stageDiscussion} ${answer.id} · ${answer.entry.modelName}`,
              entry: answer.entry,
              prompt: discussionPrompt(selection.topic, current, selection.language),
              maxTokens: config.answerMaxTokens,
              outputSchema: undefined,
            });
            const text = textOfResult(result);
            if (text === "") throw new Error(result.diagnostic || copy.emptyAnswer);
            emit(hooks, {
              type: "transcript",
              entry: {
                stage: "discussing",
                round,
                role: "answerer",
                actorKey: answer.entry.key,
                anonymousId: answer.id,
                title: render(copy.stageDiscussionRoundShort, { round }),
                text,
                at: nowIso(),
              },
            });
            return text;
          } catch (error) {
            const failure = stageFailure(copy.stageDiscussion, answer.entry, error, copy);
            failures.push(failure);
            emit(hooks, { type: "failure", failure, at: nowIso() });
            return undefined;
          }
        });
        let changed = false;
        revisions.forEach((outcome, index) => {
          if (outcome.status !== "fulfilled") return;
          if (typeof outcome.value !== "string" || outcome.value === "") return;
          answers[index].text = outcome.value;
          answers[index].revised += 1;
          changed = true;
        });
        if (changed) roundsRun = round;
        if (!changed) break;
      }
    }
  }

  // Same rule between stages: an aborted run must not move on to reviews.
  throwIfRunAborted(signal, copy);

  if (answers.some((answer) => answer.text.length > config.maxAnswerChars)) {
    notes.push(render(copy.truncatedNote, { n: config.maxAnswerChars }));
  }

  const answerIds = answers.map((answer) => answer.id);
  const answererOf = new Map(answers.map((answer) => [answer.id, answer]));
  const renderedAnswers = answers.map((answer) => ({
    id: answer.id,
    text: truncateText(answer.text, config.stageInputChars),
  }));
  emit(hooks, { type: "stage", stage: "reviewing", stageLabel: copy.stageReview, at: nowIso() });
  // Reasoning-heavy reviewers habitually spend the whole completion budget on
  // private deliberation, so a review can arrive empty or cut in half. Both
  // attempts return `{ value }` (full report) or `{ ranking }` (recovered vote);
  // the compact retry asks only for the vote.
  const reviewAttempt = async (entry, prompt, structured) => {
    const result = await runChild({
      ctx,
      config,
      parentAgent,
      provider,
      copy,
      signal,
      stage: CHILD_STAGE.review,
      stageLabel: `${copy.stageReview} · ${entry.modelName}`,
      entry,
      prompt,
      maxTokens: config.reviewMaxTokens,
      outputSchema: structured && provider.capabilities.outputSchema ? REVIEW_SCHEMA : undefined,
    });
    let value = result.structured;
    if (value === undefined) value = extractJson(textOfResult(result));
    if (value !== undefined) return { value };
    return { ranking: salvageRanking(textOfResult(result), answerIds) };
  };
  const reviewOutcomes = await mapLimit(selection.reviewers, limit, async (entry) => {
    emit(hooks, {
      type: "member",
      role: "reviewer",
      key: entry.key,
      status: "running",
      stage: "reviewing",
      at: nowIso(),
    });
    try {
      let attempt = await reviewAttempt(
        entry,
        reviewPrompt(selection.topic, renderedAnswers, selection.language),
        true,
      );
      let compact = false;
      if (attempt.value === undefined && attempt.ranking === undefined) {
        compact = true;
        attempt = await reviewAttempt(
          entry,
          reviewRankingPrompt(selection.topic, renderedAnswers, selection.language),
          false,
        );
      }
      let review;
      const base = {
        entry,
        reviewerKey: entry.key,
        reviewerLabel: entry.label,
        selfReview: answererKeys.has(entry.key),
      };
      if (attempt.value !== undefined) {
        review = {
          ...base,
          ...normalizeReview(attempt.value, answerIds),
          ...(compact ? { rankingCompact: true } : {}),
        };
      } else if (attempt.ranking !== undefined) {
        // A reviewer that ran into the completion limit leaves an unterminated
        // object; keep its vote when the ranking survived the cut.
        review = {
          ...base,
          evaluations: [],
          consensus: [],
          contradictions: [],
          coverageGaps: [],
          uniqueInsights: [],
          blindSpots: [],
          ranking: attempt.ranking,
          rankingNormalized: true,
          rankingSalvaged: true,
          ...(compact ? { rankingCompact: true } : {}),
        };
      } else {
        throw new Error(copy.reviewInvalid);
      }
      emit(hooks, {
        type: "member",
        role: "reviewer",
        key: entry.key,
        status: "done",
        stage: "reviewing",
        at: nowIso(),
      });
      emit(hooks, {
        type: "review",
        review: {
          reviewerKey: review.reviewerKey,
          reviewerLabel: review.reviewerLabel,
          selfReview: review.selfReview,
          ranking: review.ranking,
          note: review.rankingCompact
            ? copy.reviewCompactNote
            : review.rankingSalvaged
              ? copy.rankingSalvagedNote
              : review.rankingNormalized
                ? copy.rankingNormalizedNote
                : undefined,
          at: nowIso(),
        },
      });
      emit(hooks, {
        type: "transcript",
        entry: {
          stage: "reviewing",
          role: "reviewer",
          actorKey: entry.key,
          title: `${copy.stageReview} · ${entry.label}`,
          text: reviewTranscriptText(review),
          at: nowIso(),
        },
      });
      return review;
    } catch (error) {
      const failure = stageFailure(copy.stageReview, entry, error, copy);
      failures.push(failure);
      emit(hooks, {
        type: "member",
        role: "reviewer",
        key: entry.key,
        status: "failed",
        stage: "reviewing",
        error: failure.message,
        at: nowIso(),
      });
      emit(hooks, { type: "failure", failure, at: nowIso() });
      return undefined;
    }
  });
  const reviews = reviewOutcomes
    .filter((outcome) => outcome.status === "fulfilled" && outcome.value !== undefined)
    .map((outcome) => outcome.value);
  if (reviews.some((review) => review.rankingCompact)) notes.push(copy.reviewCompactNote);
  else if (reviews.some((review) => review.rankingSalvaged)) notes.push(copy.rankingSalvagedNote);
  else if (reviews.some((review) => review.rankingNormalized)) notes.push(copy.rankingNormalizedNote);
  if (reviews.length === 0) limitations.push(copy.limitationNoReviews);
  if (reviews.some((review) => review.selfReview === true)) limitations.push(copy.limitationSelfReview);
  const ranking = aggregateRankings(reviews, answers);

  // An abort during reviews reaches this point through the per-reviewer catch
  // handlers, so re-check before asking the arbiter for a final synthesis.
  throwIfRunAborted(signal, copy);

  emit(hooks, { type: "stage", stage: "deciding", stageLabel: copy.stageArbiter, at: nowIso() });
  emit(hooks, {
    type: "member",
    role: "arbiter",
    key: selection.arbiter.key,
    status: "running",
    stage: "deciding",
    at: nowIso(),
  });
  let arbiterResult;
  try {
    const askArbiter = (prompt, structured) => runChild({
      ctx,
      config,
      parentAgent,
      provider,
      copy,
      signal,
      stage: CHILD_STAGE.arbiter,
      stageLabel: `${copy.stageArbiter} · ${selection.arbiter.modelName}`,
      entry: selection.arbiter,
      prompt,
      extraParts: selection.imagePartsByKey?.get(selection.arbiter.key),
      maxTokens: config.arbiterMaxTokens,
      outputSchema: structured && provider.capabilities.outputSchema ? ARBITER_SCHEMA : undefined,
    });
    const result = await askArbiter(
      arbiterPrompt(selection.topic, renderedAnswers, reviews, selection.attachmentText, selection.language),
      true,
    );
    let value = result.structured;
    if (value === undefined) value = extractJson(textOfResult(result));
    if (value === undefined) {
      // An arbiter can burn the budget on reasoning and never close its JSON
      // envelope; a plain-markdown retry still produces a usable final answer.
      const plain = await askArbiter(
        arbiterPlainPrompt(selection.topic, renderedAnswers, reviews, selection.attachmentText, selection.language),
        false,
      );
      const text = textOfResult(plain).trim();
      if (text !== "") {
        value = { answerMarkdown: text };
        notes.push(copy.arbiterPlainNote);
      }
    }
    if (value === undefined) throw new Error(copy.arbiterInvalid);
    arbiterResult = { entry: selection.arbiter, ...normalizeArbiter(value) };
    emit(hooks, {
      type: "member",
      role: "arbiter",
      key: selection.arbiter.key,
      status: "done",
      stage: "deciding",
      at: nowIso(),
    });
    emit(hooks, {
      type: "transcript",
      entry: {
        stage: "deciding",
        role: "arbiter",
        actorKey: selection.arbiter.key,
        title: `${copy.stageArbiter} · ${selection.arbiter.label}`,
        text: arbiterResult.answerMarkdown,
        at: nowIso(),
      },
    });
  } catch (error) {
    const failure = stageFailure(copy.stageArbiter, selection.arbiter, error, copy);
    failures.push(failure);
    emit(hooks, {
      type: "member",
      role: "arbiter",
      key: selection.arbiter.key,
      status: "failed",
      stage: "deciding",
      error: failure.message,
      at: nowIso(),
    });
    emit(hooks, { type: "failure", failure, at: nowIso() });
  }

  // A deadline that expired during the arbiter call would otherwise turn into a
  // ranked-answer fallback and look like a finished deliberation.
  throwIfRunAborted(signal, copy);

  const fallbackAnswer = ranking.length > 0
    ? answererOf.get(ranking[0].answerId) ?? answers[0]
    : answers[0];
  const finalText = arbiterResult?.answerMarkdown ?? fallbackAnswer?.text ?? "";
  const finalFallback = arbiterResult === undefined;

  const providers = uniqueStrings(answers.map((answer) => answer.entry.provider));
  if (providers.length === 1) limitations.push(copy.limitationSingleProvider);
  if (answers.length < 2) limitations.push(copy.limitationFewAnswers);
  if (answererKeys.has(selection.arbiter.key)) limitations.push(copy.limitationArbiterOverlap);
  if (finalFallback) limitations.push(copy.fallbackFinal);
  if (selection.autoArbiter === true) {
    limitations.push(render(copy.autoArbiterNote, { label: selection.arbiter.label }));
  }
  if (Array.isArray(selection.extraLimitations)) limitations.push(...selection.extraLimitations);

  // Last gate before handing data back: the caller persists this as a
  // completed deliberation, so an aborted run must fail here even if every
  // stage above managed to degrade instead of throwing.
  throwIfRunAborted(signal, copy);

  return {
    topic: selection.topic,
    providers,
    assignments,
    reviewers: selection.reviewers,
    arbiter: selection.arbiter,
    rounds: selection.rounds,
    roundsRun,
    answers,
    reviews,
    ranking,
    arbiterResult,
    finalText,
    finalFallback,
    finalAnswerId: finalFallback ? fallbackAnswer?.id : undefined,
    finalAuthor: finalFallback
      ? (fallbackAnswer === undefined ? undefined : { key: fallbackAnswer.entry.key, label: fallbackAnswer.entry.label })
      : { key: selection.arbiter.key, label: selection.arbiter.label },
    failures,
    notes,
    limitations: uniqueStrings(limitations),
    maxAnswerChars: config.maxAnswerChars,
  };
}
