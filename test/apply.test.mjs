/**
 * Integration-shaped test for the plugin `apply`/command path.
 *
 * The real DSH loader resolves `@deepseek-ai/dsh-llm` from the harness
 * installation, which is outside this workspace. This test copies the plugin
 * into a throwaway directory with a tiny stub for that one module, then drives
 * the command against a fake Cordis context so the orchestration (questions,
 * child spawns, tool restriction, retention, rendering) runs for real.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pluginRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const root = pluginRoot.replace(/[\\/]+$/, "");

async function loadPlugin() {
  const dir = await mkdtemp(join(root, ".tmp-apply-"));
  await cp(join(root, "lib"), join(dir, "lib"), { recursive: true });
  await cp(join(root, "package.json"), join(dir, "package.json"));
  const stub = join(dir, "node_modules", "@deepseek-ai", "dsh-llm", "lib");
  await mkdir(stub, { recursive: true });
  await writeFile(
    join(dir, "node_modules", "@deepseek-ai", "dsh-llm", "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh-llm", version: "0.0.0", type: "module", exports: { ".": "./lib/index.js" } }),
  );
  await writeFile(
    join(stub, "index.js"),
    "export function createUserMessage(input) { return { id: 'retention-message', ...input }; }\n",
  );
  const module = await import(pathToFileURL(join(dir, "lib", "index.js")).href);
  return { module, dir };
}

function fakeContext(options = {}) {
  const listeners = new Map();
  const command = { current: undefined };
  const tool = { current: undefined };
  const routes = new Map();
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
  const restricted = { current: undefined };
  let guard;
  let renamed;
  const followups = [];
  const pending = [];
  const warnings = [];
  const spawns = [];

  const parent = {
    id: "parent",
    session: { requestHeader: () => undefined },
    followup(message) {
      followups.push(message);
      pending.push((async () => {
        for (const handler of listeners.get("agent/pre-step") ?? []) {
          await handler({ agent: parent, messages: [message] }, async () => ({ kind: "enter", messages: [message] }));
        }
      })());
    },
    async whenIdle() {
      await Promise.all(pending);
    },
  };

  function childTools() {
    return {
      get(name) {
        return name === "web_search" || name === "web_fetch" ? { name } : undefined;
      },
      restrict(filter) {
        restricted.current = filter;
      },
      guard(fn) {
        guard = fn;
      },
    };
  }

  const provider = {
    inheritsParentContext: false,
    capabilities: { agentOptions: true, outputSchema: true, depthLimit: true },
  };

  const ctx = {
    logger: { warn: (message) => warnings.push(String(message)), info: () => {}, error: () => {} },
    settings: { describe: () => [] },
    commands: {
      register(definition) {
        command.current = definition;
        return () => {
          if (command.current === definition) command.current = undefined;
        };
      },
    },
    tools: {
      register(definition) {
        tool.current = definition;
        return () => {
          if (tool.current === definition) tool.current = undefined;
        };
      },
    },
    subagents: {
      getProvider: (name) => (name === "spawn" ? provider : undefined),
      async startActivation(spec) {
        spawns.push(spec);
        const child = {
          id: spec.childId,
          session: { requestHeader: () => undefined },
          ctx: { tools: childTools() },
        };
        for (const handler of listeners.get("agent/created") ?? []) handler({ agent: child });
        const prompt = spec.request.prompt[0].text;
        let result;
        if (prompt.includes("review model in a roundtable")) {
          const review = {
            evaluations: [{ answerId: "A", strengths: ["clear"], weaknesses: [] }],
            consensus: ["shared point"],
            contradictions: [],
            coverageGaps: [],
            uniqueInsights: [{ answerId: "A", insight: "unique" }],
            blindSpots: ["one blind spot"],
            ranking: ["A", "B"],
          };
          result = { output: [{ type: "text", text: JSON.stringify(review) }], structured: review, stopReason: "completed" };
        } else if (prompt.includes("arbiter of a multi-model roundtable")) {
          const arbiter = {
            answerMarkdown: "final synthesis",
            consensus: ["shared point"],
            contradictions: [],
            blindSpots: [],
            confidenceNotes: [],
          };
          result = { output: [], structured: arbiter, stopReason: "completed" };
        } else if (prompt.includes("write YOUR revised final answer")) {
          result = { output: [{ type: "text", text: `revised ${spec.request.agentOptions.provider}` }], stopReason: "completed" };
        } else {
          result = { output: [{ type: "text", text: `answer from ${spec.request.agentOptions.provider}` }], stopReason: "completed" };
        }
        return { result: Promise.resolve(result), dispose: async () => {} };
      },
    },
    llm: {
      listProviders: () => [{ id: "p1", name: "P1" }, { id: "p2", name: "P2" }],
      listModels: async (id) => [{ id: `${id}-model`, name: `${id.toUpperCase()} Model` }],
    },
    userQuestions: {
      async ask({ questions }) {
        const labels = questions.find((item) => item.id === "answerers").options.slice(1).map((option) => option.label);
        const rounds = questions.find((item) => item.id === "rounds").options[1].label;
        const answers = [
          { id: "answerers", selected: labels },
          { id: "reviewers", selected: ["自动：复用作答阵容"] },
          { id: "arbiter", selected: ["自动：第一位作答者"] },
          { id: "rounds", selected: [rounds] },
        ];
        if (questions.some((item) => item.id === "topic")) {
          answers.unshift({ id: "topic", selected: [], custom: "测试话题" });
        }
        return { answers };
      },
    },
    get(name) {
      if (name === "sessionProjections") {
        return { snapshot: () => ({ values: { sessionListMetadata: { blank: true } } }) };
      }
      if (name === "sessionTitle") {
        return { rename: (_session, title) => { renamed = title; } };
      }
      if (name === "connection") return connection;
      if (name === "agents") return options.agents;
      if (name === "workspaceRegistry" && options.workspace !== undefined) {
        return { list: () => [{ id: "ws-1", path: options.workspace, title: "Workspace" }] };
      }
      return undefined;
    },
    inject(deps, callback) {
      // Cordis starts the callback once every dependency is active; here the
      // fake connection is always available, so apply it immediately.
      if (Array.isArray(deps) && deps.includes("connection")) return callback(ctx);
      return () => {};
    },
    on(event, handler, options) {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
      return () => {
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
      };
    },
    effect(execute) {
      const dispose = execute();
      return () => {
        if (typeof dispose === "function") return dispose();
        return undefined;
      };
    },
  };

  return {
    ctx,
    parent,
    command,
    tool,
    restricted,
    routes,
    get guard() {
      return guard;
    },
    followups,
    renamed: () => renamed,
    warnings,
    spawns,
  };
}

test("apply registers /roundtable and runs a cross-provider round", async () => {
  const { module, dir } = await loadPlugin();
  try {
    const fake = fakeContext();
    module.apply(fake.ctx, { language: "zh" });
    assert.ok(fake.command.current, "command should be registered");
    assert.equal(fake.command.current.name, "roundtable");

    const result = await fake.command.current.handler({
      agent: fake.parent,
      signal: new AbortController().signal,
      rawInput: "",
    });

    assert.equal(result.kind, "success");
    assert.match(result.text, /# 圆桌讨论结果/);
    assert.match(result.text, /测试话题/);
    assert.match(result.text, /final synthesis/);
    assert.match(result.text, /revised p1/);
    assert.match(result.text, /revised p2/);
    assert.match(result.text, /P1 Model/);
    assert.match(result.text, /P2 Model/);

    // Seven children: 2 answers + 2 revisions + 2 reviews + 1 arbiter.
    assert.equal(fake.spawns.length, 7);
    assert.equal(fake.spawns[0].delivery, "caller");
    assert.ok(["p1", "p2"].includes(fake.spawns[0].request.agentOptions.provider));
    assert.deepEqual(
      new Set(fake.spawns.slice(0, 2).map((spec) => spec.request.agentOptions.provider)),
      new Set(["p1", "p2"]),
    );
    assert.ok(fake.spawns[0].request.agentOptions.model);
    assert.equal(fake.spawns[0].request.maxDepth, 1);

    // The first child gets a web-only allow-list; later review/arbiter children
    // get the same list plus structured_output through the guard.
    assert.deepEqual(fake.restricted.current, { allow: ["web_search", "web_fetch"] });
    assert.equal(fake.guard({ name: "write" }), "圆桌讨论的子任务只允许使用 web_search / web_fetch。");
    assert.equal(fake.guard({ name: "web_search" }), undefined);
    assert.equal(fake.guard({ name: "run_code" }), undefined);
    assert.equal(fake.guard({ name: "structured_output" }), undefined);

    // Blank-session retention ran once and renamed the session.
    assert.equal(fake.followups.length, 1);
    assert.deepEqual(fake.followups[0].content, []);
    assert.equal(fake.followups[0].source.kind, "user");
    assert.equal(fake.renamed(), "圆桌讨论");
    assert.deepEqual(fake.warnings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("apply accepts a topic typed after the command", async () => {
  const { module, dir } = await loadPlugin();
  try {
    const fake = fakeContext();
    module.apply(fake.ctx, { language: "zh" });
    const result = await fake.command.current.handler({
      agent: fake.parent,
      signal: new AbortController().signal,
      rawInput: "  直接给出的议题  ",
    });
    assert.equal(result.kind, "success");
    assert.match(result.text, /直接给出的议题/);
    // No topic card was asked, but the panel cards still were.
    assert.ok(fake.spawns.length >= 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("roundtable tool auto-picks a panel and returns model-facing markdown", async () => {
  const { module, dir } = await loadPlugin();
  try {
    const fake = fakeContext();
    module.apply(fake.ctx, { language: "zh" });
    assert.ok(fake.tool.current, "tool should be registered");
    assert.equal(fake.tool.current.name, "roundtable");

    const value = await fake.tool.current.execute(
      { topic: "工具话题" },
      { agent: fake.parent, signal: new AbortController().signal },
    );

    assert.match(value.markdown, /# 圆桌讨论结果/);
    assert.match(value.markdown, /工具话题/);
    assert.match(value.finalAnswer, /final synthesis/);
    assert.equal(value.providers.length, 2);
    assert.equal(value.models.length, 2);
    assert.deepEqual(value.failures, []);
    assert.equal(fake.spawns.length, 7);
    // The tool path never opens the panel question and never retains a blank session.
    assert.equal(fake.followups.length, 0);

    const view = fake.tool.current.presentResult({ topic: "工具话题" }, { isError: false, content: [] });
    assert.equal(view.title, "圆桌讨论");
    assert.match(view.content[0].text, /完成/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("apply serves the page API once Connection is available", async () => {
  const { module, dir } = await loadPlugin();
  const workspace = await mkdtemp(join(root, ".tmp-ws-"));
  try {
    const fake = fakeContext({
      workspace,
      agents: {
        create: async () => ({ agent: { id: "orchestrator", session: {} }, dispose: async () => {} }),
        get: () => undefined,
      },
    });
    module.apply(fake.ctx, { language: "zh" });
    assert.deepEqual([...fake.routes.keys()].sort(), [
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
    ]);

    const create = await fake.routes.get("/api/roundtable/meetings").fetch(new Request(
      "http://localhost/api/roundtable/meetings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: "页面全链路",
          answerers: [{ provider: "p1", model: "p1-model" }, { provider: "p2", model: "p2-model" }],
          rounds: 0,
        }),
      },
    ));
    assert.equal(create.status, 202);
    const id = (await create.json()).data.meeting.id;

    let detail;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await fake.routes.get("/api/roundtable/meeting").fetch(new Request(
        `http://localhost/api/roundtable/meeting?id=${id}&workspace=${encodeURIComponent(workspace)}`,
      ));
      detail = (await response.json()).data.meeting;
      if (detail.status === "completed" || detail.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(detail.status, "completed");
    assert.equal(detail.finalAnswer.text, "final synthesis");
    assert.equal(detail.answers.length, 2);

    // GET returns the attachment; POST writes the file and reports its path —
    // the page falls back to it when the shell offers no save dialog.
    const exportRoute = fake.routes.get("/api/roundtable/meeting/export");
    assert.deepEqual(exportRoute.methods, ["GET", "POST"]);
    const download = await exportRoute.fetch(new Request(
      `http://localhost/api/roundtable/meeting/export?id=${id}&workspace=${encodeURIComponent(workspace)}&format=md`,
    ));
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition") ?? "", new RegExp(`roundtable-${id}\\.md`));
    const downloadedMarkdown = await download.text();
    assert.match(downloadedMarkdown, /页面全链路/u);

    const savedResponse = await exportRoute.fetch(new Request(
      "http://localhost/api/roundtable/meeting/export",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, workspace }),
      },
    ));
    assert.equal(savedResponse.status, 200);
    const saved = (await savedResponse.json()).data;
    assert.equal(saved.filename, `roundtable-${id}.md`);
    assert.equal(saved.path, join(workspace, ".roundtable", "exports", `roundtable-${id}.md`));
    assert.equal(readFileSync(saved.path, "utf8"), downloadedMarkdown);
    assert.equal(saved.bytes, Buffer.byteLength(downloadedMarkdown, "utf8"));

    // An unknown meeting keeps the envelope and a 404 code.
    const missing = await exportRoute.fetch(new Request(
      "http://localhost/api/roundtable/meeting/export",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "01234567-89ab-cdef-0123-456789abcdef", workspace }),
      },
    ));
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.equal(missingBody.ok, false);
    assert.equal(missingBody.error.code, "meeting-not-found");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});