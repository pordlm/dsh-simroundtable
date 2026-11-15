/**
 * Regression tests for the t15 settlement fixes:
 *   - a partially failed run still settles with failures, terminal roster
 *     members and a readable transcript;
 *   - a run with no usable answer at all is `failed`, never `completed`;
 *   - image attachments reach answerers and the arbiter only — never reviewers;
 *   - persona selection reaches the v2 prompt (the seat carries the persona);
 *   - the seat's route key survives planning, so same-origin seats are grouped;
 *   - the full post-stage state is persisted for a readable interrupted run.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { normalizeConfig } from "../lib/core.js";
import { copyFor } from "../lib/copy.js";
import { MeetingManager } from "../lib/meetings.js";
import { PersonaStore } from "../lib/personas/store.js";

const ZH = copyFor("zh");
const BASE_CONFIG = { childTimeoutMs: 5_000, runTimeoutMs: 30_000, catalogTimeoutMs: 2_000 };
const config = normalizeConfig(BASE_CONFIG);
const optInConfig = normalizeConfig({ ...BASE_CONFIG, personaBinding: "opt-in" });

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "roundtable-settle-"));
}

/** A subagent provider double that records every prompt and can fail answers. */
function makeSpawner({ failAnswers = 0, failReviews = 0, failArbiter = 0 } = {}) {
  const calls = [];
  let answersSeen = 0;
  let reviewsSeen = 0;
  let arbitersSeen = 0;
  const startActivation = (spec) => {
    const parts = Array.isArray(spec.request?.prompt) ? spec.request.prompt : [];
    const text = String(parts[0]?.text ?? "");
    const stage = /review model in a roundtable/i.test(text)
      ? "review"
      : /arbiter of a multi-model roundtable/i.test(text)
        ? "arbiter"
        : /write YOUR revised final answer/i.test(text)
          ? "discussion"
          : "answer";
    calls.push({ stage, text, partCount: parts.length });
    let settle;
    const result = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    spec.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.code = "ABORT_ERR";
      settle.reject(error);
    }, { once: true });
    queueMicrotask(() => {
      if (stage === "answer" && answersSeen++ < failAnswers) {
        settle.reject(new Error("boom"));
        return;
      }
      if (stage === "review") {
        if (reviewsSeen++ < failReviews) {
          settle.reject(new Error("review boom"));
          return;
        }
        settle.resolve({ stopReason: "end", structured: { ranking: ["A", "B"] }, output: [] });
        return;
      }
      if (stage === "arbiter") {
        if (arbitersSeen++ < failArbiter) {
          settle.reject(new Error("arbiter boom"));
          return;
        }
        settle.resolve({ stopReason: "end", structured: { answerMarkdown: "final synthesis" }, output: [] });
        return;
      }
      settle.resolve({ stopReason: "end", output: [{ type: "text", text: "independent answer" }] });
    });
    return { childId: spec.childId, result, dispose: async () => {} };
  };
  return { startActivation, calls };
}

function makeContext({ workspace, spawner }) {
  const ctx = {
    logger: { warn() {} },
    llm: {
      listProviders: () => [{ id: "p1", name: "P1" }, { id: "p2", name: "P2" }],
      listModels: async (id) => [{ id: `${id}-model`, name: `${id}-model` }],
    },
    subagents: {
      getProvider: () => ({
        name: "spawn",
        inheritsParentContext: false,
        capabilities: { agentOptions: true, outputSchema: true, depthLimit: true },
      }),
      startActivation: spawner.startActivation,
    },
    agents: {
      create: async () => ({ agent: { id: "orchestrator", session: {} }, dispose: async () => {} }),
      get: () => undefined,
    },
    get(name) {
      if (name === "workspaceRegistry") return { list: () => [{ id: "ws-1", path: workspace, title: "Workspace" }] };
      if (name === "agents") return this.agents;
      return undefined;
    },
  };
  return ctx;
}

function makeManager(ctx, custom = config) {
  return new MeetingManager({
    ctx,
    config: custom,
    copyFor: (locale) => copyFor(locale),
    resolveLocale: () => "zh",
  });
}

async function runToEnd(manager, detail) {
  const run = manager.active.get(detail.id);
  assert.ok(run !== undefined, "the run is registered while it works");
  await run.promise;
}

function onDiskRecord(workspace, id) {
  return JSON.parse(readFileSync(join(workspace, ".roundtable", `${id}.json`), "utf8"));
}

/** Fake a pending upload the way the page's plugin would have written it. */
function fakeUpload(workspace, manifest) {
  const id = manifest.id ?? randomUUID();
  const dir = join(workspace, ".roundtable", "uploads", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ id, workspace, ...manifest }));
  if (manifest.payloadBody !== undefined) {
    writeFileSync(join(dir, manifest.payload ?? "payload"), manifest.payloadBody);
  }
  return id;
}

