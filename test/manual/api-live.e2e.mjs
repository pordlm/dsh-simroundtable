/**
 * Page-API integration probe against real providers.
 *
 * This is NOT part of `node --test`: it calls the configured endpoint with real
 * credentials, so it costs tokens and needs network access. Run it manually:
 *
 *   node test/manual/api-live.e2e.mjs
 *
 * What is real: the whole host path the Web page uses — `registerRoundtableApi`
 * route handlers, the JSON envelope, `MeetingManager` (validation, durable
 * records, progress, cancellation) and `runDeliberation` (prompts, ranking,
 * fallback, limitations) with real model turns.
 *
 * What is simulated: the Connection service (an exact-Fetch route registry with
 * the same duplicate-path rule as the real one), the workspace registry, the
 * agent registry and the subagent transport. Those are the only parts a live
 * Harness process supplies; everything else is the shipped code.
 */

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeConfig } from "../../lib/core.js";
import { copyFor as buildCopy } from "../../lib/copy.js";
import { MeetingManager } from "../../lib/meetings.js";
import { API_BASE, registerRoundtableApi } from "../../lib/api.js";
import { createLiveTransport, parseRoster, readSecret, required } from "./live-provider.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", ".e2e");
mkdirSync(outDir, { recursive: true });
const workspace = join(outDir, `ws-api-${Date.now()}`);
mkdirSync(workspace, { recursive: true });

const ROSTER = parseRoster(required("ROUNDTABLE_E2E_ROSTER"));
const TOPIC = "用不超过 150 字回答：多模型圆桌相比单模型一次性回答，主要能减少哪类错误？";

const config = normalizeConfig({
  language: "zh",
  answerMaxTokens: Number(process.env.ROUNDTABLE_E2E_ANSWER_TOKENS ?? 3_000),
  reviewMaxTokens: Number(process.env.ROUNDTABLE_E2E_REVIEW_TOKENS ?? 2_500),
  arbiterMaxTokens: Number(process.env.ROUNDTABLE_E2E_ARBITER_TOKENS ?? 2_000),
  childTimeoutMs: 180_000,
  runTimeoutMs: 600_000,
  maxConcurrentChildren: 2,
  stageInputChars: 4_000,
  maxAnswerChars: 8_000,
});

const copy = buildCopy("zh");
const calls = [];
const transport = createLiveTransport({ key: readSecret(), calls });

/** The exact-Fetch route registry a live Connection service provides. */
const routes = new Map();
const connection = {
  fetch: {
    register(route) {
      if (routes.has(route.path)) {
        throw new Error(`connection: exact Fetch route ${JSON.stringify(route.path)} is already registered`);
      }
      routes.set(route.path, { methods: [...route.methods], requestBody: route.requestBody, fetch: route.fetch });
      return async () => {
        routes.delete(route.path);
      };
    },
  },
};

const registry = { list: () => [{ id: "ws-api", path: workspace, title: "API 联调工作区" }] };
const agents = {
  get: () => undefined,
  create: async ({ sessionId }) => ({ agent: { id: sessionId, session: {} }, dispose: async () => {} }),
};
const llm = {
  listProviders: () => [...new Set(ROSTER.map((entry) => entry.provider))].map((id) => ({ id, name: id })),
  listModels: async () => ROSTER.map((entry) => ({ id: entry.model, name: entry.model })),
};

const ctx = {
  logger: { warn() {} },
  llm,
  subagents: transport.subagents,
  get(name) {
    if (name === "connection") return connection;
    if (name === "workspaceRegistry") return registry;
    if (name === "agents") return agents;
    return undefined;
  },
};

const manager = new MeetingManager({
  ctx,
  config,
  copyFor: (locale) => buildCopy(locale),
  resolveLocale: () => "zh",
});
const disposeApi = registerRoundtableApi(ctx, {
  ctx,
  config,
  manager,
  copyFor: (locale) => buildCopy(locale),
  resolveLocale: () => "zh",
});

