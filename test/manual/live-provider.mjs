/**
 * Shared plumbing for the manual real-provider probes.
 *
 * The plugin normally reaches a model through the Harness subagent runtime.
 * Outside a live Harness there is no such runtime, so these helpers stand in
 * for exactly one layer — the transport — and keep everything above it real
 * (prompts, catalog shapes, JSON extraction, ranking, fallback, persistence).
 *
 * Credentials are read from the DSH credentials store at run time and never
 * printed. Override the store location with DSH_CREDENTIALS, the endpoint with
 * ROUNDTABLE_E2E_BASE_URL, and the secret name with ROUNDTABLE_E2E_SECRET.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Read a required environment variable or fail with an actionable message. */
export function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`set ${name} before running this manual probe (see test/manual/README.md)`);
  }
  return value.trim();
}

export const ENDPOINT = required("ROUNDTABLE_E2E_BASE_URL");
export const CREDENTIALS = process.env.DSH_CREDENTIALS
  ?? join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), ".credentials.yaml");

/** Parse ROUNDTABLE_E2E_ROSTER: a JSON array of { provider, model } entries. */
export function parseRoster(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`ROUNDTABLE_E2E_ROSTER is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length < 2) {
    throw new Error("ROUNDTABLE_E2E_ROSTER must be a JSON array with at least two models");
  }
  return parsed.map((entry) => {
    const provider = String(entry.provider ?? "");
    const model = String(entry.model ?? "");
    if (provider === "" || model === "") {
      throw new Error('every ROUNDTABLE_E2E_ROSTER entry needs "provider" and "model"');
    }
    return {
      provider,
      providerName: String(entry.providerName ?? provider),
      model,
      modelName: String(entry.modelName ?? model),
    };
  });
}

/** Read a key from ROUNDTABLE_E2E_KEY, or one named entry of the credentials store. */
export function readSecret(name = process.env.ROUNDTABLE_E2E_SECRET ?? "API_KEY") {
  const direct = process.env.ROUNDTABLE_E2E_KEY;
  if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
  const text = readFileSync(CREDENTIALS, "utf8");
  const match = new RegExp(`\\b${name}\\s*:\\s*([^\\s,}]+)`).exec(text);
  if (match === null) {
    throw new Error(`${name} is not present in the credentials store; set ROUNDTABLE_E2E_KEY instead`);
  }
  return match[1];
}

/** Minimal OpenAI-compatible chat call with usage accounting. */
export async function chat({ key, model, prompt, maxTokens, signal }) {
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

/**
 * A stand-in for the Harness subagent runtime that performs real model calls.
 * Every entry of `calls` records what the engine asked for and what came back.
 */
export function createLiveTransport({ key, calls }) {
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
      return {
        childId: spec.childId,
        result: Promise.resolve(result),
        async dispose() {},
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