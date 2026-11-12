/**
 * Record-v2 wiring tests.
 *
 * These pin the two properties the plan calls non-negotiable:
 *   1. a v1 meeting is never rewritten, upgraded or re-shaped by reading it;
 *   2. a v2 meeting persists its protocol, seats, persona snapshots and final
 *      report, and its export goes through the v2 renderer.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { normalizeConfig } from "../lib/core.js";
import { copyFor } from "../lib/copy.js";
import { MeetingManager } from "../lib/meetings.js";
import { PersonaStore } from "../lib/personas/store.js";

const ZH = copyFor("zh");
const BASE_CONFIG = { childTimeoutMs: 5_000, runTimeoutMs: 30_000, catalogTimeoutMs: 2_000 };
const config = normalizeConfig(BASE_CONFIG);
const optInConfig = normalizeConfig({ ...BASE_CONFIG, personaBinding: "opt-in" });

const ROSTER = [{ provider: "p1", model: "p1-model" }, { provider: "p2", model: "p2-model" }];

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "roundtable-v2-"));
}

/** A subagent provider double that answers by prompt shape. */
function makeSpawner() {
  const startActivation = (spec) => {
    const text = String(spec.request?.prompt?.[0]?.text ?? "");
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
      if (/review model in a roundtable/i.test(text)) {
        settle.resolve({ stopReason: "end", structured: { ranking: ["A", "B"] }, output: [] });
        return;
      }
      if (/arbiter of a multi-model roundtable/i.test(text)) {
        settle.resolve({ stopReason: "end", structured: { answerMarkdown: "final synthesis" }, output: [] });
        return;
      }
      settle.resolve({ stopReason: "end", output: [{ type: "text", text: "independent answer" }] });
    });
    return { childId: spec.childId, result, dispose: async () => {} };
  };
  return { startActivation };
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

test("reading and exporting a v1 meeting never rewrites it", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const detail = await manager.create({ topic: "v1 话题", answerers: ROSTER, rounds: 0, workspace });
    await runToEnd(manager, detail);

    const file = join(workspace, ".roundtable", `${detail.id}.json`);
    const before = readFileSync(file, "utf8");
    const beforeStat = statSync(file);

    const readBack = manager.detail(workspace, detail.id);
    const summary = manager.list(workspace).meetings[0];
    const markdown = manager.markdown(workspace, detail.id);

    const after = readFileSync(file, "utf8");
    assert.equal(after, before, "detail/list/export do not write the record back");
    assert.equal(statSync(file).mtimeMs, beforeStat.mtimeMs, "mtime is untouched by reads");
    assert.equal(readBack.version, 1);
    assert.equal("protocol" in readBack, false, "v1 detail gains no protocol field");
    assert.equal("participants" in readBack, false, "v1 detail gains no participants field");
    assert.equal("protocol" in summary, false, "v1 summary gains no protocol field");
    assert.match(markdown, /v1 话题/u);

    const saved = manager.saveMarkdown(workspace, detail.id);
    assert.equal(saved.filename, `roundtable-${detail.id}.md`);
    assert.equal(readFileSync(saved.path, "utf8"), markdown);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a v2 meeting persists seats, persona snapshots and a protocol report", async () => {
  const workspace = makeWorkspace();
  try {
    const persona = new PersonaStore({ workspace }).save({
      id: "red-teamer",
      name: "Red teamer",
      mission: "Attack the proposal and name its failure modes.",
      lens: "adversarial",
    });
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), optInConfig);
    const detail = await manager.create({
      topic: "v2 话题",
      workspace,
      rounds: 0,
      protocol: { id: "roundtable", version: 2 },
      participants: [
        { id: "a1", provider: "p1", model: "p1-model", role: "answerer", personaId: persona.id },
        { id: "a2", provider: "p2", model: "p2-model", role: "answerer" },
        { id: "r1", provider: "p1", model: "p1-model", role: "reviewer" },
        { id: "j1", provider: "p2", model: "p2-model", role: "arbiter" },
      ],
    });
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.version, 2);
    assert.equal(final.protocol.id, "roundtable");
    assert.equal(final.protocol.version, 2);
    assert.equal(final.participants.length, 4);
    assert.equal(final.personaSnapshots["red-teamer"].name, "Red teamer");
    assert.equal(final.protocolState.stageCount, 3, "rounds=0 visits answering/reviewing/deciding");
    assert.equal(final.answers.length, 2);
    assert.ok(final.answers.every((answer) => typeof answer.participantId === "string"));
    assert.match(final.finalReport.markdown, /# Roundtable: v2 话题/);
    assert.match(final.finalReport.markdown, /final synthesis/);
    assert.equal(final.finalAnswer.text, "final synthesis");

    const onDisk = JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8"));
    assert.equal(onDisk.version, 2);
    assert.equal(onDisk.protocol.version, 2);
    assert.equal(onDisk.participants[0].personaName, "Red teamer");
    assert.equal(onDisk.personaSnapshots["red-teamer"].mission.includes("Attack"), true);
    assert.equal("handles" in onDisk, false, "protocol state never persists live handles");

    const summary = manager.list(workspace).meetings[0];
    assert.equal(summary.protocol.version, 2);
    assert.equal(typeof summary.stageCount, "number");

    const markdown = manager.markdown(workspace, detail.id);
    assert.match(markdown, /# Roundtable report/);
    assert.match(markdown, /## Participants/);
    assert.match(markdown, /persona: Red teamer/);
    assert.match(markdown, /## Final answer/);
    const saved = manager.saveMarkdown(workspace, detail.id);
    assert.equal(readFileSync(saved.path, "utf8"), markdown);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a request without protocol or participants stays on the v1 path", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), optInConfig);
    const detail = await manager.create({ topic: "still v1", answerers: ROSTER, rounds: 0, workspace });
    await runToEnd(manager, detail);
    const final = manager.detail(workspace, detail.id);
    assert.equal(final.version, 1);
    assert.equal("protocol" in final, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("v2 requests are validated before a record is created", async () => {
  const workspace = makeWorkspace();
  try {
    const offManager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const seats = [
      { id: "a1", provider: "p1", model: "p1-model", role: "answerer" },
      { id: "a2", provider: "p2", model: "p2-model", role: "answerer" },
    ];
    await assert.rejects(
      offManager.create({ topic: "x", workspace, participants: [{ ...seats[0], personaId: "red-teamer" }, seats[1]] }),
      (error) => error.code === "persona-not-supported" || error.status === 400,
    );
    await assert.rejects(
      offManager.create({ topic: "x", workspace, protocol: { id: "red-team", version: 1 }, answerers: ROSTER }),
      (error) => error.code === "unknown-protocol",
    );

    const onManager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), optInConfig);
    await assert.rejects(
      onManager.create({
        topic: "x",
        workspace,
        protocol: { id: "roundtable", version: 2 },
        participants: [seats[0], { ...seats[1], personaId: "missing-persona" }],
      }),
      (error) => error.code === "persona-unknown",
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});