/**
 * protocol-runner — drives one meeting through a protocol's stage loop.
 *
 * The runner knows nothing about agents: every unit of work goes through the
 * injected `executeTask({task, prompt, protocolId, stage})`. PR-4 supplies an
 * adapter around `engine.runChild`, which is the only place a child agent is
 * spawned and therefore the only place the tool policy lives.
 *
 * Boundaries are hard: a stage that would exceed a budget throws instead of
 * returning a partial report, aborts are checked at every stage and task
 * boundary, and the protocol state is size-checked after every reduction so a
 * runaway reducer cannot be persisted.
 */
import { mapLimit, withDeadline } from "../core.js";
import { PROTOCOL_HOOKS, ProtocolError } from "./types.js";

export const DEFAULT_RUNNER_LIMITS = Object.freeze({
  maxProtocolSteps: 32,
  maxTotalTasks: 256,
  maxTaskOutputChars: 200_000,
  maxProtocolStateBytes: 2_000_000,
  maxConcurrency: 4,
  taskTimeoutMs: 300_000,
  stageTimeoutMs: 1_800_000,
});

function abortError(copy) {
  const error = new Error(copy?.runAborted ?? "run aborted");
  error.code = "ABORT_ERR";
  return error;
}

function throwIfAborted(signal, copy) {
  if (signal?.aborted) throw signal.reason ?? abortError(copy);
}

function assertProtocol(protocol) {
  if (typeof protocol !== "object" || protocol === null) {
    throw new ProtocolError("protocol-invalid", "protocol must be an object");
  }
  for (const hook of PROTOCOL_HOOKS) {
    if (typeof protocol[hook] !== "function") {
      throw new ProtocolError("protocol-invalid", `protocol is missing hook: ${hook}`, { hook });
    }
  }
  if (typeof protocol.id !== "string" || protocol.id.length === 0) {
    throw new ProtocolError("protocol-invalid", "protocol.id must be a non-empty string");
  }
}

function stateBytes(state) {
  try {
    return JSON.stringify(state).length;
  } catch (error) {
    throw new ProtocolError("protocol-state-not-serializable", String(error?.message ?? error));
  }
}

function textLength(raw) {
  if (typeof raw === "string") return raw.length;
  if (raw !== null && typeof raw === "object") {
    return String(raw.text ?? raw.markdown ?? "").length;
  }
  return 0;
}

