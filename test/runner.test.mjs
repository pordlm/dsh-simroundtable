import test from "node:test";
import assert from "node:assert/strict";

import { runProtocol } from "../lib/protocols/runner.js";
import { ProtocolError } from "../lib/protocols/types.js";
import {
  FIXTURE_STAGES,
  fixtureProtocol,
  fixtureRequest,
  stalledProtocol,
} from "./fixtures/protocol-fixture.mjs";

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * withDeadline unrefs its timer, so a run waiting on a never-resolving task
 * would let the event loop drain and node --test would cancel the test rather
 * than observe the timeout. A plain interval keeps the loop alive meanwhile.
 */
async function withKeepalive(fn) {
  const keepalive = setInterval(() => {}, 250);
  try {
    return await fn();
  } finally {
    clearInterval(keepalive);
  }
}

async function run(overrides = {}, options = {}) {
  const calls = [];
  const result = await runProtocol({
    protocol: fixtureProtocol,
    request: fixtureRequest,
    context: { config: { tasksPerStage: 1 } },
    executeTask: async ({ task, prompt, protocolId, stage }) => {
      calls.push({ task, prompt, protocolId, stage });
      return `ok:${task.id}`;
    },
    ...overrides,
  });
  return { result, calls };
}

test("runs every stage in order and reduces after each one", async () => {
  const { result, calls } = await run();
  assert.equal(result.protocol.id, "fixture");
  assert.equal(result.steps, FIXTURE_STAGES.length);
  assert.equal(result.tasksRun, FIXTURE_STAGES.length);
  assert.deepEqual(result.stages.map((stage) => stage.stage), [...FIXTURE_STAGES]);
  assert.deepEqual(calls.map((call) => call.stage), [...FIXTURE_STAGES]);
  assert.deepEqual(calls.map((call) => call.protocolId), FIXTURE_STAGES.map(() => "fixture"));
  assert.match(result.report.markdown, /collected 3/);
  assert.deepEqual(result.snapshot, { stage: null, step: 3, count: 3 });
});

test("reduce never mutates the state it is given", async () => {
  const states = [];
  const original = fixtureProtocol.reduce;
  const protocol = Object.freeze({
    ...fixtureProtocol,
    reduce(state, results) {
      states.push(JSON.stringify(state));
      const next = original(state, results);
      assert.equal(JSON.stringify(state), states.at(-1), "reduce mutated its input state");
      return next;
    },
  });
  const { result } = await run({ protocol });
  assert.equal(result.steps, FIXTURE_STAGES.length);
  assert.deepEqual(states, [
    JSON.stringify({ step: 0, collected: [] }),
    JSON.stringify({ step: 1, collected: ["one:0:ok"] }),
    JSON.stringify({ step: 2, collected: ["one:0:ok", "two:0:ok"] }),
  ]);
});

test("an aborted signal stops before the first task", async () => {
  const controller = new AbortController();
  controller.abort(Object.assign(new Error("stop"), { code: "ABORT_ERR" }));
  let calls = 0;
  await assert.rejects(
    runProtocol({
      protocol: fixtureProtocol,
      request: fixtureRequest,
      context: { config: { tasksPerStage: 1 } },
      signal: controller.signal,
      executeTask: async () => {
        calls += 1;
        return "never";
      },
    }),
    (error) => error.code === "ABORT_ERR",
  );
  assert.equal(calls, 0);
});

test("an abort raised by a task ends the run at the next boundary", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    runProtocol({
      protocol: fixtureProtocol,
      request: fixtureRequest,
      context: { config: { tasksPerStage: 1 } },
      signal: controller.signal,
      executeTask: async () => {
        calls += 1;
        controller.abort(Object.assign(new Error("stop"), { code: "ABORT_ERR" }));
        return "ok";
      },
    }),
    (error) => error.code === "ABORT_ERR",
  );
  assert.equal(calls, 1);
});

test("a protocol that never completes hits the step cap", async () => {
  await assert.rejects(
    runProtocol({
      protocol: stalledProtocol(),
      request: fixtureRequest,
      context: { config: { tasksPerStage: 1 } },
      limits: { maxProtocolSteps: 3 },
      executeTask: async () => "ok",
    }),
    (error) => error instanceof ProtocolError && error.code === "protocol-steps-exceeded",
  );
});

test("a run cannot exceed maxTotalTasks", async () => {
  await assert.rejects(
    runProtocol({
      protocol: fixtureProtocol,
      request: fixtureRequest,
      context: { config: { tasksPerStage: 2 } },
      limits: { maxTotalTasks: 4 },
      executeTask: async ({ task }) => `ok:${task.id}`,
    }),
    (error) => error.code === "protocol-tasks-exceeded",
  );
});

