// SPDX-License-Identifier: GPL-3.0-or-later
// Host half; client half lives in lib/client.js.
/**
 * dsh-simroundtable — a cross-provider agent roundtable for DSH.
 *
 * Flow: independent answers → optional peer-revision rounds → anonymous
 * reviews → final arbiter. Every participant is a fresh child Agent spawned
 * with an explicit `{ provider, model }` route, so one table can mix models
 * from every registered provider.
 *
 * This is a ground-up rewrite against DSH 0.2.1-rc.4; see README.md for the
 * dsh-Council interfaces that changed.
 */

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { registerRoundtableApi } from "./api.js";
import { copyFor, detectLocale } from "./copy.js";
import {
  WEB_TOOLS,
  autoPick,
  autoTarget,
  buildDirectory,
  errorCode,
  formatResult,
  independentArbiter,
  independentReviewers,
  messageOf,
  normalizeConfig,
  render,
  resolveChoice,
  shortMessage,
} from "./core.js";
import {
  activeHandles,
  childPlans,
  isRefusedChild,
  requireSubagentProvider,
  retireChildPlan,
  settleRefusedChild,
  runDeliberation,
} from "./engine.js";
import { MeetingManager } from "./meetings.js";

export const name = "dsh-simroundtable";

export const inject = ["commands", "llm", "subagents", "userQuestions", "tools"];

/** Resolve the UI locale from config or the live profile preference. */
function localeOf(ctx, config) {
  if (config.language === "zh" || config.language === "en") return config.language;
  return detectLocale(ctx);
}

function cancelledError(copy) {
  const error = new Error(copy.cancelled);
  error.code = "ROUNDTABLE_CANCELLED";
  return error;
}

// Per-activation state. The plugin fiber owns all of it; the lifecycle
// controller cancels children when the plugin is disposed or hot-reloaded.
const activeAgents = new Set();
const activeOperations = new Set();
const blankRetentions = new Map();
const lifecycle = new AbortController();

/** The blank-session projection the Web session list uses, with a safe fallback. */
function blankState(ctx, agent) {
  try {
    const projections = ctx.get("sessionProjections");
    const metadata = projections?.snapshot?.(agent.session)?.values?.sessionListMetadata;
    if (metadata !== undefined && metadata !== null && typeof metadata.blank === "boolean") {
      return metadata.blank;
    }
  } catch {
    // The projection is optional outside the Web API composition.
  }
  try {
    return agent.session.requestHeader() === undefined;
  } catch {
    return undefined;
  }
}

/** Promote a provisional New Session without issuing another model request. */
async function retainBlankSession(ctx, agent, copy) {
  if (blankState(ctx, agent) !== true) return false;
  const message = createUserMessage({
    content: [],
    source: { kind: "user" },
  });
  const retention = { messageId: String(message.id), consumed: false };
  const agentId = String(agent.id);
  blankRetentions.set(agentId, retention);
  try {
    agent.followup(message);
    await agent.whenIdle();
  } finally {
    blankRetentions.delete(agentId);
  }
  if (!retention.consumed) throw new Error("retention turn was not consumed");
  try {
    ctx.get("sessionTitle")?.rename?.(agent.session, copy.sessionTitle);
  } catch {
    // A title is cosmetic; never fail the roundtable over it.
  }
  return true;
}