export async function runProtocol(options = {}) {
  const { protocol, request = {}, context = {}, executeTask } = options;
  assertProtocol(protocol);
  if (typeof executeTask !== "function") {
    throw new ProtocolError("runner-invalid", "runProtocol requires an executeTask function");
  }

  const limits = { ...DEFAULT_RUNNER_LIMITS, ...(options.limits ?? {}) };
  const signal = options.signal ?? new AbortController().signal;
  const copy = options.copy ?? {};
  const checkpoint = typeof options.checkpoint === "function" ? options.checkpoint : undefined;
  const protocolId = protocol.id;

  protocol.validateRequest(request, limits.participants ?? {});

  const effectiveContext = {
    ...context,
    ...(request.topic !== undefined ? { topic: request.topic } : {}),
    ...(request.participants !== undefined ? { participants: request.participants } : {}),
    ...(request.attachments !== undefined ? { attachments: request.attachments } : {}),
    ...(request.language !== undefined ? { language: request.language } : {}),
    ...(request.config !== undefined ? { config: request.config } : {}),
    ...(request.personaSnapshots !== undefined ? { personaSnapshots: request.personaSnapshots } : {}),
  };

  let state = options.state ?? protocol.createState(effectiveContext);
  if (stateBytes(state) > limits.maxProtocolStateBytes) {
    throw new ProtocolError("protocol-state-too-large", "initial protocol state exceeds maxProtocolStateBytes");
  }

  const stageResults = [];
  let steps = 0;
  let totalTasks = 0;

  while (true) {
    if (protocol.isComplete(state, effectiveContext)) break;
    throwIfAborted(signal, copy);

    steps += 1;
    if (steps > limits.maxProtocolSteps) {
      throw new ProtocolError(
        "protocol-steps-exceeded",
        `protocol exceeded ${limits.maxProtocolSteps} steps`,
        { steps },
      );
    }

    const stage = protocol.nextStage(state, effectiveContext);
    if (stage === null || stage === undefined) break;

    if (typeof limits.priceGuard === "function" && !limits.priceGuard({ stage, step: steps })) {
      throw new ProtocolError("price-guard-rejected", `price guard rejected stage ${stage}`);
    }

    await checkpoint?.({
      by: "stage-start",
      protocolId,
      stage,
      step: steps,
      state: typeof protocol.publicSnapshot === "function"
        ? protocol.publicSnapshot(state, effectiveContext)
        : lastStateForCheckpoint(state),
    });

    const tasks = protocol.buildTasks(stage, state, effectiveContext);
    if (!Array.isArray(tasks)) {
      throw new ProtocolError("protocol-invalid", `buildTasks returned no array for stage ${stage}`);
    }
    totalTasks += tasks.length;
    if (totalTasks > limits.maxTotalTasks) {
      throw new ProtocolError(
        "protocol-tasks-exceeded",
        `protocol exceeded ${limits.maxTotalTasks} total tasks`,
        { tasks: totalTasks },
      );
    }

    const settled = await withDeadline(
      signal,
      limits.stageTimeoutMs,
      copy.stageTimeout ?? `stage ${stage} timed out`,
      (stageSignal) => mapLimit(tasks, limits.maxConcurrency, async (task) => {
        throwIfAborted(stageSignal, copy);
        const prompt = protocol.buildPrompt(task, state, effectiveContext);
        if (typeof prompt !== "string" || prompt.trim().length === 0) {
          return {
            taskId: task.id,
            participantId: task.participantId,
            role: task.role,
            stage: task.stage ?? stage,
            round: task.round ?? 0,
            status: "failed",
            error: "prompt-missing",
          };
        }
        let raw;
        try {
          raw = await withDeadline(
            stageSignal,
            limits.taskTimeoutMs,
            copy.taskTimeout ?? `task ${task.id} timed out`,
            (taskSignal) => executeTask({ task, prompt, protocolId, stage, signal: taskSignal }),
          );
        } catch (error) {
          if (stageSignal.aborted || signal.aborted) throw error;
          return {
            taskId: task.id,
            participantId: task.participantId,
            role: task.role,
            stage: task.stage ?? stage,
            round: task.round ?? 0,
            status: "failed",
            error: String(error?.message ?? error),
          };
        }
        if (textLength(raw) > limits.maxTaskOutputChars) {
          return {
            taskId: task.id,
            participantId: task.participantId,
            role: task.role,
            stage: task.stage ?? stage,
            round: task.round ?? 0,
            status: "failed",
            error: "output-too-large",
          };
        }
        return protocol.normalizeResult(task, raw);
      }),
    );

    const results = settled.map((entry, index) => {
      if (entry.status === "fulfilled") return entry.value;
      const task = tasks[index];
      return {
        taskId: task.id,
        participantId: task.participantId,
        role: task.role,
        stage: task.stage ?? stage,
        round: task.round ?? 0,
        status: "failed",
        error: String(entry.reason?.message ?? entry.reason),
      };
    });
    throwIfAborted(signal, copy);

    state = protocol.reduce(state, results, effectiveContext);
    if (typeof state !== "object" || state === null) {
      throw new ProtocolError("protocol-invalid", "reduce must return a state object");
    }
    if (stateBytes(state) > limits.maxProtocolStateBytes) {
      throw new ProtocolError(
        "protocol-state-too-large",
        `protocol state exceeded ${limits.maxProtocolStateBytes} bytes after stage ${stage}`,
        { stage },
      );
    }

    const summary = {
      stage,
      step: steps,
      total: results.length,
      ok: results.filter((result) => result.status === "ok").length,
      failed: results.filter((result) => result.status !== "ok").length,
    };
    stageResults.push(summary);
    await checkpoint?.({
      by: "stage-end",
      protocolId,
      stage,
      step: steps,
      summary,
    });
  }

  throwIfAborted(signal, copy);

  const report = protocol.buildReport(state, effectiveContext);
  return {
    protocol: { id: protocolId, version: protocol.version ?? null },
    state,
    report,
    snapshot: typeof protocol.publicSnapshot === "function"
      ? protocol.publicSnapshot(state, effectiveContext)
      : null,
    steps,
    tasksRun: totalTasks,
    stages: stageResults,
  };
}

/** Fallback for protocols without publicSnapshot: only counts, never handles. */
function lastStateForCheckpoint(state) {
  return { step: state?.step ?? 0 };
}