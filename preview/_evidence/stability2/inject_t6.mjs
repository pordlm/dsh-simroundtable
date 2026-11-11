// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Independent behaviour injection for the stability round 2 verification (T6).
 *
 * Deliberately separate from test/*.test.mjs: it drives the same modules with
 * its own doubles and prints a machine-readable PASS/FAIL table, so the report
 * can quote evidence that was produced outside the authors' test files.
 *
 * No live model is called. `runTimeoutMs`/`childTimeoutMs` are 120 ms.
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeConfig, WEB_TOOLS } from "../../../lib/core.js";
import { copyFor } from "../../../lib/copy.js";
import { MeetingManager } from "../../../lib/meetings.js";
import { CHILD_STAGE, childPlans, runChild, runDeliberation, webToolsForStage } from "../../../lib/engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const ZH = copyFor("zh");
const config = normalizeConfig({ childTimeoutMs: 120, runTimeoutMs: 120, catalogTimeoutMs: 500 });
const LONG_CONFIG = normalizeConfig({ childTimeoutMs: 2_000, runTimeoutMs: 10_000, catalogTimeoutMs: 500 });

const results = [];
async function check(name, fn) {
  try {
    const evidence = await fn();
    results.push({ name, status: "PASS", evidence: evidence ?? "" });
    console.log(`PASS ${name} :: ${evidence ?? ""}`);
  } catch (error) {
    results.push({ name, status: "FAIL", evidence: String(error?.stack ?? error).split("\n").slice(0, 6).join(" | ") });
    console.log(`FAIL ${name} :: ${error?.message ?? error}`);
  }
}

const ROSTER = [{ provider: "p1", model: "p1-model" }, { provider: "p2", model: "p2-model" }];

function makeSpawner({ pending = false, capture } = {}) {
  const startActivation = (spec) => {
    if (capture) capture(spec);
    const text = String(spec.request?.prompt?.[0]?.text ?? "");
    let settle;
    const result = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    if (pending) {
      spec.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.code = "ABORT_ERR";
        settle.reject(error);
      }, { once: true });
      return { childId: spec.childId, result, dispose: async () => {} };
    }
    queueMicrotask(() => {
      if (/review model in a roundtable/i.test(text)) {
        settle.resolve({ stopReason: "end", structured: { ranking: ["A", "B"] }, output: [] });
        return;
      }
      if (/arbiter of a multi-model roundtable/i.test(text)) {
        settle.resolve({ stopReason: "end", structured: { answerMarkdown: "final synthesis" }, output: [] });
        return;
      }
      if (/revised final answer/i.test(text)) {
        settle.resolve({ stopReason: "end", output: [{ type: "text", text: `revised ${text.length}` }] });
        return;
      }
      settle.resolve({ stopReason: "end", output: [{ type: "text", text: "independent answer" }] });
    });
    return { childId: spec.childId, result, dispose: async () => {} };
  };
  return { startActivation };
}

function managerContext({ workspace, spawner, agents }) {
  const registered = [{ id: "ws-1", path: workspace, title: "Workspace" }];
  return {
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
    agents,
    get(name) {
      if (name === "workspaceRegistry") return { list: () => registered };
      if (name === "agents") return this.agents;
      return undefined;
    },
  };
}

function defaultAgents() {
  return {
    create: async () => ({
      agent: { id: "orchestrator", session: {} },
      dispose: async () => {},
    }),
    get: () => undefined,
  };
}

function makeManager({ workspace, spawner, agents, overrides }) {
  return new MeetingManager({
    ctx: managerContext({ workspace, spawner, agents: agents ?? defaultAgents() }),
    config: overrides === undefined ? config : normalizeConfig({ childTimeoutMs: 120, runTimeoutMs: 120, ...overrides }),
    copyFor: (locale) => copyFor(locale),
    resolveLocale: () => "zh",
  });
}

async function pollUntil(predicate, { steps = 200, wait = 10 } = {}) {
  for (let index = 0; index < steps; index += 1) {
    if (predicate()) return true;
    await new Promise((done) => setTimeout(done, wait));
  }
  return predicate();
}

function workspace_() {
  return mkdtempSync(join(tmpdir(), "t6-inject-"));
}

// ---------------------------------------------------------------------------
// T2: agents.create() can be interrupted by the whole-run deadline.
// ---------------------------------------------------------------------------
await check("T2a create() that never resolves: run fails as timedOut and frees its slot", async () => {
  const workspace = workspace_();
  try {
    const agents = { create: () => new Promise(() => {}), get: () => undefined };
    const manager = makeManager({ workspace, spawner: makeSpawner({ pending: true }), agents });
    const detail = await manager.create({ topic: "T2 卡死", answerers: ROSTER, rounds: 0, workspace });
    const run = manager.active.get(detail.id);
    assert.ok(run !== undefined, "run must be registered");

    const ended = await pollUntil(() => run.record.status !== "running" && run.record.status !== "queued");
    assert.ok(ended, `run stayed ${run.record.status}`);
    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "failed");
    const timedOut = ZH.meetingTimedOut.replace("{ms}", "120");
    assert.ok(final.failures.some((failure) => failure.message === timedOut), JSON.stringify(final.failures));
    assert.equal(manager.active.size, 0, "the concurrency slot must be released");
    return `status=failed failure=${JSON.stringify(timedOut)} active=${manager.active.size}`;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

await check("T2b a handle that arrives after the deadline is disposed exactly once", async () => {
  const workspace = workspace_();
  try {
    let release;
    let disposeCalls = 0;
    const agents = {
      create: () => new Promise((resolveCreate) => {
        release = () => resolveCreate({
          agent: { id: "late-orchestrator", session: {} },
          dispose: async () => { disposeCalls += 1; },
        });
      }),
      get: () => undefined,
    };
    const manager = makeManager({ workspace, spawner: makeSpawner({ pending: true }), agents });
    const detail = await manager.create({ topic: "T2 迟到", answerers: ROSTER, rounds: 0, workspace });
    const run = manager.active.get(detail.id);
    const ended = await pollUntil(() => run.record.status === "failed");
    assert.ok(ended, `run stayed ${run.record.status}`);
    assert.equal(disposeCalls, 0, "nothing exists to dispose yet");
    assert.equal(run.lateOrchestrators, 0, "no late handle counted yet");

    release();
    const disposed = await pollUntil(() => disposeCalls > 0);
    assert.ok(disposed, "the late handle was never disposed");
    assert.equal(disposeCalls, 1, `disposeCalls=${disposeCalls}`);
    assert.equal(run.lateOrchestrators, 1);
    return `disposeCalls=${disposeCalls} lateOrchestrators=${run.lateOrchestrators} active=${manager.active.size}`;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T1: the terminal record survives a broken filesystem, in memory.
// ---------------------------------------------------------------------------
await check("T1a 4 terminal write attempts, then a completed shadow; reconcile keeps completed", async () => {
  const workspace = workspace_();
  try {
    const manager = makeManager({ workspace, spawner: makeSpawner(), overrides: { childTimeoutMs: 5_000, runTimeoutMs: 30_000 } });
    const original = manager.write.bind(manager);
    const terminal = new Set(["completed", "failed", "cancelled", "interrupted"]);
    let terminalAttempts = 0;
    manager.write = (record, options) => {
      if (terminal.has(record.status)) {
        terminalAttempts += 1;
        const error = new Error("disk full");
        error.code = "ENOSPC";
        if (options?.strict) throw error;
        return false;
      }
      return original(record, options);
    };

    const detail = await manager.create({ topic: "T1 写盘失败", answerers: ROSTER, rounds: 0, workspace });
    const run = manager.active.get(detail.id);
    await run.promise;

    assert.equal(terminalAttempts, 4, `terminalAttempts=${terminalAttempts}`);
    assert.equal(manager.terminalShadow.size, 1, "a terminal shadow must remain");
    const shadow = [...manager.terminalShadow.values()][0];
    assert.equal(shadow.status, "completed");
    assert.equal(shadow.finalAnswer.text, "final synthesis");
    assert.equal(shadow.error, "disk full");
    assert.equal(manager.active.get(detail.id), run, "the run must stay active behind its shadow");

    const diskBefore = JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8"));
    assert.equal(diskBefore.status, "running", "the file is still the last progress snapshot");

    // The exact rewrite that used to destroy a finished meeting.
    const reconciled = manager.reconcile(diskBefore, ZH);
    assert.equal(reconciled.status, "completed");
    assert.equal(reconciled.finalAnswer.text, "final synthesis");
    assert.equal(reconciled.limitations.includes(ZH.meetingInterruptedNote), false);
    assert.equal(manager.detail(workspace, detail.id).status, "completed");
    assert.equal(manager.list(workspace).meetings[0].status, "completed");

    // The filesystem recovers: the next read heals the file and clears the shadow.
    manager.write = original;
    assert.equal(manager.detail(workspace, detail.id).status, "completed");
    assert.equal(manager.terminalShadow.size, 0);
    assert.equal(manager.active.size, 0);
    const healed = JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8"));
    assert.equal(healed.status, "completed");
    assert.equal(healed.finalAnswer.text, "final synthesis");
    return `attempts=${terminalAttempts} shadowCompleted=${shadow.status} reconciled=${reconciled.status} healed=${healed.status}`;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

await check("T1b a durable completed record is not rewritten as interrupted", async () => {
  const workspace = workspace_();
  try {
    const manager = makeManager({ workspace, spawner: makeSpawner(), overrides: { childTimeoutMs: 5_000, runTimeoutMs: 30_000 } });
    const detail = await manager.create({ topic: "T1 正常落盘", answerers: ROSTER, rounds: 0, workspace });
    await manager.active.get(detail.id).promise;
    const onDisk = JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8"));
    assert.equal(onDisk.status, "completed");
    const restarted = makeManager({ workspace, spawner: makeSpawner() });
    const readBack = restarted.detail(workspace, detail.id);
    assert.equal(readBack.status, "completed");
    assert.equal(readBack.limitations.includes(ZH.meetingInterruptedNote), false);
    return `disk=${onDisk.status} freshManager=${readBack.status}`;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T3: stage-specific web capability.
// ---------------------------------------------------------------------------
const DIRECTORY = {
  providers: ["p1", "p2"],
  models: [
    { key: "p1/p1-model", provider: "p1", providerName: "P1", model: "p1-model", modelName: "p1-model" },
    { key: "p2/p2-model", provider: "p2", providerName: "P2", model: "p2-model", modelName: "p2-model" },
  ],
  failures: [],
};

function directContext(capture) {
  const spawner = makeSpawner({ capture });
  return {
    logger: { warn() {} },
    subagents: {
      getProvider: () => ({
        name: "spawn",
        inheritsParentContext: false,
        capabilities: { agentOptions: true, outputSchema: true, depthLimit: true },
      }),
      startActivation: spawner.startActivation,
    },
  };
}

const STAGE_CASES = [
  { stage: CHILD_STAGE.answer, hasAttachments: false, web: true },
  { stage: CHILD_STAGE.answer, hasAttachments: true, web: false },
  { stage: CHILD_STAGE.discussion, hasAttachments: false, web: false },
  { stage: CHILD_STAGE.discussion, hasAttachments: true, web: false },
  { stage: CHILD_STAGE.review, hasAttachments: false, web: false },
  { stage: CHILD_STAGE.arbiter, hasAttachments: true, web: false },
];

await check("T3a webToolsForStage table", async () => {
  const rows = STAGE_CASES.map((entry) => {
    const actual = webToolsForStage(entry.stage, entry.hasAttachments);
    const expected = entry.web ? [...WEB_TOOLS] : [];
    assert.deepEqual(actual, expected, `${entry.stage}/${entry.hasAttachments}`);
    return `${entry.stage}${entry.hasAttachments ? "+attach" : ""}=[${actual.join(",")}]`;
  });
  return rows.join(" ");
});

// The plugin entry imports @deepseek-ai/dsh-llm, which only exists inside the
// harness install. Mirror apply.test.mjs: copy lib into a throwaway package with
// a one-function stub, then import the real restrictChildTools.
async function loadPluginCopy() {
  const dir = await mkdtemp(join(tmpdir(), "t6-plugin-"));
  await cp(join(ROOT, "lib"), join(dir, "lib"), { recursive: true });
  await cp(join(ROOT, "package.json"), join(dir, "package.json"));
  const stub = join(dir, "node_modules", "@deepseek-ai", "dsh-llm", "lib");
  await mkdir(stub, { recursive: true });
  await writeFile(
    join(dir, "node_modules", "@deepseek-ai", "dsh-llm", "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh-llm", version: "0.0.0", type: "module", exports: { ".": "./lib/index.js" } }),
  );
  await writeFile(join(stub, "index.js"), "export function createUserMessage(input) { return { ...input }; }\n");
  const module = await import(pathToFileURL(join(dir, "lib", "index.js")).href);
  return { module, dir };
}

function fakeToolAgent() {
  const visible = new Set(["web_search", "web_fetch", "write", "edit", "subagent"]);
  const record = { restricted: undefined, guard: undefined };
  return {
    record,
    agent: {
      ctx: {
        tools: {
          get: (name) => (visible.has(name) ? { name } : undefined),
          restrict(filter) {
            record.restricted = filter;
            const allow = new Set(filter?.allow ?? []);
            for (const name of [...visible]) if (!allow.has(name)) visible.delete(name);
            return () => {};
          },
          guard(fn) {
            record.guard = fn;
            return () => {};
          },
        },
      },
    },
  };
}

await check("T3b runChild plan carries the stage allow-list; restrictChildTools enforces it", async () => {
  const { module, dir } = await loadPluginCopy();
  try {
    let lastPlan;
    const spawner = makeSpawner({ capture: (spec) => { lastPlan = childPlans.get(spec.childId); } });
    const ctx = { logger: { warn() {} }, subagents: { getProvider: () => ({
      name: "spawn", inheritsParentContext: false,
      capabilities: { agentOptions: true, outputSchema: true, depthLimit: true },
    }), startActivation: spawner.startActivation } };
    const provider = ctx.subagents.getProvider();
    const entry = { key: "p1/m", provider: "p1", model: "m", modelName: "M" };
    const schema = { type: "object" };
    const seen = [];
    for (const entryCase of STAGE_CASES) {
      let plan;
      await runChild({
        ctx,
        config: LONG_CONFIG,
        parentAgent: { id: "parent", session: {} },
        provider,
        copy: ZH,
        signal: new AbortController().signal,
        stage: entryCase.stage,
        hasAttachments: entryCase.hasAttachments,
        stageLabel: entryCase.stage,
        entry,
        prompt: `${entryCase.stage} prompt`,
        outputSchema: entryCase.stage === CHILD_STAGE.review || entryCase.stage === CHILD_STAGE.arbiter ? schema : undefined,
      });
      // Capture the plan from the spawn itself: it is retired when runChild settles.
      plan = lastPlan;
      assert.ok(plan !== undefined, "plan was captured");
      const fake = fakeToolAgent();
      module.restrictChildTools(fake.agent, plan, ZH, []);
      const allow = [...(fake.record.restricted?.allow ?? [])];
      const expected = entryCase.web ? [...WEB_TOOLS] : [];
      assert.deepEqual(allow, expected, `${entryCase.stage}/${entryCase.hasAttachments} allow`);

      if (entryCase.web) {
        assert.equal(fake.record.guard({ name: "web_search" }), undefined);
        assert.equal(fake.record.guard({ name: "write" }), ZH.toolDenied);
      } else if (entryCase.stage === CHILD_STAGE.answer) {
        assert.equal(fake.record.guard({ name: "web_search" }), ZH.toolDeniedAttachments);
        assert.equal(fake.record.guard({ name: "web_fetch" }), ZH.toolDeniedAttachments);
      } else {
        assert.equal(fake.record.guard({ name: "web_search" }), ZH.toolDeniedStage);
        assert.equal(fake.record.guard({ name: "structured_output" }), entryCase.stage === CHILD_STAGE.discussion ? ZH.toolDeniedStage : undefined);
      }
      seen.push(`${entryCase.stage}${entryCase.hasAttachments ? "+attach" : ""}=[${allow.join(",")}]`);
    }
    return seen.join(" ");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

await check("T3c a meeting with an attachment denies web in every stage; a topic-only one keeps it in answers", async () => {
  async function runOne({ attachmentText }) {
    const captured = [];
    const ctx = directContext((spec) => captured.push({ plan: childPlans.get(spec.childId), prompt: spec.request?.prompt?.[0]?.text }));
    await runDeliberation({
      ctx,
      config: LONG_CONFIG,
      parentAgent: { id: "parent", session: {} },
      provider: ctx.subagents.getProvider(),
      directory: DIRECTORY,
      selection: {
        topic: "T3 集成",
        answerers: DIRECTORY.models,
        reviewers: [DIRECTORY.models[0]],
        arbiter: DIRECTORY.models[1],
        rounds: 0,
        autoArbiter: false,
        attachmentText,
      },
      copy: ZH,
      signal: new AbortController().signal,
    });
    return captured.map(({ plan, prompt }) => ({
      stage: plan?.stage,
      web: (plan?.webTools ?? []).join(","),
      denied: plan?.toolDenied,
      prompt: String(prompt ?? ""),
    }));
  }

  const attached = await runOne({ attachmentText: "attached evidence" });
  const plain = await runOne({ attachmentText: undefined });
  const stages = (rows) => rows.map((row) => row.stage).sort().join(",");

  assert.equal(stages(attached), "answer,answer,arbiter,review");
  for (const row of attached) {
    assert.equal(row.web, "", `${row.stage} must have no web tools when attached`);
    if (row.stage === CHILD_STAGE.answer) {
      assert.equal(row.denied, ZH.toolDeniedAttachments);
      assert.equal(/at most twice/u.test(row.prompt), false, "attached answer prompt must not invite web");
      assert.match(row.prompt, /Do not use web tools/u);
    } else {
      assert.equal(row.denied, ZH.toolDeniedStage);
    }
  }
  const plainAnswers = plain.filter((row) => row.stage === CHILD_STAGE.answer);
  assert.equal(plainAnswers.length, 2);
  for (const row of plainAnswers) {
    assert.equal(row.web, "web_search,web_fetch");
    assert.equal(row.denied, ZH.toolDenied);
    assert.match(row.prompt, /at most twice/u);
  }
  assert.ok(plain.filter((row) => row.stage !== CHILD_STAGE.answer).every((row) => row.web === ""));
  return `attached: ${attached.map((row) => `${row.stage}=[${row.web}]`).join(" ")} | plain answers=${plainAnswers.map((row) => `[${row.web}]`).join(" ")}`;
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\nSUMMARY pass=${results.length - failed.length} fail=${failed.length}`);
console.log(JSON.stringify(results, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