const SEATS = [
  { id: "a1", provider: "p1", model: "p1-model", role: "answerer" },
  { id: "a2", provider: "p2", model: "p2-model", role: "answerer" },
  { id: "r1", provider: "p1", model: "p1-model", role: "reviewer" },
  { id: "j1", provider: "p2", model: "p2-model", role: "arbiter" },
];

function v2CreateInput(topic, seats, extra = {}) {
  return {
    topic,
    workspace: extra.workspace,
    rounds: 0,
    protocol: { id: "roundtable", version: 2 },
    participants: seats,
    ...extra,
  };
}

test("a partially failed run still settles with failures, roster states and a transcript", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner({ failAnswers: 1 });
  try {
    const manager = makeManager(makeContext({ workspace, spawner }));
    const detail = await manager.create(v2CreateInput("t15 部分失败", SEATS, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed", "one failed answerer does not fail the meeting");
    assert.equal(final.answers.length, 2);
    const empty = final.answers.filter((answer) => answer.text === "");
    assert.equal(empty.length, 1, "the failed answerer has no text");

    assert.equal(final.failures.length, 1);
    assert.equal(final.failures[0].stage, "answer");
    assert.equal(final.failures[0].message, "boom");
    assert.ok(typeof final.failures[0].entry?.model === "string", "the failure names its seat");

    const statuses = final.roster.answerers.map((member) => member.status).sort();
    assert.deepEqual(statuses, ["done", "failed"], "exactly one answerer ends failed");
    const failedSlot = final.roster.answerers.find((member) => member.status === "failed");
    const okSlot = final.roster.answerers.find((member) => member.status === "done");
    assert.equal(failedSlot.error, "boom");

    assert.ok(final.transcript.some((entry) => entry.stage === "answering" && entry.text.includes("independent answer")));
    assert.equal(final.reviews.length, 1);
    assert.equal(final.reviews[0].anonymous, true);
    // The failed answer produced nothing, so the reviewer only saw answer B.
    assert.deepEqual(final.reviews[0].ranking, [{ answerId: "B", averageRank: 1 }]);
    assert.equal(final.finalAnswer.text, "final synthesis");
    assert.equal(final.finalAnswer.anonymousId !== undefined, true);

    const onDisk = onDiskRecord(workspace, detail.id);
    assert.equal(onDisk.failures.length, 1, "failures are durable");
    assert.equal(onDisk.transcript.length >= 1, true, "transcript is durable");
    const fullState = onDisk.protocolFullState;
    assert.ok(fullState !== undefined, "the full post-stage state is persisted");
    assert.equal(Object.values(fullState.answers).some((answer) => String(answer.text).includes("independent answer")), true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a run whose answerers all fail is failed, not completed", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner({ failAnswers: 99 });
  try {
    const manager = makeManager(makeContext({ workspace, spawner }));
    const detail = await manager.create(v2CreateInput("t15 全失败", SEATS.slice(0, 2), { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "failed", "no usable answer means the meeting failed");
    const terminalFailure = final.failures.find((failure) => failure.message === ZH.noAnswers);
    assert.ok(terminalFailure !== undefined, "the reason names the missing answers");
    assert.equal(final.finalAnswer?.text ?? "", "", "no answer text is fabricated");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("image parts reach answerers only, text bodies stay in prompts, personas ride the seat", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  try {
    new PersonaStore({ workspace }).save({
      id: "red-teamer",
      name: "Red teamer",
      mission: "Attack the proposal and name its failure modes.",
      lens: "adversarial",
    });
    const imageId = fakeUpload(workspace, {
      kind: "image",
      name: "pic.png",
      mime: "image/png",
      bytes: 8,
      ref: "att-image-1",
    });
    const textId = fakeUpload(workspace, {
      kind: "text",
      name: "notes.md",
      mime: "text/markdown",
      bytes: 11,
      payloadBody: "hello world",
    });
    const manager = makeManager(makeContext({ workspace, spawner }), optInConfig);
    const detail = await manager.create(v2CreateInput("t15 附件与 persona", [
      { id: "a1", provider: "p1", model: "p1-model", role: "answerer", personaId: "red-teamer" },
      { id: "a2", provider: "p1", model: "p1-model", role: "answerer" },
      { id: "r1", provider: "p2", model: "p2-model", role: "reviewer" },
      { id: "j1", provider: "p2", model: "p2-model", role: "arbiter" },
    ], { workspace, attachments: [imageId, textId] }));
    await runToEnd(manager, detail);

    const answerCalls = spawner.calls.filter((call) => call.stage === "answer");
    assert.equal(answerCalls.length, 2);
    for (const call of answerCalls) {
      assert.equal(call.partCount, 2, "an answerer prompt carries the text part plus one image part");
      assert.ok(call.text.includes("hello world"), "the text attachment body is quoted in the answer prompt");
    }
    const personaCall = answerCalls.find((call) => call.text.includes("Attack the proposal"));
    assert.ok(personaCall !== undefined, "the persona card is prepended to its seat's prompt");
    const plainCall = answerCalls.find((call) => !call.text.includes("Attack the proposal"));
    assert.ok(plainCall !== undefined, "the seat without a persona keeps the v1 prompt");

    const reviewCalls = spawner.calls.filter((call) => call.stage === "review");
    assert.equal(reviewCalls.length, 1);
    assert.equal(reviewCalls[0].partCount, 1, "a reviewer prompt carries no image part");
    assert.equal(reviewCalls[0].text.includes("hello world"), false, "a reviewer prompt quotes no attachment body");
    const arbiterCalls = spawner.calls.filter((call) => call.stage === "arbiter");
    assert.equal(arbiterCalls[0].partCount, 2, "the arbiter still receives the image part");

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.participants[0].modelRouteKey, "p1/p1-model", "the route key survives planning");
    assert.equal(final.finalReport.sameRouteNotes.length, 1, "same-origin answerers are disclosed once");
    assert.deepEqual(final.finalReport.sameRouteNotes[0][1], ["a1", "a2"]);

    const onDisk = onDiskRecord(workspace, detail.id);
    assert.equal(onDisk.failures.length, 0);
    assert.equal(onDisk.limitations.some((note) => note.includes("p1-model")), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("persistTerminal degrades to a terminal shadow and heals on a later good write", () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const record = {
      id: "shadowtest01",
      workspace,
      status: "completed",
      stage: "completed",
      stageLabel: "completed",
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalAnswer: null,
      limitations: [],
    };
    let attempts = 0;
    manager.write = () => {
      attempts += 1;
      return false;
    };
    assert.equal(manager.persistTerminal(record), false, "a doomed write is reported, never thrown");
    assert.ok(attempts > 1, "persistTerminal retries before giving up");
    const key = manager.terminalShadowKey(record.workspace, record.id);
    const shadow = manager.terminalShadow.get(key);
    assert.ok(shadow !== undefined, "the terminal record survives as a shadow");
    assert.equal(shadow.record.status, "completed");

    // A later read heals the shadow once the filesystem works again.
    delete manager.write;
    manager.healTerminalShadow(shadow);
    assert.equal(manager.terminalShadow.has(key), false, "the shadow is dropped after healing");
    assert.equal(onDiskRecord(workspace, record.id).status, "completed", "the healed record is durable");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("an empty reviewer list falls back to answerers reviewing each other", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    // Only two answerers, no reviewer seat: the plan synthesizes one reviewer
    // per answerer and discloses the fallback as a limitation.
    const detail = await manager.create(v2CreateInput("t18 空 reviewer 回退", SEATS.slice(0, 2), { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed", "the fallback meeting still completes");
    assert.equal(final.limitations.length, 1, "the fallback is disclosed");
    assert.ok(final.limitations[0].includes("互相评审"), "the limitation explains the fallback");
    assert.ok(final.reviews.length >= 2, "the synthesized reviewers wrote reviews");
    assert.ok(final.finalAnswer !== null, "the meeting settles with a final answer");
    const reviewerIds = final.participants.filter((seat) => seat.role === "reviewer").map((seat) => seat.id);
    assert.equal(reviewerIds.length, 2, "one reviewer seat per answerer");
    assert.equal(new Set(reviewerIds).size, 2, "reviewer ids are unique");
    const onDisk = onDiskRecord(workspace, detail.id);
    assert.equal(onDisk.limitations.length, 1, "the limitation is durable");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a failed arbiter falls back to the top-ranked answer", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner({ failArbiter: 1 }) }));
    const detail = await manager.create(v2CreateInput("t16 arbiter 失败", SEATS, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed", "an arbiter failure does not fail the meeting");
    assert.equal(final.finalAnswer.fallback, true, "the answer is disclosed as a fallback");
    assert.equal(final.finalAnswer.text, "independent answer", "the fallback quotes the leading ranked answer");
    assert.equal(final.finalAnswer.arbiter, undefined, "no arbiter output is claimed");
    assert.ok(final.failures.some((failure) => String(failure.message).includes("arbiter boom")), "the arbiter failure is recorded");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("custom reviewers that all fail still complete with an incomplete report", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner({ failReviews: 99 }) }));
    const detail = await manager.create(v2CreateInput("t16 reviewer 全失败", SEATS, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed", "failed reviews do not fail a meeting with valid answers");
    assert.equal(final.reviews.length, 0, "no reviews survived");
    assert.equal(final.finalReport.incomplete, true, "the report is marked incomplete");
    assert.equal(final.finalReport.fallback, false, "the arbiter still decided, so the answer is not a fallback");
    assert.equal(final.finalAnswer.fallback, false, "finalAnswer keeps the arbiter decision");
    assert.ok(final.failures.length >= 1, "the failed reviewer is recorded");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
