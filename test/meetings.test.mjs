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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { normalizeConfig } from "../lib/core.js";
import { copyFor } from "../lib/copy.js";
import { storeUploads } from "../lib/attachments.js";
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

/**
 * Answering succeeds immediately; every later stage stalls until the run is
 * aborted. Used to pin the rule that a deadline reached *after* a successful
 * first stage fails the run instead of completing a degraded fallback.
 */
function makeStallingAfterAnswersSpawner() {
  const spawns = [];
  const startActivation = (spec) => {
    spawns.push(spec);
    const prompt = String(spec.request?.prompt?.[0]?.text ?? "");
    if (/^You are one participant in a multi-model roundtable/u.test(prompt)) {
      return {
        childId: spec.childId,
        result: Promise.resolve({ stopReason: "end", output: [{ type: "text", text: "independent answer" }] }),
        dispose: async () => {},
      };
    }
    let settle;
    const result = new Promise((_resolve, reject) => {
      settle = { reject };
    });
    spec.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.code = "ABORT_ERR";
      settle.reject(error);
    }, { once: true });
    return { childId: spec.childId, result, dispose: async () => {} };
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

test("a meeting whose first record cannot be persisted is never started", async () => {
  const workspace = makeWorkspace();
  try {
    // A file where the meeting directory belongs makes the very first write
    // fail. The request must fail as a whole: no run, no active entry, and no
    // model calls behind a meeting the page could never list.
    writeFileSync(join(workspace, ".roundtable"), "");
    const spawner = makeSpawner();
    const manager = makeManager(makeContext({ workspace, spawner }));

    await assert.rejects(
      () => manager.create({ topic: "写盘失败", answerers: ROSTER, rounds: 0, workspace }),
      (error) => error instanceof MeetingError && error.status === 500 && /写盘失败|会议启动失败/u.test(error.message),
    );
    assert.equal(spawner.spawns.length, 0, "no child may be spawned");
    assert.equal(manager.active.size, 0, "no run may be registered");
    assert.equal(manager.list(workspace).meetings.length, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a failed first record write hands adopted attachments back to the upload area", async () => {
  const workspace = makeWorkspace();
  try {
    const stored = await storeUploads({
      ctx: {},
      workspace,
      files: [{ name: "notes.md", mime: "text/plain", data: Buffer.from("# notes").toString("base64") }],
      copy: ZH,
      config,
    });
    const uploadId = stored.attachments[0].id;
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    // The upload moved into the meeting directory before the record write; a
    // failed write must put it back so the retry can reuse the same file.
    manager.write = () => {
      throw new Error("disk full");
    };

    await assert.rejects(
      () => manager.create({ topic: "写盘失败带附件", answerers: ROSTER, rounds: 0, workspace, attachments: [uploadId] }),
      (error) => error instanceof MeetingError && error.code === "meeting-persist-failed",
    );
    assert.ok(
      existsSync(join(workspace, ".roundtable", "uploads", uploadId, "manifest.json")),
      "the adopted attachment is back in the pending upload area",
    );
    const adoptedRoot = join(workspace, ".roundtable", "attachments");
    assert.ok(!existsSync(adoptedRoot) || readdirSync(adoptedRoot).length === 0, "no meeting attachment directory survives");
    assert.equal(manager.list(workspace).meetings.length, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a live meeting cannot be cancelled through another workspace", async () => {
  const workspace = makeWorkspace();
  const other = makeWorkspace();
  try {
    const spawner = makeSpawner({ pending: true });
    const manager = makeManager(makeContext({ workspace, spawner }));
    const detail = await manager.create({ topic: "别处取消", answerers: ROSTER, rounds: 0, workspace });
    const run = manager.active.get(detail.id);
    assert.ok(run !== undefined);
    while (spawner.spawns.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));

    // The active map is keyed by id alone, so the workspace has to be checked:
    // a foreign cancel must look exactly like an unknown meeting.
    assert.throws(
      () => manager.cancel(other, detail.id),
      (error) => error instanceof MeetingError && error.status === 404 && error.code === "meeting-not-found",
    );
    assert.equal(run.record.status, "running", "the live record is untouched");
    assert.equal(manager.detail(workspace, detail.id).status, "running");
    assert.ok(spawner.spawns.every((spec) => !spec.signal.aborted), "no child may be aborted");
    assert.equal(existsSync(join(other, ".roundtable")), false, "the foreign workspace is not written to");

    // The owning workspace still cancels normally.
    const cancelled = manager.cancel(workspace, detail.id);
    assert.equal(cancelled.status, "cancelled");
    await run.promise;
    assert.equal(manager.detail(workspace, detail.id).status, "cancelled");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
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

test("a deadline that hits a later stage fails the meeting instead of completing a fallback", async () => {
  const workspace = makeWorkspace();
  try {
    // The panel answers, then the review stage stalls. The whole-run deadline
    // must end the meeting as `failed`; the degraded fallback final answer must
    // never be persisted as a completed deliberation.
    const spawner = makeStallingAfterAnswersSpawner();
    const manager = makeManager(
      makeContext({ workspace, spawner }),
      { childTimeoutMs: 300, runTimeoutMs: 300 },
    );
    const detail = await manager.create({
      topic: "超时降级",
      answerers: ROSTER,
      reviewers: [ROSTER[0]],
      rounds: 0,
      workspace,
    });
    const run = manager.active.get(detail.id);
    assert.ok(run !== undefined);
    while (spawner.spawns.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));

    // The plugin unrefs its own deadlines, so poll with referenced timers.
    let final = manager.detail(workspace, detail.id);
    for (let step = 0; step < 200 && (final.status === "running" || final.status === "queued"); step += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      final = manager.detail(workspace, detail.id);
    }
    await run.promise;
    final = manager.detail(workspace, detail.id);

    assert.equal(final.status, "failed");
    assert.ok(
      final.failures.some((failure) => failure.message === ZH.meetingTimedOut.replace("{ms}", "300")),
      JSON.stringify(final.failures),
    );
    // The first stage really did answer before the deadline, which is exactly
    // the state that used to be settled as a completed fallback.
    assert.ok(
      final.transcript.some((entry) => entry.stage === "answering" && entry.text === "independent answer"),
      JSON.stringify(final.transcript),
    );
    // A dead run leaves no degraded final answer and no persisted answer rows.
    assert.equal(final.finalAnswer, null);
    assert.equal(final.answers.length, 0);
    const onDisk = JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8"));
    assert.equal(onDisk.status, "failed");
    assert.equal(manager.active.size, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("runDeliberation rejects instead of returning a degraded result after an abort", async () => {
  const spawner = makeStallingAfterAnswersSpawner();
  const controller = new AbortController();
  const ctx = retryContext(spawner);
  const outcome = runDeliberation({
    ctx,
    config,
    parentAgent: { id: "parent", session: {} },
    provider: ctx.subagents.getProvider(),
    directory: RETRY_DIRECTORY,
    selection: {
      topic: "中止测试",
      answerers: RETRY_DIRECTORY.models,
      reviewers: [RETRY_DIRECTORY.models[0]],
      arbiter: RETRY_DIRECTORY.models[1],
      rounds: 0,
      autoArbiter: false,
    },
    copy: ZH,
    signal: controller.signal,
  }).then(
    (data) => ({ data }),
    (error) => ({ error }),
  );

  // Two answers succeeded and a reviewer is already running: without the abort
  // gate the engine would turn the aborted arbiter into a fallback and resolve.
  while (spawner.spawns.length < 3) await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort(new Error("run deadline"));
  const settled = await outcome;
  assert.equal(settled.data, undefined);
  assert.ok(settled.error instanceof Error, "an aborted deliberation must reject");
  assert.match(settled.error.message, /run deadline/u);
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
    assert.equal(workspacesBody.data.workspaces[0].id, "ws-1");
    assert.equal(workspacesBody.data.workspaces[0].path, workspace);
    // The page's selector uses ids as option values, so the default it preselects
    // must be an id; the server maps that id back to the directory on every
    // request. A path here would leave the first visit showing the wrong option.
    assert.equal(workspacesBody.data.defaultWorkspace, "ws-1");

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
        // Start the meeting with the id the selector would send. The server has
        // to resolve it back to the workspace directory, exactly like a path.
        body: JSON.stringify({
          topic: "页面会议",
          answerers: ROSTER,
          rounds: 0,
          workspace: workspacesBody.data.defaultWorkspace,
        }),
      },
    ));
    assert.equal(create.status, 202);
    const created = await create.json();
    assert.equal(created.ok, true);
    const id = created.data.meeting.id;
    assert.equal(created.data.meeting.workspace, workspace, "the id resolved to the registered directory");
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

// ---------------------------------------------------------------------------
// Language selector: one meeting-wide language, honored by every stage.
// ---------------------------------------------------------------------------

/** Every prompt the fake provider was given, in spawn order. */
function promptsOf(spawner) {
  return spawner.spawns.map((spec) => String(spec.request?.prompt?.[0]?.text ?? ""));
}

const AUTO_LANGUAGE_RULE = /- Write (?:all prose )?in the same language as the topic\./u;
const ZH_LANGUAGE_RULE = /Simplified Chinese \(简体中文\)/u;
const EN_LANGUAGE_RULE = /- Write (?:all prose )?in English,/u;

/** Run one meeting to completion and return its final detail plus prompts. */
async function runWithLanguage(language) {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const manager = makeManager(makeContext({ workspace, spawner }));
  const input = { topic: "语言测试", answerers: ROSTER, rounds: 1, workspace };
  if (language !== undefined) input.language = language;
  const detail = await manager.create(input);
  const run = manager.active.get(detail.id);
  assert.ok(run !== undefined);
  await run.promise;
  return {
    workspace,
    detail,
    final: manager.detail(workspace, detail.id),
    summary: manager.list(workspace).meetings[0],
    onDisk: JSON.parse(readFileSync(join(workspace, ".roundtable", `${detail.id}.json`), "utf8")),
    prompts: promptsOf(spawner),
  };
}

test("an omitted language runs every stage with the topic-language rule", async () => {
  const outcome = await runWithLanguage(undefined);
  try {
    assert.equal(outcome.detail.language, "auto");
    assert.equal(outcome.final.language, "auto");
    assert.equal(outcome.summary.language, "auto");
    assert.equal(outcome.onDisk.language, "auto");

    // 2 answers + 2 revisions + 2 reviews + 1 arbiter: every stage, not just
    // the first answer, must carry the auto rule.
    assert.equal(outcome.prompts.length, 7);
    for (const prompt of outcome.prompts) {
      assert.match(prompt, AUTO_LANGUAGE_RULE);
      assert.doesNotMatch(prompt, ZH_LANGUAGE_RULE);
      assert.doesNotMatch(prompt, EN_LANGUAGE_RULE);
    }
  } finally {
    rmSync(outcome.workspace, { recursive: true, force: true });
  }
});

test("language zh forces Chinese in answers, revisions, reviews and the arbiter", async () => {
  const outcome = await runWithLanguage("zh");
  try {
    assert.equal(outcome.detail.language, "zh");
    assert.equal(outcome.final.language, "zh");
    assert.equal(outcome.summary.language, "zh");
    assert.equal(outcome.onDisk.language, "zh");

    assert.equal(outcome.prompts.length, 7);
    for (const prompt of outcome.prompts) {
      assert.match(prompt, ZH_LANGUAGE_RULE);
      assert.doesNotMatch(prompt, AUTO_LANGUAGE_RULE);
      // A Chinese topic must not be the thing that keeps the rule honest.
      assert.doesNotMatch(prompt, EN_LANGUAGE_RULE);
    }
  } finally {
    rmSync(outcome.workspace, { recursive: true, force: true });
  }
});

test("language en forces English even when the topic is Chinese", async () => {
  const outcome = await runWithLanguage("en");
  try {
    assert.equal(outcome.final.language, "en");
    assert.equal(outcome.prompts.length, 7);
    for (const prompt of outcome.prompts) {
      assert.match(prompt, EN_LANGUAGE_RULE);
      assert.doesNotMatch(prompt, AUTO_LANGUAGE_RULE);
      assert.doesNotMatch(prompt, ZH_LANGUAGE_RULE);
    }
  } finally {
    rmSync(outcome.workspace, { recursive: true, force: true });
  }
});

test("the page API accepts, persists and returns the meeting language", async () => {
  const workspace = makeWorkspace();
  const routes = new Map();
  try {
    const connection = {
      fetch: {
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

    const create = await routes.get("/api/roundtable/meetings").fetch(new Request(
      "http://localhost/api/roundtable/meetings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: "接口语言", answerers: ROSTER, rounds: 0, language: "en", workspace }),
      },
    ));
    assert.equal(create.status, 202);
    const created = await create.json();
    assert.equal(created.data.meeting.language, "en");
    const id = created.data.meeting.id;
    await manager.active.get(id).promise;

    const listed = await routes.get("/api/roundtable/meetings")
      .fetch(new Request(`http://localhost/api/roundtable/meetings?workspace=${encodeURIComponent(workspace)}`));
    const listBody = await listed.json();
    assert.equal(listBody.data.meetings[0].language, "en");

    const detail = await routes.get("/api/roundtable/meeting")
      .fetch(new Request(`http://localhost/api/roundtable/meeting?workspace=${encodeURIComponent(workspace)}&id=${id}`));
    const detailBody = await detail.json();
    assert.equal(detailBody.data.meeting.language, "en");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("an unknown language is rejected instead of silently becoming auto", async () => {
  const workspace = makeWorkspace();
  try {
    const spawner = makeSpawner();
    const manager = makeManager(makeContext({ workspace, spawner }));
    await assert.rejects(
      () => manager.create({ topic: "坏语言", answerers: ROSTER, rounds: 0, language: "fr", workspace }),
      (error) => error instanceof MeetingError && error.status === 400 && error.code === "invalid-request",
    );
    assert.equal(spawner.spawns.length, 0, "no child may be spawned");
    assert.equal(manager.active.size, 0);
    assert.equal(manager.list(workspace).meetings.length, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a record written before the language selector reads back as auto", () => {
  const workspace = makeWorkspace();
  try {
    const id = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    mkdirSync(join(workspace, ".roundtable"), { recursive: true });
    writeFileSync(join(workspace, ".roundtable", `${id}.json`), JSON.stringify({
      version: 1,
      id,
      topic: "旧记录",
      workspace,
      status: "completed",
      stage: "completed",
      rounds: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:01:00.000Z",
      roster: { answerers: [], reviewers: [] },
      transcript: [],
      reviews: [],
      ranking: [],
      answers: [],
      finalAnswer: null,
      failures: [],
      limitations: [],
      notes: [],
    }), "utf8");
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    assert.equal(manager.detail(workspace, id).language, "auto");
    assert.equal(manager.list(workspace).meetings[0].language, "auto");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("the concurrent-meeting cap is counted per workspace, not globally", async () => {
  const a = makeWorkspace();
  const b = makeWorkspace();
  const c = makeWorkspace();
  const spawner = makeSpawner({ pending: true });
  const manager = makeManager(makeContext({ workspace: a, spawner }), { maxConcurrentMeetings: 3 });
  const create = (workspace, topic) => manager.create({ topic, answerers: ROSTER, rounds: 0, workspace });
  try {
    // A already runs two meetings.
    await create(a, "A1");
    await create(a, "A2");
    // B runs one: three live runs in total, which used to fill a global cap.
    await create(b, "B1");
    assert.equal(manager.active.size, 3);

    // A different workspace still has its own budget, so it can start.
    const c1 = await create(c, "C1");
    assert.ok(manager.active.has(c1.id));

    // A's budget (3) still has one slot even though the global map holds four.
    const a3 = await create(a, "A3");
    assert.ok(manager.active.has(a3.id));

    // Only when *this* workspace is full does the request fail.
    await assert.rejects(
      () => create(a, "A4"),
      (error) => error instanceof MeetingError
        && error.status === 400
        && error.code === "meeting-too-many"
        && /3/u.test(error.message),
    );
    // B is unaffected by A being full.
    const b2 = await create(b, "B2");
    assert.ok(manager.active.has(b2.id));

    assert.equal(manager.activeIn(a), 3);
    assert.equal(manager.activeIn(b), 2);
    assert.equal(manager.activeIn(c), 1);
  } finally {
    await manager.dispose();
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
    rmSync(c, { recursive: true, force: true });
  }
});