const ORIGIN = process.env.ROUNDTABLE_E2E_ORIGIN ?? "http://127.0.0.1:3000";

/** Dispatch one request exactly as Connection would after authentication. */
async function call(method, path, { query, body } = {}) {
  const url = new URL(`${ORIGIN}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  const route = routes.get(path);
  assert.ok(route !== undefined, `no route registered for ${path}`);
  assert.ok(route.methods.includes(method), `${path} does not accept ${method}`);
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await route.fetch(new Request(url, init));
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  return { status: response.status, headers: response.headers, text, payload };
}

function expectOk(result, label) {
  assert.equal(result.status, 200, `${label} answered ${result.status}: ${result.text.slice(0, 300)}`);
  assert.equal(result.payload?.ok, true, `${label} did not return the ok envelope: ${result.text.slice(0, 200)}`);
  return result.payload.data;
}

async function waitFor(id, { timeoutMs = 720_000, intervalMs = 3_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = expectOk(
      await call("GET", `${API_BASE}/meeting`, { query: { id, workspace } }),
      "detail",
    ).meeting;
    if (["completed", "failed", "cancelled", "interrupted"].includes(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`meeting ${id} did not settle in time; last status ${last?.status}`);
}

const startedAt = Date.now();
const report = { ranAt: new Date().toISOString(), workspace, topic: TOPIC, calls, checks: [] };
function check(label, fn) {
  fn();
  report.checks.push(label);
}

try {
  // 1. Workspace discovery ---------------------------------------------------
  const workspaces = expectOk(await call("GET", `${API_BASE}/workspaces`), "workspaces");
  check("workspaces returns the registry", () => {
    assert.equal(workspaces.workspaces.length, 1);
    assert.equal(workspaces.workspaces[0].path, workspace);
    assert.equal(workspaces.defaultWorkspace, workspace);
  });

  // 2. Catalog ---------------------------------------------------------------
  const catalog = expectOk(await call("GET", `${API_BASE}/catalog`), "catalog");
  check("catalog lists the roster and its limits", () => {
    assert.deepEqual(
      catalog.models.map((entry) => entry.key).sort(),
      ROSTER.map((entry) => `${entry.provider}/${entry.model}`).sort(),
    );
    assert.equal(catalog.defaults.rounds, 1);
    assert.equal(catalog.limits.maxAnswerers, 8);
    assert.equal(catalog.limits.maxRounds, config.maxRounds);
  });

  // 3. Empty history ---------------------------------------------------------
  const empty = expectOk(await call("GET", `${API_BASE}/meetings`, { query: { workspace } }), "meetings");
  check("history starts empty", () => assert.deepEqual(empty.meetings, []));

  // 4. Create → poll → completed --------------------------------------------
  const created = await call("POST", `${API_BASE}/meetings`, {
    body: { topic: TOPIC, answerers: ROSTER, rounds: 1, workspace },
  });
  assert.equal(created.status, 202, `create answered ${created.status}: ${created.text.slice(0, 300)}`);
  const meetingId = created.payload?.data?.meeting?.id;
  check("create answers 202 with a queued meeting", () => {
    assert.match(meetingId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/);
    assert.ok(["queued", "running"].includes(created.payload.data.meeting.status), created.payload.data.meeting.status);
    assert.equal(created.payload.data.meeting.roster.answerers.length, 2);
  });

  const completed = await waitFor(meetingId);
  report.meeting = completed;
  check("the meeting completes with answers, reviews and a final answer", () => {
    assert.equal(completed.status, "completed");
    assert.equal(completed.answers.length, 2);
    assert.equal(completed.finalAnswer.text.length > 0, true);
    assert.equal(completed.progress.percent, 100);
    assert.equal(completed.roster.answerers.every((member) => member.status === "done"), true);
  });
  check("detail carries every field the page reads", () => {
    for (const key of [
      "id", "topic", "status", "stage", "stageLabel", "rounds", "roundsRun", "workspace",
      "createdAt", "updatedAt", "roster", "progress", "transcript", "answers", "reviews",
      "ranking", "finalAnswer", "failures", "limitations", "notes", "autoArbiter",
    ]) {
      assert.ok(key in completed, `detail is missing ${key}`);
    }
    for (const key of ["stageIndex", "stageCount", "completed", "total", "percent", "members"]) {
      assert.ok(key in completed.progress, `progress is missing ${key}`);
    }
    for (const answer of completed.answers) {
      assert.equal(typeof answer.anonymousId, "string");
      assert.equal(typeof answer.text, "string");
      assert.ok("revised" in answer);
      assert.ok("provider" in answer && "model" in answer);
    }
    for (const review of completed.reviews) {
      assert.equal(typeof review.reviewerLabel, "string");
      assert.ok(Array.isArray(review.ranking));
      for (const vote of review.ranking) {
        assert.equal(typeof vote.answerId, "string");
        assert.equal(typeof vote.averageRank, "number");
        // A single reviewer's ordering has no vote count; when one is present
        // the page renders it, so keep the type honest.
        assert.ok(vote.votes === undefined || typeof vote.votes === "number");
      }
    }
    assert.ok("text" in completed.finalAnswer && "fallback" in completed.finalAnswer);
    for (const entry of completed.transcript) {
      assert.equal(typeof entry.seq, "number");
      assert.equal(typeof entry.stage, "string");
      assert.equal(typeof entry.text, "string");
    }
  });

  // 5. History and summary variant ------------------------------------------
  const history = expectOk(await call("GET", `${API_BASE}/meetings`, { query: { workspace } }), "history");
  check("history lists the finished meeting as a summary", () => {
    assert.equal(history.meetings.length, 1);
    const summary = history.meetings[0];
    for (const key of ["id", "topic", "status", "stage", "rounds", "createdAt", "updatedAt", "finalPreview"]) {
      assert.ok(key in summary, `summary is missing ${key}`);
    }
    assert.equal(summary.status, "completed");
  });
  const summaryOnly = expectOk(
    await call("GET", `${API_BASE}/meeting`, { query: { id: meetingId, workspace, include: "summary" } }),
    "summary detail",
  );
  check("include=summary returns the compact record", () => {
    assert.equal(summaryOnly.meeting.id, meetingId);
    assert.equal("answers" in summaryOnly.meeting, false);
  });

  // 6. Export ---------------------------------------------------------------
  const exported = await call("GET", `${API_BASE}/meeting/export`, {
    query: { id: meetingId, workspace, format: "md" },
  });
  check("export returns markdown as a download", () => {
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-type"), /text\/markdown/);
    assert.match(exported.headers.get("content-disposition"), new RegExp(`attachment; filename="roundtable-${meetingId}\\.md"`));
    assert.match(exported.text, /^# /);
    assert.ok(exported.text.includes(TOPIC));
    assert.ok(exported.text.length > 200);
  });
  report.exportChars = exported.text.length;
  const exportedJson = expectOk(
    await call("GET", `${API_BASE}/meeting/export`, { query: { id: meetingId, workspace, format: "json" } }),
    "export json",
  );
  check("export?format=json returns the markdown plus the record", () => {
    assert.equal(typeof exportedJson.markdown, "string");
    assert.equal(exportedJson.meeting.id, meetingId);
  });
  writeFileSync(join(outDir, `api-live-export-${meetingId}.md`), exported.text, "utf8");

  // 7. Cancellation ---------------------------------------------------------
  const second = await call("POST", `${API_BASE}/meetings`, {
    body: { topic: `${TOPIC}（取消测试）`, answerers: ROSTER, rounds: 2, workspace },
  });
  assert.equal(second.status, 202);
  const secondId = second.payload.data.meeting.id;
  const cancelled = expectOk(
    await call("POST", `${API_BASE}/meeting/cancel`, { body: { id: secondId, workspace } }),
    "cancel",
  );
  check("cancel marks a live meeting cancelled immediately", () => {
    assert.equal(cancelled.meeting.id, secondId);
    assert.equal(cancelled.meeting.status, "cancelled");
    assert.ok(cancelled.meeting.notes.some((note) => note.includes("取消")));
  });
  const settled = await waitFor(secondId, { timeoutMs: 120_000 });
  check("a cancelled meeting stays cancelled with its record intact", () => {
    assert.equal(settled.status, "cancelled");
    assert.equal(settled.stage, "cancelled");
  });

  // 8. Error envelopes ------------------------------------------------------
  const missing = await call("GET", `${API_BASE}/meeting`, { query: { id: "does-not-exist", workspace } });
  check("an unknown meeting id answers 404 meeting-not-found", () => {
    assert.equal(missing.status, 404);
    assert.equal(missing.payload?.ok, false);
    assert.equal(missing.payload.error.code, "meeting-not-found");
  });
  const badWorkspace = await call("GET", `${API_BASE}/meetings`, { query: { workspace: "/definitely/not/here" } });
  check("an unregistered workspace answers 400 workspace-not-registered", () => {
    assert.equal(badWorkspace.status, 400);
    assert.equal(badWorkspace.payload.error.code, "workspace-not-registered");
  });
  const badRoster = await call("POST", `${API_BASE}/meetings`, {
    body: { topic: TOPIC, answerers: [ROSTER[0]], workspace },
  });
  check("a one-model roster answers 400 invalid-roster", () => {
    assert.equal(badRoster.status, 400);
    assert.equal(badRoster.payload.error.code, "invalid-roster");
  });
  const badBody = await call("POST", `${API_BASE}/meetings`, { body: { topic: TOPIC, answerers: ROSTER, rounds: 99, workspace } });
  check("an out-of-range round count answers 400 invalid-round-count", () => {
    assert.equal(badBody.status, 400);
    assert.equal(badBody.payload.error.code, "invalid-round-count");
  });

  report.wallMs = Date.now() - startedAt;
  report.tokens = calls.reduce(
    (sum, call) => ({
      prompt: sum.prompt + (call.usage?.prompt_tokens ?? 0),
      completion: sum.completion + (call.usage?.completion_tokens ?? 0),
    }),
    { prompt: 0, completion: 0 },
  );
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await manager.dispose();
  await disposeApi();
}

const outFile = join(outDir, `api-live-${Date.now()}.json`);
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const summary = {
  ok: report.ok,
  checks: report.checks,
  wallMs: report.wallMs,
  tokens: report.tokens,
  meeting: report.meeting
    ? {
      id: report.meeting.id,
      status: report.meeting.status,
      answers: report.meeting.answers.map((answer) => ({
        id: answer.anonymousId,
        model: `${answer.provider}/${answer.model}`,
        chars: answer.text.length,
        revised: answer.revised,
      })),
      reviews: report.meeting.reviews.map((review) => ({
        reviewer: review.reviewerKey,
        selfReview: review.selfReview,
        votes: review.ranking.length,
        note: review.note,
      })),
      ranking: report.meeting.ranking,
      final: {
        fallback: report.meeting.finalAnswer.fallback,
        author: report.meeting.finalAnswer.authorLabel,
        chars: report.meeting.finalAnswer.text.length,
        head: report.meeting.finalAnswer.text.slice(0, 200),
      },
      failures: report.meeting.failures,
      limitations: report.meeting.limitations,
      notes: report.meeting.notes,
    }
    : undefined,
  error: report.error,
  outFile,
};
console.log(JSON.stringify(summary, null, 2));
if (report.ok === false) process.exitCode = 1;