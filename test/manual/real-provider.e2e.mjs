/**
 * Real-provider end-to-end probe for the roundtable engine.
 *
 * This is NOT a unit test and deliberately not part of `node --test`: it calls
 * the configured OpenAI-compatible endpoint with real credentials, so it costs
 * tokens and depends on network reachability. Run it manually:
 *
 *   node test/manual/real-provider.e2e.mjs
 *
 * What is real here:
 *   - the provider catalog shape, prompts, JSON extraction, ranking, fallback
 *     and limitation tracking all come from `lib/engine.js` + `lib/core.js`;
 *   - every model turn is a real HTTPS request to the configured provider with
 *     the exact `{ provider, model }` route the engine chose.
 *
 * What is simulated: only the subagent transport. `startActivation` is replaced
 * by a local function that performs the same model call a spawned child agent
 * would have performed, so the engine can run outside a live Harness process.
 *
 * Credentials are read from the DSH credentials store at run time and never
 * printed. Override the store location with DSH_CREDENTIALS or the endpoint with
 * ROUNDTABLE_E2E_BASE_URL / ROUNDTABLE_E2E_KEYS.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeConfig, textOfResult } from "../../lib/core.js";
import { copyFor } from "../../lib/copy.js";
import { runDeliberation } from "../../lib/engine.js";

import { parseRoster, required } from "./live-provider.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const ENDPOINT = required("ROUNDTABLE_E2E_BASE_URL");
const CREDENTIALS = process.env.DSH_CREDENTIALS
  ?? join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), ".credentials.yaml");

const ROSTER = parseRoster(required("ROUNDTABLE_E2E_ROSTER"));

const TOPIC = "用不超过 150 字回答：多模型圆桌（独立作答 + 互相修订 + 匿名评审）相比单模型一次性回答，主要能减少哪类错误？";

/** Read one named secret from the DSH credentials store without echoing it. */
function readSecret(name) {
  const text = readFileSync(CREDENTIALS, "utf8");
  const match = new RegExp(`\\b${name}\\s*:\\s*([^\\s,}]+)`).exec(text);
  if (match === null) throw new Error(`${name} is not present in the credentials store`);
  return match[1];
}