/** Build the question cards, with every model tagged by provider. */
function buildQuestions(directory, copy, presetTopic) {
  const modelOptions = directory.models.map((entry) => ({
    label: entry.label,
    description: entry.key,
  }));
  const q = copy.questions;
  const questions = [
    ...(presetTopic === ""
      ? [{
          id: "topic",
          header: q.topicHeader,
          question: q.topicQuestion,
          detail: q.topicDetail,
        }]
      : []),
    {
      id: "answerers",
      header: q.answerersHeader,
      question: q.answerersQuestion,
      detail: q.answerersDetail,
      multiSelect: true,
      options: [{ label: q.autoAnswerers, description: q.autoAnswerersDesc }, ...modelOptions],
    },
    {
      id: "reviewers",
      header: q.reviewersHeader,
      question: q.reviewersQuestion,
      detail: q.reviewersDetail,
      multiSelect: true,
      options: [{ label: q.autoReviewers, description: q.autoReviewersDesc }, ...modelOptions],
    },
    {
      id: "arbiter",
      header: q.arbiterHeader,
      question: q.arbiterQuestion,
      detail: q.arbiterDetail,
      options: [{ label: q.autoArbiter, description: q.autoArbiterDesc }, ...modelOptions],
    },
    {
      id: "rounds",
      header: q.roundsHeader,
      question: q.roundsQuestion,
      detail: q.roundsDetail,
      options: [{ label: q.round0 }, { label: q.round1 }, { label: q.round2 }],
    },
  ];
  return questions;
}

function answerItem(items, id, copy) {
  const item = items.get(id);
  if (item === undefined) throw new Error(render(copy.badAnswerItem, { id }));
  return item;
}

function resolveRounds(item, copy) {
  const choices = [
    { value: 0, label: copy.questions.round0 },
    { value: 1, label: copy.questions.round1 },
    { value: 2, label: copy.questions.round2 },
  ];
  const selected = Array.isArray(item?.selected) ? item.selected : [];
  for (const label of selected) {
    const found = choices.find((choice) => choice.label === label);
    if (found !== undefined) return found.value;
  }
  const custom = typeof item?.custom === "string" ? item.custom.trim() : "";
  if (/^[012]$/u.test(custom)) return Number(custom);
  throw new Error(copy.invalidRounds);
}

/** Ask the user for the topic, panel, reviewer panel, arbiter, and round count. */
async function askSelection(ctx, agent, directory, copy, signal, presetTopic) {
  const shared = AbortSignal.any([signal, lifecycle.signal]);
  const answer = await ctx.userQuestions.ask({
    agent,
    questions: buildQuestions(directory, copy, presetTopic),
    signal: shared,
  });
  const answers = Array.isArray(answer?.answers) ? answer.answers : [];
  if (answers.length === 0) throw cancelledError(copy);
  const items = new Map(answers.map((item) => [item.id, item]));

  let topic = presetTopic;
  if (topic === "") {
    const topicItem = answerItem(items, "topic", copy);
    topic = String(topicItem.custom ?? "").trim()
      || (Array.isArray(topicItem.selected) ? topicItem.selected.join(" ").trim() : "");
  }
  if (topic === "") throw new Error(copy.invalidTopic);

  const answerersChoice = resolveChoice(answerItem(items, "answerers", copy), directory, copy.questions.autoAnswerers);
  if (answerersChoice.unknown.length > 0) {
    throw new Error(render(copy.unknownSelection, { label: answerersChoice.unknown[0] }));
  }
  const answerers = answerersChoice.auto
    ? autoPick(directory, autoTarget(directory))
    : answerersChoice.entries;
  if (answerers.length < 2 || answerers.length > 8) {
    throw new Error(render(copy.invalidAnswerers, { n: answerers.length }));
  }

  const reviewersChoice = resolveChoice(answerItem(items, "reviewers", copy), directory, copy.questions.autoReviewers);
  if (reviewersChoice.unknown.length > 0) {
    throw new Error(render(copy.unknownSelection, { label: reviewersChoice.unknown[0] }));
  }
  const reviewers = reviewersChoice.auto ? [...answerers] : reviewersChoice.entries;
  if (reviewers.length < 1 || reviewers.length > 8) {
    throw new Error(render(copy.invalidReviewers, { n: reviewers.length }));
  }

  const arbiterChoice = resolveChoice(answerItem(items, "arbiter", copy), directory, copy.questions.autoArbiter);
  if (arbiterChoice.unknown.length > 0) {
    throw new Error(render(copy.unknownSelection, { label: arbiterChoice.unknown[0] }));
  }
  if (!arbiterChoice.auto && arbiterChoice.entries.length !== 1) {
    throw new Error(copy.invalidArbiter);
  }
  const arbiter = arbiterChoice.auto ? answerers[0] : arbiterChoice.entries[0];
  if (arbiter === undefined) throw new Error(copy.invalidArbiter);

  return {
    topic,
    answerers,
    reviewers,
    arbiter,
    rounds: resolveRounds(answerItem(items, "rounds", copy), copy),
  };
}

