/**
 * roundtable-v2 — the protocol object that gives Persona a real execution path.
 *
 * It is the same meeting the 0.6.1 roundtable runs (independent answers →
 * optional discussion rounds → anonymous reviews → arbiter), expressed through
 * the eleven protocol hooks. Nothing here spawns an agent: the runner hands
 * each task to `engine.runChild`, which keeps the child-plan tool policy in one
 * place (`toolPolicyFor`).
 *
 * It stays unregistered (or registered disabled) until PR-4 wires `create()`;
 * `experimental: true` keeps it out of the public protocol list.
 */
import {
  LETTERS,
  extractJson,
  normalizeReview,
  aggregateRankings,
} from "../core.js";
import { ARBITER_SCHEMA, REVIEW_SCHEMA } from "../prompts.js";
import { STAGE_ORDER } from "../stages.js";
import { ProtocolError } from "./types.js";
import { composeStagePrompt } from "./prompt-composer.js";

export const ROUNDTABLE_V2_ID = "roundtable";
export const ROUNDTABLE_V2_VERSION = 2;
export const ROUNDTABLE_ROLES = Object.freeze(["answerer", "reviewer", "arbiter"]);
export const MAX_ROUNDS = 10;

/** Displayed stage name ↔ the engine's child-stage name (capability policy). */
const CHILD_STAGE_OF = Object.freeze({
  answering: "answer",
  discussing: "discussion",
  reviewing: "review",
  deciding: "arbiter",
});

function seats(participants, role) {
  return participants.filter((seat) => seat.role === role);
}

function roundsOf(config, request) {
  const rounds = request?.rounds ?? config?.rounds ?? 0;
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > MAX_ROUNDS) {
    throw new ProtocolError("roundtable-rounds", `rounds must be an integer between 0 and ${MAX_ROUNDS}`);
  }
  return rounds;
}

/** Stage sequence for a meeting; `rounds:0` skips discussing entirely. */
function sequenceOf(rounds) {
  return Object.freeze([
    "answering",
    ...Array.from({ length: rounds }, () => "discussing"),
    "reviewing",
    "deciding",
  ]);
}

/** Anonymous labels, stable for one meeting and never tied to a provider. */
function labelMap(participants) {
  const map = new Map();
  let index = 0;
  for (const seat of participants.filter((entry) => entry.role === "answerer")) {
    map.set(seat.participantId, LETTERS[index] ?? `?${index + 1}`);
    index += 1;
  }
  return map;
}

function answersMaterial(state, participants) {
  const labels = labelMap(participants);
  return participants
    .filter((seat) => seat.role === "answerer")
    .map((seat) => ({ id: labels.get(seat.participantId), text: state.answers[seat.participantId]?.text ?? "" }))
    .filter((answer) => answer.text.length > 0);
}

function reviewsMaterial(state, participants) {
  return participants
    .filter((seat) => seat.role === "reviewer")
    .map((seat) => state.reviews[seat.participantId])
    .filter((review) => review !== undefined);
}

