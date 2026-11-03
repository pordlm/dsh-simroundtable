/**
 * Host-side integration tests for the meeting engine, the durable meeting
 * store, and the page API.
 *
 * These tests drive the real `runDeliberation` / `MeetingManager` /
 * `registerRoundtableApi` code with a fake subagent provider and a fake
 * Connection service, so they exercise the exact wiring the page uses without
 * a live model or a running Harness.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { normalizeConfig } from "../lib/core.js";
import { copyFor } from "../lib/copy.js";
import { MeetingManager, MeetingError } from "../lib/meetings.js";
import { runDeliberation } from "../lib/engine.js";
import { registerRoundtableApi } from "../lib/api.js";

const ZH = copyFor("zh");
const BASE_CONFIG = { childTimeoutMs: 5_000, runTimeoutMs: 30_000, catalogTimeoutMs: 2_000 };
const config = normalizeConfig(BASE_CONFIG);

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "roundtable-test-"));
}

/** A subagent provider double that answers by prompt shape. */
function makeSpawner({ pending = false, failArbiter = false } = {}) {
  const spawns = [];
  const startActivation = (spec) => {
    spawns.push(spec);
    const text = String(spec.request?.prompt?.[0]?.text ?? "");
    let settle;
    const result = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    const handle = {
      childId: spec.childId,
      result,
      dispose: async () => {},
    };
    if (pending) {
      spec.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.code = "ABORT_ERR";
        settle.reject(error);
      }, { once: true });
      return handle;
    }
    queueMicrotask(() => {
      if (/review model in a roundtable/i.test(text)) {
        settle.resolve({ stopReason: "end", structured: { ranking: ["A", "B"] }, output: [] });
        return;
      }
      if (/arbiter of a multi-model roundtable/i.test(text)) {
        if (failArbiter) {
          settle.reject(new Error("arbiter exploded"));
          return;
        }
        settle.resolve({ stopReason: "end", structured: { answerMarkdown: "final synthesis" }, output: [] });
        return;
      }
      if (/revised final answer/i.test(text)) {
        settle.resolve({ stopReason: "end", output: [{ type: "text", text: `revised ${text.length}` }] });
        return;
      }
      settle.resolve({ stopReason: "end", output: [{ type: "text", text: "independent answer" }] });
    });
    return handle;
  };
  return { spawns, startActivation };
}

function makeContext({ workspace, spawner, agents } = {}) {
  const created = [];
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
    agents: agents ?? {
      create: async (options) => {
        created.push(options);
        return { agent: { id: "orchestrator", session: {} }, dispose: async () => {} };
      },
      get: () => undefined,
    },
    get(name) {
      if (name === "workspaceRegistry") {
        return { list: () => [{ id: "ws-1", path: workspace, title: "Workspace" }] };
      }
      if (name === "agents") return this.agents;
      return undefined;
    },
    created,
  };
  return ctx;
}

function makeManager(ctx, overrides) {
  return new MeetingManager({
    ctx,
    config: overrides === undefined ? config : normalizeConfig({ ...BASE_CONFIG, ...overrides }),
    copyFor: (locale) => copyFor(locale),
    resolveLocale: () => "zh",
  });
}

const ROSTER = [{ provider: "p1", model: "p1-model" }, { provider: "p2", model: "p2-model" }];

