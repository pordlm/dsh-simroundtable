/**
 * A three-stage protocol fixture for runner tests.
 *
 * It has no models, no clock, and no randomness: `buildTasks` is driven by
 * `config.tasksPerStage`, and `normalizeResult` maps a few malformed raw values
 * to failed/empty results so tests can inject failures without patching the
 * protocol object.
 */
import { ProtocolError } from "../../lib/protocols/types.js";

export const FIXTURE_STAGES = Object.freeze(["one", "two", "three"]);
export const FIXTURE_HOOKS = Object.freeze([
  "metadata",
  "validateRequest",
  "createState",
  "nextStage",
  "buildTasks",
  "buildPrompt",
  "outputSchema",
  "normalizeResult",
  "reduce",
  "isComplete",
  "buildReport",
]);

function tasksPerStage(context) {
  const count = context?.config?.tasksPerStage ?? 1;
  if (!Number.isInteger(count) || count < 1) {
    throw new ProtocolError("fixture-config", "tasksPerStage must be a positive integer");
  }
  return count;
}

export const fixtureProtocol = Object.freeze({
  id: "fixture",
  version: 1,
  experimental: true,

  metadata() {
    return { id: "fixture", version: 1, experimental: true, stages: [...FIXTURE_STAGES] };
  },

  validateRequest(request) {
    if (typeof request?.topic !== "string" || request.topic.trim() === "") {
      throw new ProtocolError("fixture-topic", "topic required");
    }
  },

  createState() {
    return { step: 0, collected: [] };
  },

  nextStage(state) {
    return state.step < FIXTURE_STAGES.length ? FIXTURE_STAGES[state.step] : null;
  },

  buildTasks(stage, _state, context) {
    const count = tasksPerStage(context);
    return Array.from({ length: count }, (_, index) => ({
      id: `${stage}:${index}`,
      stage,
      participantId: `${stage}-p${index}`,
      role: "answerer",
      round: 0,
    }));
  },

  buildPrompt(task) {
    return `fixture prompt for ${task.id}`;
  },

  outputSchema() {
    return undefined;
  },

  normalizeResult(task, raw) {
    const base = { taskId: task.id, participantId: task.participantId, stage: task.stage, round: 0 };
    if (raw === "boom") return { ...base, status: "failed", error: "boom" };
    if (raw === "") return { ...base, status: "empty" };
    return { ...base, status: "ok", output: { text: String(raw) } };
  },

  reduce(state, results) {
    return {
      step: state.step + 1,
      collected: [...state.collected, ...results.map((result) => `${result.taskId}:${result.status}`)],
    };
  },

  isComplete(state) {
    return state.step >= FIXTURE_STAGES.length;
  },

  buildReport(state) {
    return { markdown: `fixture report; collected ${state.collected.length}`, fallback: false };
  },

  publicSnapshot(state) {
    return { stage: FIXTURE_STAGES[state.step] ?? null, step: state.step, count: state.collected.length };
  },
});

/** Same protocol but never finishes: used for the step-cap test. */
export function stalledProtocol() {
  return Object.freeze({ ...fixtureProtocol, isComplete: () => false });
}

export const fixtureRequest = Object.freeze({ topic: "a fixture topic" });