async function executeRoundtable({
  ctx,
  config,
  invocation,
  copy,
  signal,
  runState,
  presetTopic,
  select,
  retainBlank = true,
}) {
  const provider = requireSubagentProvider(ctx, config, copy);
  const startedBlank = retainBlank && blankState(ctx, invocation.agent) === true;

  const run = new AbortController();
  const runSignal = AbortSignal.any([signal, run.signal]);
  const timer = setTimeout(() => {
    runState.timedOut = true;
    run.abort(new Error(render(copy.runTimedOut, { ms: config.runTimeoutMs })));
  }, config.runTimeoutMs);
  timer.unref?.();

  try {
    const directory = await buildDirectory(ctx.llm, {
      signal: runSignal,
      timeoutMs: config.catalogTimeoutMs,
      copy,
    });
    if (directory.providers.length === 0) throw new Error(copy.noProviders);
    if (directory.models.length === 0) {
      const detail = directory.failures.map((failure) => `${failure.label}: ${failure.message}`).join("；");
      throw new Error(detail === "" ? copy.noModels : `${copy.noModels} ${detail}`);
    }

    const selection = select !== undefined
      ? select(directory)
      : await askSelection(ctx, invocation.agent, directory, copy, runSignal, presetTopic);
    const data = await runDeliberation({
      ctx,
      config,
      parentAgent: invocation.agent,
      provider,
      directory,
      selection,
      copy,
      signal: runSignal,
    });

    // The run deadline aborts the children, and the engine refuses to finish an
    // aborted run. Re-check here anyway: a race that lands between the engine's
    // last gate and this return must still report a timeout, not a success
    // built from degraded stage data.
    if (runState.timedOut) throw new Error(render(copy.runTimedOut, { ms: config.runTimeoutMs }));

    clearTimeout(timer);
    if (startedBlank) {
      try {
        await retainBlankSession(ctx, invocation.agent, copy);
      } catch (error) {
        data.notes.push(render(copy.retentionFailed, { message: shortMessage(error, copy.emptyOutput) }));
      }
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Auto-pick the panel for the model-facing tool: one model per provider first,
 * optionally narrowed by a comma-separated label/key list. Unlike the command,
 * the tool never opens a question card; the calling model already has the topic.
 */
function autoToolSelection(topic, panel, directory, copy) {
  const labels = typeof panel === "string"
    ? panel.split(/[\n,;]+/u).map((part) => part.trim()).filter((part) => part !== "")
    : [];
  let answerers;
  if (labels.length === 0) {
    answerers = autoPick(directory, autoTarget(directory));
  } else {
    const choice = resolveChoice({ selected: labels }, directory, copy.questions.autoAnswerers);
    if (choice.unknown.length > 0) {
      throw new Error(render(copy.unknownSelection, { label: choice.unknown[0] }));
    }
    answerers = choice.auto ? autoPick(directory, autoTarget(directory)) : choice.entries;
  }
  if (answerers.length < 2 || answerers.length > 8) {
    throw new Error(render(copy.invalidAnswerers, { n: answerers.length }));
  }
  // Prefer reviewers that did not answer (no self-review). When the catalog is
  // smaller than the table, fall back to peer review and let the limitation
  // note say so instead of silently dropping the review stage.
  const independent = independentReviewers(directory, answerers, 3);
  const reviewers = independent.length > 0 ? independent : [...answerers];
  const arbiter = independentArbiter(directory, [...answerers, ...reviewers]) ?? answerers[0];
  return {
    topic,
    answerers,
    reviewers,
    arbiter,
    rounds: 1,
    autoArbiter: true,
  };
}

/**
 * The model-facing half: the main Agent calls this tool, waits for the
 * cross-provider children, then writes the final answer as ordinary assistant
 * text. That is the normal chat path — no command-result card involved.
 */
function createRoundtableTool({ ctx, config, resolveLocale }) {
  return {
    name: "roundtable",
    description:
      "Run a cross-provider roundtable on a topic: 2–4 models from different providers answer independently, revise once, review anonymously, and an arbiter produces the final answer. Use this when the user asks for a roundtable, council, multi-model debate, or cross-provider discussion (圆桌讨论/议会/多模型辩论). The result includes every answer and the arbiter's synthesis for your reference; after it returns, write the final answer to the user in their language as normal assistant text instead of dumping the raw tool output.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The question or topic the roundtable should discuss.",
        },
        panel: {
          type: "string",
          description:
            "Optional comma-separated model labels or keys from the roundtable catalog. Omit to auto-pick one model per provider.",
        },
      },
      required: ["topic"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          markdown: { type: "string" },
          finalAnswer: { type: "string" },
          providers: { type: "array", items: { type: "string" } },
          models: { type: "array", items: { type: "string" } },
          failures: { type: "array", items: { type: "string" } },
        },
        required: ["markdown", "finalAnswer", "providers", "models", "failures"],
        additionalProperties: false,
      },
      render(_args, value) {
        return [{ type: "text", text: String(value?.markdown ?? "") }];
      },
      presentationMeta(_args, value) {
        return {
          providers: value?.providers?.length ?? 0,
          models: value?.models?.length ?? 0,
          failed: value?.failures?.length ?? 0,
        };
      },
    },
    timeoutMs: Math.max(config.runTimeoutMs + 60_000, 60_000),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const copy = copyFor(resolveLocale());
      const topic = typeof args?.topic === "string" ? args.topic.trim() : "";
      if (topic === "") throw new Error(copy.invalidTopic);

      const agentId = String(exec.agent.id);
      if (childPlans.has(agentId)) throw new Error(copy.toolSubagentDenied);
      if (activeAgents.has(agentId)) throw new Error(copy.alreadyRunning);

      activeAgents.add(agentId);
      const signal = AbortSignal.any([exec.signal, lifecycle.signal]);
      const runState = { timedOut: false };
      const operation = executeRoundtable({
        ctx,
        config,
        invocation: { agent: exec.agent },
        copy,
        signal,
        runState,
        presetTopic: topic,
        retainBlank: false,
        select: (directory) => autoToolSelection(topic, args?.panel, directory, copy),
      });
      activeOperations.add(operation);

      try {
        const data = await operation;
        return {
          markdown: formatResult(data, copy),
          finalAnswer: data.finalText,
          providers: data.providers,
          models: data.assignments.map((item) => `${item.entry.label} (${item.entry.provider})`),
          failures: data.failures.map((failure) => `${failure.stage}: ${failure.message}`),
        };
      } catch (error) {
        if (runState.timedOut) {
          throw new Error(render(copy.runTimedOut, { ms: config.runTimeoutMs }));
        }
        const code = errorCode(error);
        if (code === "ROUNDTABLE_CANCELLED" || code === "ASK_CANCELLED" || code === "ASK_ABORTED" || signal.aborted) {
          throw new Error(copy.cancelled);
        }
        throw error;
      } finally {
        activeAgents.delete(agentId);
        activeOperations.delete(operation);
      }
    },
    presentResult(_args, result) {
      const copy = copyFor(resolveLocale());
      return {
        card: "generic",
        title: copy.toolTitle,
        content: [{ type: "text", text: result.isError ? copy.toolFailed : copy.toolFinished }],
      };
    },
  };
}