test("a meeting runs the real engine and persists a completed record", async () => {
  const workspace = makeWorkspace();
  try {
    const spawner = makeSpawner();
    const manager = makeManager(makeContext({ workspace, spawner }));
    const detail = await manager.create({ topic: "测试话题", answerers: ROSTER, rounds: 0, workspace });
    // `create` returns as soon as the record is durable: the background run may
    // already have moved it to `running` before this assertion executes.
    assert.ok(detail.status === "queued" || detail.status === "running", detail.status);

    const run = manager.active.get(detail.id);
    assert.ok(run !== undefined);
    await run.promise;

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.answers.length, 2);
    assert.equal(final.finalAnswer.text, "final synthesis");
    assert.equal(final.finalAnswer.fallback, false);
    assert.equal(final.progress.percent, 100);
    assert.equal(final.transcript.length, 5);

    const onDisk = JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8"));
    assert.equal(onDisk.status, "completed");
    assert.equal(onDisk.topic, "测试话题");
    assert.equal(onDisk.answers.length, 2);

    const listed = manager.list(workspace);
    assert.equal(listed.meetings.length, 1);
    assert.equal(listed.meetings[0].id, detail.id);
    assert.equal(listed.meetings[0].status, "completed");
    assert.match(manager.markdown(workspace, detail.id), /测试话题/u);
    // The page numbers each reviewer's own ordering, so persisted votes are
    // rows rather than a bare id list; the export renders the same rows.
    assert.deepEqual(final.reviews[0].ranking, [
      { answerId: "A", averageRank: 1 },
      { answerId: "B", averageRank: 2 },
    ]);
    const markdown = manager.markdown(workspace, detail.id);
    assert.match(markdown, /- A → 1/);
    assert.match(markdown, /- B → 2/);

    // The export fallback writes a real file next to the record and reports the
    // path, so the page can show something the user can open.
    const saved = manager.saveMarkdown(workspace, detail.id);
    assert.equal(saved.filename, `roundtable-${detail.id}.md`);
    assert.equal(saved.path, join(workspace, ".roundtable", "exports", `roundtable-${detail.id}.md`));
    const written = readFileSync(saved.path, "utf8");
    assert.equal(written, markdown, "saved export equals the rendered markdown");
    assert.equal(saved.bytes, Buffer.byteLength(written, "utf8"));
    // Writing twice is idempotent and keeps the same path.
    const again = manager.saveMarkdown(workspace, detail.id);
    assert.equal(again.path, saved.path);
    assert.equal(readFileSync(again.path, "utf8"), markdown);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("saving an export for an unknown meeting reports a meeting error", () => {
  const workspace = makeWorkspace();
  try {
    mkdirSync(join(workspace, ".roundtable"), { recursive: true });
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    assert.throws(
      () => manager.saveMarkdown(workspace, "01234567-89ab-cdef-0123-456789abcdef"),
      (error) => error instanceof MeetingError && error.code === "meeting-not-found",
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("omitted reviewers default to the whole panel and self-review is disclosed", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const detail = await manager.create({ topic: "自评披露", answerers: ROSTER, workspace });
    await manager.active.get(detail.id).promise;
    const final = manager.detail(workspace, detail.id);
    assert.equal(final.roster.reviewers.length, 2);
    assert.ok(final.reviews.every((review) => review.selfReview === true));
    assert.ok(final.limitations.includes(ZH.limitationSelfReview));
    assert.equal(final.finalAnswer.fallback, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("an unknown model fails the meeting honestly instead of hanging", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const detail = await manager.create({
      topic: "坏模型",
      answerers: [{ provider: "p1", model: "missing-model" }, ROSTER[1]],
      workspace,
    });
    await manager.active.get(detail.id).promise;
    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "failed");
    assert.ok(final.failures.some((failure) => /missing-model/u.test(failure.message)));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("cancelling a live meeting aborts its children and keeps a cancelled record", async () => {
  const workspace = makeWorkspace();
  try {
    const spawner = makeSpawner({ pending: true });
    const manager = makeManager(makeContext({ workspace, spawner }));
    const detail = await manager.create({ topic: "取消我", answerers: ROSTER, rounds: 0, workspace });
    while (spawner.spawns.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));

    const cancelled = manager.cancel(workspace, detail.id);
    assert.equal(cancelled.status, "cancelled");
    await manager.active.get(detail.id).promise;
    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "cancelled");
    assert.ok(final.notes.includes(ZH.meetingCancelledNote));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a meeting that outlives its deadline fails instead of hanging", async () => {
  const workspace = makeWorkspace();
  try {
    // The children never answer, so only the deadlines can end the meeting.
    // The run timer is created first with the same delay, so it wins the race
    // and the meeting is recorded as a timed-out failure.
    const spawner = makeSpawner({ pending: true });
    const manager = makeManager(makeContext({ workspace, spawner }), { childTimeoutMs: 150, runTimeoutMs: 150 });
    const detail = await manager.create({ topic: "超时我", answerers: ROSTER, rounds: 0, workspace });
    while (spawner.spawns.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    // The plugin unrefs its own deadlines so a hung meeting cannot pin the
    // process; poll with a referenced timer instead of awaiting the run.
    let final = manager.detail(workspace, detail.id);
    for (let step = 0; step < 100 && final.status === "running"; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      final = manager.detail(workspace, detail.id);
    }

    assert.equal(final.status, "failed");
    assert.ok(
      final.failures.some((failure) => failure.message === ZH.meetingTimedOut.replace("{ms}", "150")),
      JSON.stringify(final.failures),
    );
    // The child was aborted, not left running in the background.
    assert.equal(manager.active.size, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a running record left by a dead process reads as interrupted", () => {
  const workspace = makeWorkspace();
  try {
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    mkdirSync(join(workspace, ".roundtable"), { recursive: true });
    writeFileSync(join(workspace, ".roundtable", `${id}.json`), JSON.stringify({
      version: 1,
      id,
      topic: "孤儿会议",
      workspace,
      status: "running",
      stage: "answering",
      createdAt: "2024-01-01T00:00:00.000Z",
      roster: { answerers: [], reviewers: [] },
      transcript: [],
      reviews: [],
      ranking: [],
      answers: [],
      failures: [],
      limitations: [],
      notes: [],
    }), "utf8");
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const listed = manager.list(workspace);
    assert.equal(listed.meetings.length, 1);
    assert.equal(listed.meetings[0].status, "interrupted");
    const detail = manager.detail(workspace, id);
    assert.ok(detail.limitations.includes(ZH.meetingInterruptedNote));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("the page API serves workspaces, catalog, meetings, detail and export", async () => {
  const workspace = makeWorkspace();
  const routes = new Map();
  try {
    const connection = {
      fetch: {
        // Connection allows exactly one route per path and throws on a repeat,
        // so the fake must be just as strict.
        register(route) {
          if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`);
          routes.set(route.path, route);
          return async () => {
            routes.delete(route.path);
          };
        },
      },
    };
    const ctx = makeContext({ workspace, spawner: makeSpawner() });
    const originalGet = ctx.get.bind(ctx);
    ctx.get = (name) => (name === "connection" ? connection : originalGet(name));
    const manager = makeManager(ctx);
    registerRoundtableApi(ctx, {
      ctx,
      config,
      manager,
      copyFor: (locale) => copyFor(locale),
      resolveLocale: () => "zh",
    });

    assert.deepEqual(
      [...routes.keys()]
        .filter((path) => !path.startsWith("/api/roundtable/stage/char/"))
        .sort(),
      [
        "/api/roundtable/capabilities",
        "/api/roundtable/catalog",
        "/api/roundtable/meeting",
        "/api/roundtable/meeting/cancel",
        "/api/roundtable/meeting/export",
        "/api/roundtable/meetings",
        "/api/roundtable/stage/art/chair.png",
        "/api/roundtable/stage/art/table.png",
        "/api/roundtable/stage/model/c_0120.moc3",
        "/api/roundtable/stage/model/c_0120.physics3.json",
        "/api/roundtable/stage/model/model3.json",
        "/api/roundtable/stage/model/textures/texture_00.png",
        "/api/roundtable/stage/model/textures/texture_01.png",
        "/api/roundtable/stage/vendor/cubism4.min.js",
        "/api/roundtable/stage/vendor/live2dcubismcore.min.js",
        "/api/roundtable/stage/vendor/pixi.min.js",
        "/api/roundtable/upload",
        "/api/roundtable/upload/remove",
        "/api/roundtable/workspaces",
      ],
      // Member rigs are local build output: their `stage/char/**` routes exist
      // only when the artefacts are on disk, so they are asserted by
      // test/stage.test.mjs instead of being pinned to this list.
    );
    assert.deepEqual(routes.get("/api/roundtable/meetings").methods, ["GET", "POST"]);

    const workspaces = await routes.get("/api/roundtable/workspaces")
      .fetch(new Request("http://localhost/api/roundtable/workspaces"));
    const workspacesBody = await workspaces.json();
    assert.equal(workspacesBody.ok, true);
    assert.equal(workspacesBody.data.defaultWorkspace, workspace);

    const catalog = await routes.get("/api/roundtable/catalog")
      .fetch(new Request("http://localhost/api/roundtable/catalog"));
    const catalogBody = await catalog.json();
    assert.equal(catalogBody.data.models.length, 2);
    assert.equal(catalogBody.data.defaults.rounds, 1);

    const create = await routes.get("/api/roundtable/meetings").fetch(new Request(
      "http://localhost/api/roundtable/meetings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: "页面会议", answerers: ROSTER, rounds: 0, workspace }),
      },
    ));
    assert.equal(create.status, 202);
    const created = await create.json();
    assert.equal(created.ok, true);
    const id = created.data.meeting.id;
    await manager.active.get(id).promise;

    const detail = await routes.get("/api/roundtable/meeting")
      .fetch(new Request(`http://localhost/api/roundtable/meeting?workspace=${encodeURIComponent(workspace)}&id=${id}`));
    const detailBody = await detail.json();
    assert.equal(detailBody.data.meeting.status, "completed");

    const exported = await routes.get("/api/roundtable/meeting/export")
      .fetch(new Request(`http://localhost/api/roundtable/meeting/export?workspace=${encodeURIComponent(workspace)}&id=${id}&format=md`));
    assert.match(exported.headers.get("content-type"), /text\/markdown/u);
    assert.match(exported.headers.get("content-disposition"), new RegExp(`roundtable-${id}\\.md`, "u"));
    assert.match(await exported.text(), /页面会议/u);

    const missing = await routes.get("/api/roundtable/meeting")
      .fetch(new Request(`http://localhost/api/roundtable/meeting?workspace=${encodeURIComponent(workspace)}&id=does-not-exist`));
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.equal(missingBody.ok, false);
    assert.equal(missingBody.error.code, "meeting-not-found");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("runDeliberation emits progress events and marks a failed arbiter as a fallback", async () => {
  const workspace = makeWorkspace();
  try {
    const spawner = makeSpawner({ failArbiter: true });
    const ctx = makeContext({ workspace, spawner });
    const events = [];
    const directory = {
      providers: ["p1", "p2"],
      models: [
        { key: "p1/p1-model", provider: "p1", providerName: "P1", model: "p1-model", modelName: "p1-model" },
        { key: "p2/p2-model", provider: "p2", providerName: "P2", model: "p2-model", modelName: "p2-model" },
      ],
      failures: [],
    };
    const data = await runDeliberation({
      ctx,
      config,
      parentAgent: { id: "parent", session: {} },
      provider: ctx.subagents.getProvider(),
      directory,
      selection: {
        topic: "回退测试",
        answerers: directory.models,
        reviewers: [directory.models[0]],
        arbiter: directory.models[1],
        rounds: 1,
        autoArbiter: false,
      },
      copy: ZH,
      signal: new AbortController().signal,
      hooks: { emit: (event) => events.push(event) },
    });

    assert.equal(data.finalFallback, true);
    assert.equal(data.arbiterResult, undefined);
    assert.ok(data.finalAnswerId !== undefined);
    assert.ok(data.limitations.includes(ZH.fallbackFinal));
    assert.equal(events.filter((event) => event.type === "stage").length >= 4, true);
    assert.equal(events.filter((event) => event.type === "member" && event.status === "failed").length, 1);
    assert.equal(data.roundsRun, 1);
    assert.ok(data.answers.every((answer) => answer.revised === 1));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
test("a review cut off at the completion limit keeps its vote", async () => {
  const directory = {
    providers: ["p1", "p2"],
    models: [
      { key: "p1/p1-model", provider: "p1", providerName: "P1", model: "p1-model", modelName: "p1-model" },
      { key: "p2/p2-model", provider: "p2", providerName: "P2", model: "p2-model", modelName: "p2-model" },
    ],
    failures: [],
  };
  const spawns = [];
  const ctx = {
    logger: { warn() {} },
    subagents: {
      getProvider: () => ({
        name: "spawn",
        inheritsParentContext: false,
        capabilities: { agentOptions: true, outputSchema: false, depthLimit: true },
      }),
      startActivation: (spec) => {
        spawns.push(spec);
        const text = String(spec.request?.prompt?.[0]?.text ?? "");
        let body;
        if (/review model in a roundtable/i.test(text)) {
          body = '{"evaluations":[],"consensus":[],"ranking":["B","A';
        } else if (/arbiter of a multi-model roundtable/i.test(text)) {
          body = JSON.stringify({ answerMarkdown: "synthesis", consensus: [], contradictions: [], blindSpots: [] });
        } else {
          body = "answer body";
        }
        return {
          childId: spec.childId,
          result: Promise.resolve({ stopReason: "length", output: [{ type: "text", text: body }] }),
          dispose: async () => {},
        };
      },
    },
  };
  const data = await runDeliberation({
    ctx,
    config,
    parentAgent: { id: "parent", session: {} },
    provider: ctx.subagents.getProvider(),
    directory,
    selection: {
      topic: "截断评审测试",
      answerers: directory.models,
      reviewers: [directory.models[0]],
      arbiter: directory.models[1],
      rounds: 0,
      autoArbiter: false,
    },
    copy: ZH,
    signal: new AbortController().signal,
  });

  assert.equal(data.failures.length, 0);
  assert.equal(data.reviews.length, 1);
  assert.equal(data.reviews[0].rankingSalvaged, true);
  assert.deepEqual(data.reviews[0].ranking, ["B", "A"]);
  assert.ok(data.notes.includes(ZH.rankingSalvagedNote));
  assert.equal(data.ranking[0].answerId, "B");
});
/** A provider double whose first attempt at a stage fails and whose retry succeeds. */
function makeRetrySpawner() {
  const spawns = [];
  return {
    spawns,
    startActivation: (spec) => {
      spawns.push(spec);
      const text = String(spec.request?.prompt?.[0]?.text ?? "");
      let body;
      if (/Rank the anonymized final answers below/i.test(text)) {
        body = '{"ranking":["B","A"]}';
      } else if (/review model in a roundtable/i.test(text)) {
        body = "I could not finish the comparison.";
      } else if (/as plain Markdown/i.test(text)) {
        body = "plain final answer";
      } else if (/arbiter of a multi-model roundtable/i.test(text)) {
        body = "I could not finish the final JSON object.";
      } else {
        body = "answer body";
      }
      return {
        childId: spec.childId,
        result: Promise.resolve({ stopReason: "length", output: [{ type: "text", text: body }] }),
        dispose: async () => {},
      };
    },
  };
}

const RETRY_DIRECTORY = {
  providers: ["p1", "p2"],
  models: [
    { key: "p1/p1-model", provider: "p1", providerName: "P1", model: "p1-model", modelName: "p1-model" },
    { key: "p2/p2-model", provider: "p2", providerName: "P2", model: "p2-model", modelName: "p2-model" },
  ],
  failures: [],
};

function retryContext(spawner) {
  return {
    logger: { warn() {} },
    subagents: {
      getProvider: () => ({
        name: "spawn",
        inheritsParentContext: false,
        capabilities: { agentOptions: true, outputSchema: false, depthLimit: true },
      }),
      startActivation: spawner.startActivation,
    },
  };
}

test("a reviewer that cannot finish its report falls back to a compact ranking retry", async () => {
  const spawner = makeRetrySpawner();
  const ctx = retryContext(spawner);
  const data = await runDeliberation({
    ctx,
    config,
    parentAgent: { id: "parent", session: {} },
    provider: ctx.subagents.getProvider(),
    directory: RETRY_DIRECTORY,
    selection: {
      topic: "评审重试测试",
      answerers: RETRY_DIRECTORY.models,
      reviewers: [RETRY_DIRECTORY.models[0]],
      arbiter: RETRY_DIRECTORY.models[1],
      rounds: 0,
      autoArbiter: false,
    },
    copy: ZH,
    signal: new AbortController().signal,
  });

  assert.equal(data.failures.length, 0);
  assert.equal(data.reviews.length, 1);
  assert.equal(data.reviews[0].rankingCompact, true);
  assert.deepEqual(data.reviews[0].ranking, ["B", "A"]);
  assert.ok(data.notes.includes(ZH.reviewCompactNote));
  assert.equal(data.ranking[0].answerId, "B");
  const prompts = spawner.spawns.map((spec) => String(spec.request?.prompt?.[0]?.text ?? ""));
  assert.equal(prompts.filter((text) => /Rank the anonymized final answers below/i.test(text)).length, 1);
});

test("an arbiter that cannot close its JSON still produces a plain-text final answer", async () => {
  const spawner = makeRetrySpawner();
  const ctx = retryContext(spawner);
  const data = await runDeliberation({
    ctx,
    config,
    parentAgent: { id: "parent", session: {} },
    provider: ctx.subagents.getProvider(),
    directory: RETRY_DIRECTORY,
    selection: {
      topic: "裁决重试测试",
      answerers: RETRY_DIRECTORY.models,
      reviewers: [RETRY_DIRECTORY.models[0]],
      arbiter: RETRY_DIRECTORY.models[1],
      rounds: 0,
      autoArbiter: false,
    },
    copy: ZH,
    signal: new AbortController().signal,
  });

  assert.deepEqual(data.failures, []);
  assert.equal(data.finalFallback, false);
  assert.equal(data.finalText, "plain final answer");
  assert.equal(data.arbiterResult.answerMarkdown, "plain final answer");
  assert.ok(data.notes.includes(ZH.arbiterPlainNote));
});