/** Minimal OpenAI-compatible chat call with usage accounting. */
async function chat({ key, model, prompt, maxTokens, signal }) {
  const started = Date.now();
  const response = await fetch(`${ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4,
      stream: false,
    }),
    signal,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`provider returned non-JSON body: ${body.slice(0, 200)}`);
  }
  const text = parsed?.choices?.[0]?.message?.content;
  const content = Array.isArray(text)
    ? text.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("")
    : typeof text === "string" ? text : "";
  const finish = parsed?.choices?.[0]?.finish_reason;
  const reasoning = parsed?.choices?.[0]?.message?.reasoning_content ?? parsed?.choices?.[0]?.message?.reasoning;
  if (content.trim() === "") {
    // Reasoning models can spend the whole completion budget on hidden
    // reasoning and return an empty visible message; surface that instead of a
    // bare "empty completion".
    throw new Error(
      `empty visible completion (finish_reason=${finish ?? "unknown"}, reasoning=${
        typeof reasoning === "string" ? reasoning.length : 0
      } chars, completion_tokens=${parsed?.usage?.completion_tokens ?? "?"})`,
    );
  }
  return {
    text: content,
    model: parsed?.model ?? model,
    usage: parsed?.usage ?? {},
    finish,
    reasoningChars: typeof reasoning === "string" ? reasoning.length : 0,
    ms: Date.now() - started,
  };
}

/** A stand-in for the Harness subagent runtime that performs real model calls. */
function createTransport({ key, calls }) {
  const provider = {
    name: "spawn",
    inheritsParentContext: false,
    capabilities: { agentOptions: true, agentPreset: false, outputSchema: false, depthLimit: true },
    async startActivation(spec) {
      const prompt = spec.request.prompt.map((block) => block.text ?? "").join("\n");
      const options = spec.request.agentOptions ?? {};
      const call = {
        label: spec.label,
        provider: options.provider,
        model: options.model,
        task: prompt.split("\n")[0].slice(0, 80),
      };
      calls.push(call);
      let result;
      try {
        const completion = await chat({
          key,
          model: options.model,
          prompt,
          maxTokens: options.maxTokens ?? 800,
          signal: spec.signal,
        });
        Object.assign(call, {
          ms: completion.ms,
          usage: completion.usage,
          finish: completion.finish,
          reasoningChars: completion.reasoningChars,
          chars: completion.text.length,
        });
        result = { output: [{ type: "text", text: completion.text }], model: completion.model };
      } catch (error) {
        call.error = String(error?.message ?? error);
        result = { output: [], diagnostic: call.error, stopReason: "error" };
      }
      let disposed = false;
      return {
        childId: spec.childId,
        result: Promise.resolve(result),
        async dispose() {
          disposed = true;
        },
      };
    },
  };
  const ctx = {
    subagents: {
      getProvider: (name) => (name === "spawn" ? provider : undefined),
      startActivation: (spec) => provider.startActivation(spec),
    },
  };
  return ctx;
}

const key = readSecret(process.env.ROUNDTABLE_E2E_SECRET ?? "API_KEY");
const config = normalizeConfig({
  language: "zh",
  answerMaxTokens: Number(process.env.ROUNDTABLE_E2E_ANSWER_TOKENS ?? 3_000),
  reviewMaxTokens: Number(process.env.ROUNDTABLE_E2E_REVIEW_TOKENS ?? 4_000),
  arbiterMaxTokens: Number(process.env.ROUNDTABLE_E2E_ARBITER_TOKENS ?? 4_000),
  childTimeoutMs: 180_000,
  runTimeoutMs: 600_000,
  maxConcurrentChildren: 2,
  maxAnswerChars: 8_000,
  stageInputChars: 4_000,
});
const copy = copyFor("zh");
const calls = [];
const ctx = createTransport({ key, calls });

const entries = ROSTER.map((entry) => ({
  ...entry,
  key: `${entry.provider}/${entry.model}`,
  description: "",
  label: `${entry.modelName} · ${entry.providerName}`,
}));

const providers = [...new Set(ROSTER.map((entry) => entry.provider))].map((id) => ({ id, name: id }));
const directory = { providers, models: entries, failures: [] };
const startedAt = Date.now();
const events = [];

const data = await runDeliberation({
  ctx,
  config,
  parentAgent: { id: "e2e-orchestrator", session: { requestHeader: () => undefined } },
  provider: ctx.subagents.getProvider("spawn"),
  directory,
  selection: {
    topic: TOPIC,
    answerers: entries,
    reviewers: entries,
    arbiter: entries[0],
    rounds: 1,
    autoArbiter: true,
  },
  copy,
  signal: new AbortController().signal,
  hooks: { emit: (event) => events.push(event) },
});

const totals = calls.reduce(
  (sum, call) => ({
    ms: sum.ms + (call.ms ?? 0),
    prompt: sum.prompt + (call.usage?.prompt_tokens ?? 0),
    completion: sum.completion + (call.usage?.completion_tokens ?? 0),
  }),
  { ms: 0, prompt: 0, completion: 0 },
);

const report = {
  ranAt: new Date().toISOString(),
  endpoint: ENDPOINT,
  topic: TOPIC,
  wallMs: Date.now() - startedAt,
  modelMs: totals.ms,
  tokens: { prompt: totals.prompt, completion: totals.completion },
  calls,
  stages: [...new Set(events.filter((event) => event.type === "stage").map((event) => event.stage))],
  answers: data.answers.map((answer) => ({
    id: answer.anonymousId,
    model: `${answer.entry.provider}/${answer.entry.model}`,
    chars: answer.text.length,
    revised: answer.revised,
  })),
  roundsRun: data.roundsRun,
  reviews: data.reviews.map((review) => ({
    reviewer: review.reviewerKey,
    selfReview: review.selfReview,
    ranking: review.ranking,
    note: review.note,
  })),
  ranking: data.ranking,
  final: {
    fallback: data.finalFallback,
    author: data.finalAuthor,
    chars: data.finalText.length,
    head: data.finalText.slice(0, 400),
  },
  failures: data.failures,
  limitations: data.limitations,
  notes: data.notes,
};

const outDir = join(here, "..", "..", ".e2e");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `real-${Date.now()}.json`);
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const text = textOfResult({ output: [{ type: "text", text: data.finalText }] });
console.log(JSON.stringify({ ...report, finalTextOk: text.length === data.finalText.length, outFile }, null, 2));