/**
 * Tools a roundtable child must never reach, whatever the composition adds.
 *
 * README promises that children do not inherit the file, shell, or delegation
 * tools; this list lets the listener verify that promise after restricting,
 * instead of assuming the call took effect.
 */
const FORBIDDEN_CHILD_TOOLS = Object.freeze([
  "apply_patch",
  "bash",
  "edit",
  "glob",
  "grep",
  "powershell",
  "pwsh",
  "read",
  "shell",
  "subagent",
  "task",
  "terminal",
  "tool",
  "write",
]);

/** Read one tool from the child's own view; `undefined` means "cannot tell". */
function childToolVisible(agent, toolName) {
  try {
    const tools = agent.ctx?.tools;
    if (typeof tools?.get !== "function") return undefined;
    return tools.get(toolName) !== undefined;
  } catch {
    return undefined;
  }
}

/** Global tool names this composition registers, best effort. */
function globalToolNames(ctx) {
  try {
    const definitions = ctx.tools?.definitions?.();
    if (!Array.isArray(definitions)) return new Set();
    return new Set(
      definitions
        .map((definition) => definition?.name)
        .filter((toolName) => typeof toolName === "string" && toolName !== ""),
    );
  } catch {
    return new Set();
  }
}

/**
 * Attach the stage's tool policy to one roundtable child, or refuse to start it.
 *
 * The stage decides the web capability (see `webToolsForStage`): a topic-only
 * answer keeps the two web tools, while an answer carrying attachments and the
 * discussion/review/arbiter stages get none. Every step is fail-closed: a plan
 * that this plugin could not restrict must never run, so an exception here
 * fails the child's creation (the `agent/created` listener contract) instead of
 * logging a warning and letting a full-tool child take a step. Exported for the
 * tests that drive the policy directly.
 */