test("an oversized task output fails that task without ending the run", async () => {
  const { result } = await run({
    executeTask: async () => "abcdefghij",
    limits: { maxTaskOutputChars: 5 },
  });
  assert.equal(result.steps, FIXTURE_STAGES.length);
  assert.equal(result.stages[0].failed, 1);
  assert.equal(result.stages[0].ok, 0);
  assert.match(result.report.markdown, /collected 3/);
});

test("a protocol state over maxProtocolStateBytes aborts the run", async () => {
  await assert.rejects(
    runProtocol({
      protocol: fixtureProtocol,
      request: fixtureRequest,
      context: { config: { tasksPerStage: 1 } },
      limits: { maxProtocolStateBytes: 40 },
      executeTask: async ({ task }) => `ok:${task.id}`,
    }),
    (error) => error.code === "protocol-state-too-large",
  );
});

test("tasks run concurrently, capped by maxConcurrency", async () => {
  let active = 0;
  let peak = 0;
  const { result } = await run({
    context: { config: { tasksPerStage: 6 } },
    limits: { maxConcurrency: 2 },
    executeTask: async ({ task }) => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(5);
      active -= 1;
      return `ok:${task.id}`;
    },
  });
  assert.equal(result.tasksRun, FIXTURE_STAGES.length * 6);
  assert.ok(peak <= 2, `peak concurrency was ${peak}`);
  assert.ok(peak >= 2, "expected at least two concurrent tasks");
});

test("a task that outruns its own timeout fails alone", async () => {
  const { result } = await withKeepalive(() => run({
    limits: { taskTimeoutMs: 20, stageTimeoutMs: 5_000 },
    executeTask: async ({ task }) => {
      if (task.stage === "two") await new Promise(() => {});
      return `ok:${task.id}`;
    },
  }));
  assert.equal(result.steps, FIXTURE_STAGES.length);
  assert.equal(result.stages[1].failed, 1);
  assert.equal(result.stages[0].failed, 0);
});

test("a stage that outruns its deadline rejects the whole run", async () => {
  await assert.rejects(
    withKeepalive(() => runProtocol({
      protocol: fixtureProtocol,
      request: fixtureRequest,
      context: { config: { tasksPerStage: 1 } },
      limits: { taskTimeoutMs: 5_000, stageTimeoutMs: 20 },
      executeTask: async () => new Promise(() => {}),
    })),
    (error) => /timed out/.test(String(error?.message ?? "")),
  );
});

test("a throwing task is recorded as failed, not fatal", async () => {
  const { result } = await run({
    executeTask: async () => {
      throw new Error("kaboom");
    },
  });
  assert.equal(result.steps, FIXTURE_STAGES.length);
  assert.equal(result.stages[0].failed, 1);
});

test("checkpoints bracket every stage with handle-free snapshots", async () => {
  const events = [];
  await run({
    checkpoint: async (event) => {
      events.push(event);
    },
  });
  assert.deepEqual(events.map((event) => event.by), [
    "stage-start", "stage-end",
    "stage-start", "stage-end",
    "stage-start", "stage-end",
  ]);
  assert.deepEqual(events.filter((event) => event.by === "stage-start").map((event) => event.stage), [
    ...FIXTURE_STAGES,
  ]);
  for (const event of events) {
    assert.equal(event.protocolId, "fixture");
    assert.equal(typeof event.step, "number");
    if (event.by === "stage-start") {
      assert.deepEqual(Object.keys(event.state).sort(), ["count", "stage", "step"]);
    } else {
      assert.equal(event.summary.total, 1);
    }
  }
});

test("a rejecting price guard stops the run before the stage", async () => {
  await assert.rejects(
    runProtocol({
      protocol: fixtureProtocol,
      request: fixtureRequest,
      context: { config: { tasksPerStage: 1 } },
      limits: { priceGuard: ({ step }) => step < 2 },
      executeTask: async () => "ok",
    }),
    (error) => error.code === "price-guard-rejected",
  );
});

test("an invalid protocol object is rejected up front", async () => {
  await assert.rejects(
    runProtocol({ protocol: { id: "broken" }, executeTask: async () => "ok" }),
    (error) => error instanceof ProtocolError && error.code === "protocol-invalid",
  );
  await assert.rejects(
    runProtocol({ protocol: fixtureProtocol }),
    (error) => error.code === "runner-invalid",
  );
});