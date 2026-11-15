/**
 * Shared v2 meeting harness for the settlement/checkpoint/failure regression
 * suites. Mirrors the inline harness in settle-v2.test.mjs (which predates
 * this file and keeps its own copy) so each suite can spin up a full run.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { normalizeConfig } from "../../lib/core.js";
import { copyFor } from "../../lib/copy.js";
import { MeetingManager } from "../../lib/meetings.js";

export const ZH = copyFor("zh");
export const BASE_CONFIG = { childTimeoutMs: 5_000, runTimeoutMs: 30_000, catalogTimeoutMs: 2_000 };
export const config = normalizeConfig(BASE_CONFIG);
export const optInConfig = normalizeConfig({ ...BASE_CONFIG, personaBinding: "opt-in" });

export function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "roundtable-v2-"));
}

/** A subagent provider double that records every prompt and can fail answers. */
export function makeSpawner({ failAnswers = 0, failReviews = 0, failArbiter = 0 } = {}) {
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

export function makeContext({ workspace, spawner, providers = ["p1", "p2"] }) {
  const ctx = {
    logger: { warn() {} },
    llm: {
      listProviders: () => providers.map((id) => ({ id, name: id })),
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

export function makeManager(ctx, custom = config) {
  return new MeetingManager({
    ctx,
    config: custom,
    copyFor: (locale) => copyFor(locale),
    resolveLocale: () => "zh",
  });
}

export async function runToEnd(manager, detail) {
  const run = manager.active.get(detail.id);
  assert.ok(run !== undefined, "the run is registered while it works");
  await run.promise;
}

export function onDiskRecord(workspace, id) {
  return JSON.parse(readFileSync(join(workspace, ".roundtable", `${id}.json`), "utf8"));
}

/** Fake a pending upload the way the page's plugin would have written it. */
export function fakeUpload(workspace, manifest) {
  const id = manifest.id ?? randomUUID();
  const dir = join(workspace, ".roundtable", "uploads", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ id, workspace, ...manifest }));
  if (manifest.payloadBody !== undefined) {
    writeFileSync(join(dir, manifest.payload ?? "payload"), manifest.payloadBody);
  }
  return id;
}

export const SEATS = [
  { id: "a1", provider: "p1", model: "p1-model", role: "answerer" },
  { id: "a2", provider: "p2", model: "p2-model", role: "answerer" },
  { id: "r1", provider: "p1", model: "p1-model", role: "reviewer" },
  { id: "j1", provider: "p2", model: "p2-model", role: "arbiter" },
];

export function v2CreateInput(topic, seats, extra = {}) {
  return {
    topic,
    workspace: extra.workspace,
    rounds: 0,
    protocol: { id: "roundtable", version: 2 },
    participants: seats,
    ...extra,
  };
}