export function restrictChildTools(agent, plan, copy, globalNames) {
  const tools = agent.ctx?.tools;
  // `get` is what proves a restriction took effect; without it the policy
  // cannot be confirmed, so the child is refused rather than trusted.
  if (
    typeof tools?.restrict !== "function" ||
    typeof tools?.guard !== "function" ||
    typeof tools?.get !== "function"
  ) {
    throw new Error(copy.childToolsUnavailable);
  }

  // Only the web tools this stage allows AND this child can see right now. An
  // empty list is a stage that must not reach the network at all.
  const permitted = Array.isArray(plan.webTools) ? plan.webTools : [];
  const wanted = [];
  for (const toolName of permitted) {
    if (childToolVisible(agent, toolName) === true) wanted.push(toolName);
  }

  // A scope-local name makes an allow-list filter invalid (only inherited tools
  // are restrictable); removing every inherited tool is then the strictly safer
  // fallback, and the guard still decides call by call.
  let disposeRestriction;
  try {
    disposeRestriction = tools.restrict({ allow: wanted });
  } catch {
    disposeRestriction = tools.restrict({ allow: [] });
  }

  // Prove the restriction took effect: read the child's own view back. A
  // restricted-away global reads as absent; a name that is still there either
  // belongs to the child's own scope (the guard hides it) or means the
  // restriction failed — and then the child must not run at all.
  plan.allowed = new Set(permitted.filter((toolName) => childToolVisible(agent, toolName) === true));
  const probes = new Set([...WEB_TOOLS, ...FORBIDDEN_CHILD_TOOLS, ...globalNames]);
  const leaked = [];
  for (const toolName of probes) {
    if (toolName === "run_code" || toolName === "structured_output") continue;
    if (plan.allowed.has(toolName)) continue;
    // Absent is the safe answer: either the restriction removed it, or the
    // composition never registered it at all.
    if (childToolVisible(agent, toolName) !== true) continue;
    // A tool registered in the child's own scope is invisible to restrict();
    // the guard still refuses every call to it, so only inherited globals and
    // the documented forbidden set count as a broken restriction.
    if (!globalNames.has(toolName) && !FORBIDDEN_CHILD_TOOLS.includes(toolName)) continue;
    leaked.push(toolName);
  }
  if (leaked.length > 0) {
    try {
      disposeRestriction();
    } catch {
      // The child is refused below; nothing is left to run under the policy.
    }
    throw new Error(render(copy.childToolPolicyFailed, { message: leaked.join(", ") }));
  }

  let disposeGuard;
  try {
    disposeGuard = tools.guard((execution) => {
      const toolName = typeof execution?.name === "string" ? execution.name : "";
      const denied = plan.toolDenied ?? copy.toolDenied;
      if (toolName === "run_code") return undefined; // PTC presentation transport
      if (toolName === "structured_output") return plan.outputSchema ? undefined : denied;
      return plan.allowed.has(toolName) ? undefined : denied;
    });
  } catch (error) {
    try {
      disposeRestriction();
    } catch {
      // The child is refused below; a half-applied policy cannot run anyway.
    }
    throw new Error(render(copy.childToolPolicyFailed, { message: messageOf(error, plan.toolDenied ?? copy.toolDenied) }));
  }

  if (typeof disposeRestriction !== "function" || typeof disposeGuard !== "function") {
    throw new Error(render(copy.childToolPolicyFailed, { message: copy.childToolsUnavailable }));
  }

  // Hand the teardown to the plan so the restriction and guard end with the
  // child instead of accumulating in the tool layer.
  plan.disposers = [disposeRestriction, disposeGuard];
}

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);

  // Child creation is synchronous with respect to the child's first step, so
  // this listener must be registered before any spawn happens. The pre-minted
  // child id makes the match exact across concurrent roundtables.
  ctx.on("agent/created", ({ agent }) => {
    const childId = String(agent.id);
    const plan = childPlans.get(childId);
    if (plan === undefined) {
      // Not one of ours (another feature's subagent): leave it untouched. A
      // child this plugin started whose plan is already gone (tombstone expired,
      // child finished, or a policy failure retired it) must not be mistaken for
      // "someone else's agent" — that would let a very late creation run with no
      // restriction at all, so it is refused instead.
      if (isRefusedChild(childId)) {
        const copy = copyFor(resolveLocale());
        throw new Error(render(copy.childToolPolicyFailed, {
          message: copy.childPolicyMissing,
        }));
      }
      return;
    }
    if (plan.state === "applied") return;
    if (plan.state === "revoked") {
      // The run already gave up on this child — its deadline expired, it was
      // cancelled, or its spawn failed. A child that shows up afterwards must
      // not run unrestricted, so fail the creation: the throw rolls it back and
      // the child never takes a step.
      retireChildPlan(childId);
      throw new Error(render(plan.copy.childToolPolicyFailed, {
        message: messageOf(plan.reason, plan.copy.cancelled),
      }));
    }

    // Nothing may run under an unconfirmed policy: any throw here fails the
    // creation (the listener contract), which rolls the child back before it
    // can take a step. The plan is dropped too, so a retry for this id can
    // never skip the check by finding a half-applied plan.
    try {
      restrictChildTools(agent, plan, plan.copy, globalToolNames(ctx));
    } catch (error) {
      retireChildPlan(childId);
      throw error;
    }
    plan.state = "applied";
  }, { global: true });

  ctx.on("agent/disposed", ({ agent }) => {
    const childId = String(agent.id);
    retireChildPlan(childId);
    // The child is gone, so its activation is over: this is the one place where
    // a refusal marker may be released without risking a late unrestricted run.
    settleRefusedChild(childId);
  }, { global: true });

  // Blank-session retention: consume the synthetic message before the loop
  // builds a request, so promoting the session costs no model call.
  ctx.on("agent/pre-step", async ({ agent, messages }, next) => {
    const retention = blankRetentions.get(String(agent.id));
    if (retention === undefined) return next();
    if (messages.length === 1 && String(messages[0]?.id) === retention.messageId) {
      retention.consumed = true;
      blankRetentions.delete(String(agent.id));
      return { kind: "enter", messages: [] };
    }
    const decision = await next();
    if (decision.kind === "reject") return decision;
    if (!decision.messages.some((message) => String(message.id) === retention.messageId)) return decision;
    retention.consumed = true;
    blankRetentions.delete(String(agent.id));
    return {
      ...decision,
      messages: decision.messages.filter((message) => String(message.id) !== retention.messageId),
    };
  }, { global: true, prepend: true });

  const resolveLocale = () => localeOf(ctx, config);

  // Durable meetings + the page API. The manager owns `<workspace>/.roundtable`
  // and its own runs; the command and the tool never touch it. Registration
  // waits for the Connection service so a host that reloads it re-attaches.
  const meetings = new MeetingManager({ ctx, config, copyFor, resolveLocale });
  const registerApi = (hostCtx) => {
    try {
      return registerRoundtableApi(hostCtx, { ctx, config, manager: meetings, copyFor, resolveLocale });
    } catch (error) {
      ctx.logger?.warn?.(`dsh-simroundtable: page API unavailable: ${messageOf(error, "unknown error")}`);
      return () => {};
    }
  };
  if (typeof ctx.inject === "function") {
    ctx.inject(["connection"], (connectionCtx) => registerApi(connectionCtx));
  } else if (ctx.get?.("connection") !== undefined) {
    ctx.effect(() => registerApi(ctx), "dsh-simroundtable page api");
  }

  const handler = async (invocation) => {
    const copy = copyFor(resolveLocale());
    const agentId = String(invocation.agent.id);
    if (activeAgents.has(agentId)) return { kind: "error", text: copy.alreadyRunning };

    activeAgents.add(agentId);
    const signal = AbortSignal.any([invocation.signal, lifecycle.signal]);
    const runState = { timedOut: false };
    const presetTopic = typeof invocation.rawInput === "string" ? invocation.rawInput.trim() : "";
    const operation = executeRoundtable({ ctx, config, invocation, copy, signal, runState, presetTopic });
    activeOperations.add(operation);
    const retire = () => {
      activeAgents.delete(agentId);
      activeOperations.delete(operation);
    };
    operation.then(retire, retire);

    try {
      const data = await operation;
      return { kind: "success", text: formatResult(data, copy) };
    } catch (error) {
      if (runState.timedOut) return { kind: "error", text: render(copy.runTimedOut, { ms: config.runTimeoutMs }) };
      const code = errorCode(error);
      if (code === "ROUNDTABLE_CANCELLED" || code === "ASK_CANCELLED" || code === "ASK_ABORTED" || signal.aborted) {
        return { kind: "error", text: copy.cancelled };
      }
      ctx.logger?.warn?.(`dsh-simroundtable: ${messageOf(error, "unknown error")}`);
      return { kind: "error", text: render(copy.commandError, { message: shortMessage(error, copy.commandError) }) };
    }
  };

  ctx.effect(() => {
    const disposeTool = ctx.tools.register(createRoundtableTool({ ctx, config, resolveLocale }));
    let disposeCommand = () => {};
    const registerCommand = () => {
      disposeCommand();
      disposeCommand = ctx.commands.register({
        name: "roundtable",
        description: copyFor(resolveLocale()).commandDescription,
        recordInput: false,
        handler,
      });
    };
    registerCommand();

    // 0.2 replaced `settings/updated` with the per-document event; the locale
    // plugin owns the `locale` namespace.
    const disposeLocaleWatch = ctx.on("settings/document-updated", (namespace) => {
      if (String(namespace) === "locale") registerCommand();
    });

    return async () => {
      disposeLocaleWatch();
      disposeCommand();
      disposeTool();
      // Meetings first: their records must be marked interrupted while the
      // workspace is still writable, before the children are torn down.
      await meetings.dispose();
      lifecycle.abort(new Error("dsh-simroundtable plugin disposed"));
      await Promise.allSettled([...activeOperations]);
      await Promise.allSettled([...activeHandles].map(async (handle) => {
        try {
          await handle.dispose();
        } catch {
          // The child may already be gone.
        }
      }));
    };
  }, "dsh-simroundtable lifecycle");
}