export const roundtableV2 = Object.freeze({
  id: ROUNDTABLE_V2_ID,
  version: ROUNDTABLE_V2_VERSION,
  experimental: true,
  stages: STAGE_ORDER,
  roles: ROUNDTABLE_ROLES,

  metadata() {
    return Object.freeze({
      id: ROUNDTABLE_V2_ID,
      version: ROUNDTABLE_V2_VERSION,
      experimental: true,
      description: "Built-in roundtable: independent answers, optional discussion, anonymous review, arbiter.",
      stages: STAGE_ORDER,
      roles: ROUNDTABLE_ROLES,
    });
  },

  validateRequest(request, limits = {}) {
    const topic = request?.topic;
    if (typeof topic !== "string" || topic.trim().length === 0) {
      throw new ProtocolError("roundtable-topic", "topic must be a non-empty string");
    }
    const participants = Array.isArray(request?.participants) ? request.participants : [];
    const minimum = limits.min ?? 2;
    const maximum = limits.max ?? 8;
    if (participants.length < minimum || participants.length > maximum) {
      throw new ProtocolError(
        "participant-count",
        `a roundtable needs between ${minimum} and ${maximum} participants`,
      );
    }
    for (const seat of participants) {
      if (!ROUNDTABLE_ROLES.includes(seat?.role)) {
        throw new ProtocolError("invalid-participant-role", `invalid participant role: ${String(seat?.role)}`);
      }
    }
    if (seats(participants, "answerer").length === 0) {
      throw new ProtocolError("participant-count", "a roundtable needs at least one answerer");
    }
    roundsOf(request?.config, request);

    const snapshots = request?.personaSnapshots;
    if (snapshots !== undefined) {
      for (const seat of participants) {
        if (seat.personaId === undefined) continue;
        if (typeof snapshots[seat.personaId] !== "object" || snapshots[seat.personaId] === null) {
          throw new ProtocolError(
            "persona-snapshot-missing",
            `persona ${seat.personaId} has no snapshot in this meeting`,
          );
        }
      }
    }
  },

  createState(context) {
    const rounds = roundsOf(context?.config, context);
    const sequence = sequenceOf(rounds);
    return {
      step: 0,
      sequence,
      round: 0,
      answers: {},
      reviews: {},
      ranking: {},
      arbiter: null,
      seatStatus: {},
    };
  },

  nextStage(state) {
    return state.step < state.sequence.length ? state.sequence[state.step] : null;
  },

  buildTasks(stage, state, context) {
    const participants = context?.participants ?? [];
    const topic = context?.topic;
    const attachments = context?.attachments ?? [];
    const language = context?.language ?? "auto";
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const tasks = [];

    if (stage === "answering" || stage === "discussing") {
      const round = stage === "answering" ? 0 : state.round + 1;
      const kind = stage === "answering" ? "answer" : "discussion";
      const material = stage === "discussing" ? answersMaterial(state, participants) : [];
      for (const seat of seats(participants, "answerer")) {
        tasks.push({
          id: `${kind === "answer" ? "answer:0" : `discuss:${round}`}:${seat.participantId}`,
          stage: kind,
          participantId: seat.participantId,
          role: "answerer",
          round,
          topic,
          attachments,
          language,
          web: kind === "answer" && !hasAttachments,
          ...(kind === "discussion" ? { answers: material } : {}),
        });
      }
      return tasks;
    }

    if (stage === "reviewing") {
      const material = answersMaterial(state, participants);
      for (const seat of seats(participants, "reviewer")) {
        tasks.push({
          id: `review:${seat.participantId}`,
          stage: "review",
          participantId: seat.participantId,
          role: "reviewer",
          round: state.round,
          topic,
          attachments,
          language,
          web: false,
          answers: material,
        });
      }
      return tasks;
    }

    if (stage === "deciding") {
      const arbiterSeat = seats(participants, "arbiter")[0] ?? seats(participants, "answerer")[0];
      if (arbiterSeat === undefined) {
        throw new ProtocolError("participant-count", "a roundtable needs a deciding seat");
      }
      tasks.push({
        id: `arbiter:${arbiterSeat.participantId}`,
        stage: "arbiter",
        participantId: arbiterSeat.participantId,
        role: "arbiter",
        round: state.round,
        topic,
        attachments,
        language,
        web: false,
        answers: answersMaterial(state, participants),
        reviews: reviewsMaterial(state, participants),
      });
      return tasks;
    }

    throw new ProtocolError("unknown-stage", `unknown roundtable stage: ${String(stage)}`, { stage });
  },

  buildPrompt(task, state, context) {
    const persona = task.personaId === undefined ? undefined : context?.personaSnapshots?.[task.personaId];
    return composeStagePrompt({ task, context, persona });
  },

  outputSchema(task) {
    if (task.stage === "review") return REVIEW_SCHEMA;
    if (task.stage === "arbiter") return ARBITER_SCHEMA;
    return undefined;
  },

  normalizeResult(task, raw) {
    const base = {
      taskId: task.id,
      participantId: task.participantId,
      role: task.role,
      stage: task.stage,
      round: task.round ?? 0,
    };
    const text = typeof raw === "string" ? raw.trim() : String(raw?.text ?? "").trim();
    const structured = raw !== null && typeof raw === "object" ? raw.structured : undefined;
    if (structured === undefined && text.length === 0) {
      return { ...base, status: "empty", error: "empty-output" };
    }

    if (task.stage === "review") {
      try {
        const parsed = structured ?? extractJson(text);
        const review = normalizeReview(parsed, task.answers.map((answer) => answer.id));
        return { ...base, status: "ok", output: review };
      } catch (error) {
        return { ...base, status: "invalid", error: String(error?.message ?? error) };
      }
    }

    if (task.stage === "arbiter") {
      try {
        const parsed = raw?.structured ?? extractJson(text);
        if (typeof parsed === "object" && parsed !== null) {
          const markdown = String(parsed.answerMarkdown ?? parsed.finalAnswer ?? "").trim();
          if (markdown.length > 0) return { ...base, status: "ok", output: { markdown } };
        }
      } catch {
        // Plain-text arbiter output is a valid, if less structured, result.
      }
      return { ...base, status: "ok", output: { markdown: text } };
    }

    return { ...base, status: "ok", output: { text } };
  },

  /** Pure: no clock, no random, no model, no runtime handle. */
  reduce(state, results) {
    const next = {
      ...state,
      answers: { ...state.answers },
      reviews: { ...state.reviews },
      ranking: { ...state.ranking },
      seatStatus: { ...state.seatStatus },
    };
    for (const result of results) {
      next.seatStatus[result.participantId] = result.status;
      if (result.status !== "ok") continue;
      if (result.stage === "answer" || result.stage === "discussion") {
        next.answers[result.participantId] = { text: result.output.text, round: result.round };
        next.round = Math.max(next.round, result.round);
      } else if (result.stage === "review") {
        next.reviews[result.participantId] = result.output;
        next.ranking[result.participantId] = result.output.ranking;
      } else if (result.stage === "arbiter") {
        next.arbiter = { participantId: result.participantId, ...result.output };
      }
    }
    next.step = state.step + 1;
    return next;
  },

  isComplete(state) {
    return state.step >= state.sequence.length;
  },

  buildReport(state, context) {
    const participants = context?.participants ?? [];
    const labels = labelMap(participants);
    const assignments = [...labels.entries()].map(([participantId, id]) => ({ id, participantId }));
    const reviews = reviewsMaterial(state, participants);
    const ranking = reviews.length > 0 ? aggregateRankings(reviews, assignments) : [];
    const fallback = state.arbiter === null;
    const incomplete = state.sequence.length > 0 && state.reviews !== undefined && reviews.length === 0;

    const lines = [`# Roundtable: ${context?.topic ?? ""}`, ""];
    if (state.arbiter?.markdown) {
      lines.push("## Final answer", "", state.arbiter.markdown, "");
    } else {
      const best = state.answers[assignments[0]?.participantId];
      lines.push(
        "## Final answer",
        "",
        "_The arbiter produced no output; the leading answer is shown unchanged._",
        "",
        best?.text ?? "_No answer was produced._",
        "",
      );
    }
    if (ranking.length > 0) {
      lines.push("## Ranking", "");
      for (const entry of ranking) {
        const average = entry.votes === 0 ? "no votes" : `avg rank ${entry.averageRank}`;
        lines.push(`- ${entry.answerId}: ${average} (${entry.votes} vote${entry.votes === 1 ? "" : "s"})`);
      }
      lines.push("");
    }
    lines.push("## Participants", "");
    for (const seat of participants) {
      const label = labels.get(seat.participantId);
      const persona = seat.personaId === undefined ? "" : ` — persona ${seat.personaId}`;
      lines.push(`- ${label ?? seat.role} (${seat.role})${persona}`);
    }
    lines.push("");

    const sameRoute = new Map();
    for (const seat of participants) {
      const list = sameRoute.get(seat.modelRouteKey) ?? [];
      list.push(seat.participantId);
      sameRoute.set(seat.modelRouteKey, list);
    }

    return {
      markdown: lines.join("\n"),
      fallback,
      incomplete,
      ranking,
      sameRouteNotes: [...sameRoute.entries()].filter(([, list]) => list.length > 1),
      ...(state.arbiter?.markdown ? { answerMarkdown: state.arbiter.markdown } : {}),
    };
  },

  publicSnapshot(state, context) {
    const participants = context?.participants ?? [];
    const stage = this.nextStage(state) ?? "deciding";
    const index = state.sequence.indexOf(stage);
    return {
      stage,
      stageIndex: index === -1 ? state.sequence.length : index + 1,
      stageCount: state.sequence.length,
      seats: participants.map((seat) => ({
        participantId: seat.participantId,
        label: seat.label ?? seat.participantId,
        status: state.seatStatus[seat.participantId] ?? "pending",
      })),
      counts: {
        answered: Object.keys(state.answers).length,
        reviewed: Object.keys(state.reviews).length,
        decided: state.arbiter === null ? 0 : 1,
      },
    };
  },
});

export { CHILD_STAGE_OF, sequenceOf, labelMap };