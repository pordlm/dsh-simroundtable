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
 */
export const childPlans = new Map();

/** Live child activations, so disposal can cancel them all. */
export const activeHandles = new Set();

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
 * listener attaches a web-only allow-list before the child can take a step.
 */
export async function runChild({
  ctx,
  config,
  parentAgent,
  provider,
  copy,
  signal,
  stageLabel,
  entry,
  prompt,
  extraParts,
  maxTokens,
  outputSchema,
}) {
  const childId = randomUUID();
  const plan = {
    allowed: new Set(),
    outputSchema: outputSchema !== undefined,
    copy,
    applied: false,
  };
  childPlans.set(childId, plan);

  try {
    return await withDeadline(
      signal,
      config.childTimeoutMs,
      render(copy.childTimedOut, { ms: config.childTimeoutMs }),
      async (childSignal) => {
        const handle = await ctx.subagents.startActivation({
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
        activeHandles.add(handle);
        const onAbort = () => {
          void handle.dispose().catch(() => {});
        };
        childSignal.addEventListener("abort", onAbort, { once: true });
        try {
          return await handle.result;
        } finally {
          childSignal.removeEventListener("abort", onAbort);
          activeHandles.delete(handle);
          try {
            await handle.dispose();
          } catch {
            // Disposal is best-effort; the result is already settled.
          }
        }
      },
    );
  } finally {
    childPlans.delete(childId);
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
 * @param selection - `{ topic, answerers, reviewers, arbiter, rounds }`; an
 *   optional `seating` array may pin the anonymized order (used by tests and by
 *   callers that want to preserve a page-side preview).
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
        stageLabel: `${copy.stageAnswer} ${assignment.id} · ${assignment.entry.modelName}`,
        entry: assignment.entry,
        prompt: answerPrompt(selection.topic, selection.attachmentText),
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
              stageLabel: `${copy.stageDiscussion} ${answer.id} · ${answer.entry.modelName}`,
              entry: answer.entry,
              prompt: discussionPrompt(selection.topic, current),
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
        reviewPrompt(selection.topic, renderedAnswers),
        true,
      );
      let compact = false;
      if (attempt.value === undefined && attempt.ranking === undefined) {
        compact = true;
        attempt = await reviewAttempt(
          entry,
          reviewRankingPrompt(selection.topic, renderedAnswers),
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
      stageLabel: `${copy.stageArbiter} · ${selection.arbiter.modelName}`,
      entry: selection.arbiter,
      prompt,
      extraParts: selection.imagePartsByKey?.get(selection.arbiter.key),
      maxTokens: config.arbiterMaxTokens,
      outputSchema: structured && provider.capabilities.outputSchema ? ARBITER_SCHEMA : undefined,
    });
    const result = await askArbiter(
      arbiterPrompt(selection.topic, renderedAnswers, reviews, selection.attachmentText),
      true,
    );
    let value = result.structured;
    if (value === undefined) value = extractJson(textOfResult(result));
    if (value === undefined) {
      // An arbiter can burn the budget on reasoning and never close its JSON
      // envelope; a plain-markdown retry still produces a usable final answer.
      const plain = await askArbiter(
        arbiterPlainPrompt(selection.topic, renderedAnswers, reviews, selection.attachmentText),
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