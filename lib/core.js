// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Pure-ish helpers shared by the roundtable plugin and its tests.
 *
 * The only process services this module touches are an injected LLM catalog
 * for discovery; everything else is data in, data out.
 */

export const WEB_TOOLS = Object.freeze(["web_search", "web_fetch"]);
export const LETTERS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H"]);

/** Workspace-relative directory holding meetings, uploads and exports. */
export const ROUNDTABLE_DIR = ".roundtable";

export const DEFAULTS = Object.freeze({
  answerMaxTokens: 16384,
  reviewMaxTokens: 16384,
  arbiterMaxTokens: 16384,
  childTimeoutMs: 300_000,
  runTimeoutMs: 900_000,
  catalogTimeoutMs: 20_000,
  subagentProvider: "spawn",
  maxConcurrentChildren: 4,
  maxAnswerChars: 12_000,
  stageInputChars: 8_000,
  maxRounds: 5,
  maxConcurrentMeetings: 3,
  meetingHistoryLimit: 100,
  attachmentMaxFiles: 8,
  attachmentMaxFileBytes: 8 * 1024 * 1024,
  attachmentMaxTotalBytes: 24 * 1024 * 1024,
  attachmentTextCharsPerFile: 20_000,
  attachmentTextCharsTotal: 60_000,
  uploadTtlHours: 24,
  language: "auto",
});

const MAX_TIMER_MS = 2_147_483_647;

/** Fill `{name}` placeholders in one copy template. */
export function render(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Validate and merge the row config with defaults. */
export function normalizeConfig(raw) {
  const input = raw === undefined || raw === null ? {} : raw;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("dsh-simroundtable: config must be an object");
  }
  const config = { ...DEFAULTS, ...input };

  for (const key of ["answerMaxTokens", "reviewMaxTokens", "arbiterMaxTokens", "childTimeoutMs", "runTimeoutMs", "catalogTimeoutMs"]) {
    const value = config[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMER_MS) {
      throw new Error(`dsh-simroundtable: ${key} must be a positive integer no greater than ${MAX_TIMER_MS}`);
    }
  }
  if (config.runTimeoutMs < config.childTimeoutMs) {
    throw new Error("dsh-simroundtable: runTimeoutMs must be greater than or equal to childTimeoutMs");
  }
  if (typeof config.subagentProvider !== "string" || config.subagentProvider.trim() === "") {
    throw new Error("dsh-simroundtable: subagentProvider must be a non-empty string");
  }
  config.subagentProvider = config.subagentProvider.trim();
  if (!Number.isSafeInteger(config.maxConcurrentChildren) || config.maxConcurrentChildren < 1 || config.maxConcurrentChildren > 16) {
    throw new Error("dsh-simroundtable: maxConcurrentChildren must be an integer from 1 to 16");
  }
  if (!Number.isSafeInteger(config.maxAnswerChars) || config.maxAnswerChars < 1000 || config.maxAnswerChars > 200_000) {
    throw new Error("dsh-simroundtable: maxAnswerChars must be an integer from 1000 to 200000");
  }
  if (!Number.isSafeInteger(config.stageInputChars) || config.stageInputChars < 1000 || config.stageInputChars > 100_000) {
    throw new Error("dsh-simroundtable: stageInputChars must be an integer from 1000 to 100000");
  }
  if (!Number.isSafeInteger(config.maxRounds) || config.maxRounds < 1 || config.maxRounds > 10) {
    throw new Error("dsh-simroundtable: maxRounds must be an integer from 1 to 10");
  }
  if (!Number.isSafeInteger(config.maxConcurrentMeetings) || config.maxConcurrentMeetings < 1 || config.maxConcurrentMeetings > 10) {
    throw new Error("dsh-simroundtable: maxConcurrentMeetings must be an integer from 1 to 10");
  }
  if (!Number.isSafeInteger(config.meetingHistoryLimit) || config.meetingHistoryLimit < 1 || config.meetingHistoryLimit > 500) {
    throw new Error("dsh-simroundtable: meetingHistoryLimit must be an integer from 1 to 500");
  }
  if (!Number.isSafeInteger(config.attachmentMaxFiles) || config.attachmentMaxFiles < 0 || config.attachmentMaxFiles > 20) {
    throw new Error("dsh-simroundtable: attachmentMaxFiles must be an integer from 0 to 20");
  }
  if (!Number.isSafeInteger(config.attachmentMaxFileBytes) || config.attachmentMaxFileBytes < 1 || config.attachmentMaxFileBytes > 64 * 1024 * 1024) {
    throw new Error("dsh-simroundtable: attachmentMaxFileBytes must be an integer from 1 to 67108864");
  }
  if (!Number.isSafeInteger(config.attachmentMaxTotalBytes) || config.attachmentMaxTotalBytes < config.attachmentMaxFileBytes || config.attachmentMaxTotalBytes > 256 * 1024 * 1024) {
    throw new Error("dsh-simroundtable: attachmentMaxTotalBytes must be an integer from attachmentMaxFileBytes to 268435456");
  }
  for (const key of ["attachmentTextCharsPerFile", "attachmentTextCharsTotal"]) {
    const value = config[key];
    if (!Number.isSafeInteger(value) || value < 1000 || value > 1_000_000) {
      throw new Error(`dsh-simroundtable: ${key} must be an integer from 1000 to 1000000`);
    }
  }
  if (config.attachmentTextCharsTotal < config.attachmentTextCharsPerFile) {
    throw new Error("dsh-simroundtable: attachmentTextCharsTotal must be greater than or equal to attachmentTextCharsPerFile");
  }
  if (!["auto", "zh", "en"].includes(config.language)) {
    throw new Error('dsh-simroundtable: language must be "auto", "zh", or "en"');
  }
  if (!Number.isSafeInteger(config.uploadTtlHours) || config.uploadTtlHours < 0 || config.uploadTtlHours > 8_760) {
    throw new Error("dsh-simroundtable: uploadTtlHours must be an integer from 0 to 8760 (0 keeps uploads forever)");
  }
  return config;
}

/**
 * Race an operation against an abort signal without leaking a late rejection.
 * The dangling promise gets a catch handler so timeout paths do not surface as
 * unhandled rejections.
 */
export async function abortable(promise, signal) {
  const operation = Promise.resolve(promise);
  operation.catch(() => {});
  let onAbort = () => {};
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** A disposable deadline; unlike AbortSignal.timeout, its timer ends with the operation. */
export async function withDeadline(parent, milliseconds, message, operation) {
  parent.throwIfAborted();
  const deadline = new AbortController();
  const signal = AbortSignal.any([parent, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new Error(message)), milliseconds);
  timer.unref?.();
  try {
    const result = await abortable(operation(signal), signal);
    signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` over `items` with at most `limit` concurrent calls, preserving order. */
export async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), list.length);
  if (workerCount === 0) return results;
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(list[index], index) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Best available human-readable message for an unknown thrown value. */
export function messageOf(error, fallback = "unknown error") {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim() !== "") {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim() !== "") return error.trim();
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim() !== "") {
    return error.message.trim();
  }
  return fallback;
}

/** A bounded message for the result report. */
export function shortMessage(error, fallback = "unknown error", limit = 600) {
  const message = messageOf(error, fallback);
  return message.length <= limit ? message : `${message.slice(0, limit).trimEnd()}…`;
}

export function errorCode(error) {
  if (typeof error !== "object" || error === null) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

/** Extract visible assistant text from a SubagentResult. */
export function textOfResult(result) {
  const output = Array.isArray(result?.output) ? result.output : [];
  return output
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}

export function truncateText(text, limit) {
  const value = typeof text === "string" ? text : "";
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit)).trimEnd()}\n\n[…]`;
}

function tryParseJson(text) {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

function matchingBrace(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Parse direct, fenced, or prose-wrapped JSON; undefined when none is found. */
export function extractJson(input) {
  if (typeof input !== "string") return undefined;
  let text = input.replace(/^\uFEFF/, "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  const direct = tryParseJson(text);
  if (direct !== undefined) return direct.value;
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    const end = matchingBrace(text, start);
    if (end < 0) break;
    const parsed = tryParseJson(text.slice(start, end + 1));
    if (parsed !== undefined) return parsed.value;
  }
  return undefined;
}

/**
 * Recover a ranking from a review that was cut off before its JSON closed.
 *
 * Reasoning models can spend the whole completion budget on hidden reasoning
 * and stop mid-object (`finish_reason: "length"`), which used to discard an
 * otherwise usable vote. The `ranking` array is the one field the aggregation
 * needs, and it is written last, so a targeted scan saves the reviewer instead
 * of failing the whole stage. Answers absent from the truncated array are
 * appended in panel order — the same convention `normalizeReview` applies to a
 * complete review that omitted them — and callers must flag the result so the
 * user sees that the ranking came from a truncated reply.
 *
 * @param input - Raw model output, possibly an unterminated JSON object.
 * @param answerIds - Known answer ids, in panel order.
 * @returns A complete ranking, or undefined when the output holds no vote.
 */
export function salvageRanking(input, answerIds) {
  if (typeof input !== "string") return undefined;
  const known = Array.isArray(answerIds) ? answerIds.filter((id) => typeof id === "string") : [];
  if (known.length < 2) return undefined;
  const text = input.replace(/^\uFEFF/, "");
  const key = /"ranking"\s*:\s*\[/g;
  let found;
  for (let match = key.exec(text); match !== null; match = key.exec(text)) {
    const start = key.lastIndex;
    const end = text.indexOf("]", start);
    const slice = text.slice(start, end < 0 ? start + 400 : end);
    const ids = [];
    const idPattern = /"([^"\\]{1,40})"/g;
    for (let idMatch = idPattern.exec(slice); idMatch !== null; idMatch = idPattern.exec(slice)) {
      const id = idMatch[1].trim();
      if (known.includes(id) && !ids.includes(id)) ids.push(id);
    }
    if (ids.length > 0) found = ids;
  }
  if (found === undefined) return undefined;
  for (const id of known) {
    if (!found.includes(id)) found.push(id);
  }
  return found;
}

function labelModels(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const base = `${entry.modelName} · ${entry.providerName}`;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return entries.map((entry) => {
    const base = `${entry.modelName} · ${entry.providerName}`;
    return { ...entry, label: (counts.get(base) ?? 0) > 1 ? `${base} (${entry.key})` : base };
  });
}

/**
 * Discover every live provider's models and flatten them into route entries.
 *
 * Providers are queried concurrently with their own short deadline: one slow
 * catalog must not delay the first question card by the child timeout.
 */
export async function buildDirectory(llm, { signal, timeoutMs, copy }) {
  const providers = [...(llm.listProviders() ?? [])].sort((left, right) => {
    const byName = String(left.name ?? left.id).localeCompare(String(right.name ?? right.id));
    return byName !== 0 ? byName : String(left.id).localeCompare(String(right.id));
  });

  const outcomes = await mapLimit(providers, 4, async (provider) => {
    const providerName = String(provider.name ?? provider.id);
    try {
      const listed = await withDeadline(
        signal,
        timeoutMs,
        render(copy.catalogTimedOut, { provider: providerName }),
        () => llm.listModels(provider.id),
      );
      const usable = (listed ?? []).filter((model) => model && typeof model.id === "string" && model.id.trim() !== "");
      if (usable.length === 0) {
        return {
          models: [],
          failures: [{
            stage: copy.stageCatalog,
            label: providerName,
            message: render(copy.providerNoModels, { provider: providerName }),
          }],
        };
      }
      return {
        models: usable.map((model) => {
          const modelId = model.id.trim();
          return {
            key: `${provider.id}/${modelId}`,
            provider: provider.id,
            providerName,
            model: modelId,
            modelName: String(model.name ?? modelId).trim() || modelId,
            description: typeof model.description === "string" ? model.description : "",
          };
        }),
        failures: [],
      };
    } catch (error) {
      return {
        models: [],
        failures: [{
          stage: copy.stageCatalog,
          label: providerName,
          message: render(copy.catalogFailed, { message: shortMessage(error, copy.emptyOutput) }),
        }],
      };
    }
  });

  const failures = [];
  const collected = [];
  for (const outcome of outcomes) {
    if (outcome.status !== "fulfilled") {
      failures.push({
        stage: copy.stageCatalog,
        message: shortMessage(outcome.reason, copy.emptyOutput),
      });
      continue;
    }
    collected.push(...outcome.value.models);
    failures.push(...outcome.value.failures);
  }

  const seen = new Set();
  const models = [];
  for (const entry of collected) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    models.push(entry);
  }

  models.sort((left, right) => {
    const byModel = left.modelName.localeCompare(right.modelName);
    if (byModel !== 0) return byModel;
    return left.key.localeCompare(right.key);
  });

  return {
    providers: providers.map((provider) => provider.id),
    models: labelModels(models),
    failures,
  };
}

/** Desired automatic panel size: one per provider, 2–4, bounded by available models. */
export function autoTarget(directory) {
  const providerCount = new Set(directory.models.map((entry) => entry.provider)).size;
  return Math.max(1, Math.min(directory.models.length, Math.min(4, Math.max(2, providerCount))));
}

/** Pick one model per provider first, then fill from the remaining catalog. */
export function autoPick(directory, target) {
  const groups = new Map();
  for (const entry of directory.models) {
    const group = groups.get(entry.provider);
    if (group === undefined) groups.set(entry.provider, [entry]);
    else group.push(entry);
  }
  const picks = [...groups.values()].map((group) => group[0]);
  for (const entry of directory.models) {
    if (picks.length >= target) break;
    if (!picks.includes(entry)) picks.push(entry);
  }
  return picks.slice(0, target);
}

/**
 * Resolve one question's selected labels into model entries.
 * `auto` is true only when the auto label is the sole selection.
 */
export function resolveChoice(item, directory, autoLabel) {
  const byLabel = new Map(directory.models.map((entry) => [entry.label, entry]));
  const byKey = new Map(directory.models.map((entry) => [entry.key, entry]));
  const selected = Array.isArray(item?.selected) ? item.selected : [];
  const custom = typeof item?.custom === "string" ? item.custom.trim() : "";
  const chosen = [];
  const unknown = [];

  for (const label of selected) {
    if (label === autoLabel) continue;
    const entry = byLabel.get(label) ?? byKey.get(label);
    if (entry !== undefined) chosen.push(entry);
    else unknown.push(String(label));
  }
  if (custom !== "") {
    for (const part of custom.split(/[\n,;]+/u)) {
      const text = part.trim();
      if (text === "") continue;
      const entry = byKey.get(text) ?? byLabel.get(text);
      if (entry !== undefined) chosen.push(entry);
      else if (unknown.length === 0) unknown.push(text);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of chosen) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    deduped.push(entry);
  }

  return {
    auto: selected.includes(autoLabel) && deduped.length === 0 && unknown.length === 0,
    entries: deduped,
    unknown,
  };
}

/** Fisher–Yates shuffle, injectable for tests. */
export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Attach stable anonymized answer ids after a random seating order. */
export function assignAnswerIds(entries, random = Math.random) {
  return shuffle(entries, random).map((entry, index) => ({ id: LETTERS[index], entry }));
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * Validate and normalize one reviewer's JSON. Missing ranking entries are
 * appended in panel order so one omission does not discard an entire review;
 * the caller can surface that normalization.
 */
export function normalizeReview(value, answerIds) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("review output must be a JSON object");
  }
  const known = new Set(answerIds);
  const rawRanking = Array.isArray(value.ranking) ? value.ranking.filter((item) => typeof item === "string") : [];
  const validRaw = rawRanking.filter((id) => known.has(id));
  if (validRaw.length === 0) throw new Error("review ranking contains no known answer ids");

  const ranking = [];
  for (const id of validRaw) {
    if (!ranking.includes(id)) ranking.push(id);
  }
  let rankingNormalized = ranking.length !== rawRanking.length;
  for (const id of answerIds) {
    if (!ranking.includes(id)) {
      ranking.push(id);
      rankingNormalized = true;
    }
  }

  const evaluations = [];
  if (Array.isArray(value.evaluations)) {
    for (const item of value.evaluations) {
      if (typeof item !== "object" || item === null) continue;
      if (typeof item.answerId !== "string" || !known.has(item.answerId)) continue;
      evaluations.push({
        answerId: item.answerId,
        strengths: stringList(item.strengths),
        weaknesses: stringList(item.weaknesses),
      });
    }
  }

  const uniqueInsights = [];
  if (Array.isArray(value.uniqueInsights)) {
    for (const item of value.uniqueInsights) {
      if (typeof item !== "object" || item === null) continue;
      if (typeof item.answerId !== "string" || !known.has(item.answerId)) continue;
      if (typeof item.insight !== "string" || item.insight.trim() === "") continue;
      uniqueInsights.push({ answerId: item.answerId, insight: item.insight.trim() });
    }
  }

  return {
    evaluations,
    consensus: stringList(value.consensus),
    contradictions: stringList(value.contradictions),
    coverageGaps: stringList(value.coverageGaps),
    uniqueInsights,
    blindSpots: stringList(value.blindSpots),
    ranking,
    rankingNormalized,
  };
}

/** Validate and normalize the arbiter's JSON. */
export function normalizeArbiter(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("arbiter output must be a JSON object");
  }
  const answerMarkdown = typeof value.answerMarkdown === "string" ? value.answerMarkdown.trim() : "";
  if (answerMarkdown === "") throw new Error("arbiter output has no answerMarkdown");
  return {
    answerMarkdown,
    consensus: stringList(value.consensus),
    contradictions: stringList(value.contradictions),
    blindSpots: stringList(value.blindSpots),
    confidenceNotes: stringList(value.confidenceNotes),
  };
}

/** Aggregate reviewer rankings into average rank plus vote count. */
export function aggregateRankings(reviews, assignments) {
  const order = new Map(assignments.map((assignment, index) => [assignment.id, index]));
  const stats = new Map(assignments.map((assignment) => [assignment.id, { answerId: assignment.id, sum: 0, votes: 0 }]));
  for (const review of reviews) {
    if (!Array.isArray(review.ranking)) continue;
    review.ranking.forEach((answerId, index) => {
      const entry = stats.get(answerId);
      if (entry === undefined) return;
      entry.sum += index + 1;
      entry.votes += 1;
    });
  }
  return [...stats.values()]
    .map((entry) => ({ ...entry, averageRank: entry.votes === 0 ? 0 : entry.sum / entry.votes }))
    .sort((left, right) => {
      if (left.votes > 0 && right.votes > 0) {
        return left.averageRank - right.averageRank
          || right.votes - left.votes
          || (order.get(left.answerId) ?? 0) - (order.get(right.answerId) ?? 0);
      }
      if (left.votes > 0) return -1;
      if (right.votes > 0) return 1;
      return (order.get(left.answerId) ?? 0) - (order.get(right.answerId) ?? 0);
    });
}

export function uniqueStrings(items) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    const text = typeof item === "string" ? item.trim() : "";
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function collectReviews(reviews, key) {
  return uniqueStrings(reviews.flatMap((review) => (Array.isArray(review[key]) ? review[key] : [])));
}

export function quoteBlock(text) {
  return String(text ?? "").split(/\r?\n/u).map((line) => `> ${line}`).join("\n");
}

function renderStringList(lines, heading, items, copy) {
  lines.push("", heading);
  if (items.length === 0) lines.push(`- ${copy.none}`);
  else for (const item of items) lines.push(`- ${item}`);
}

/** Render the final command result as Markdown. */
export function formatResult(data, copy) {
  const lines = [copy.resultTitle, "", copy.topicLabel, quoteBlock(data.topic), ""];
  const providers = data.providers.length > 0 ? data.providers.join(", ") : copy.none;
  lines.push(`${copy.providersLabel}${providers}`);
  if (data.providers.length === 1) lines.push(copy.singleProviderNote);
  lines.push("", copy.rosterLabel);
  const answererText = data.assignments
    .map((assignment) => `${assignment.id} · ${assignment.entry.modelName} · ${assignment.entry.providerName}`)
    .join("；");
  const reviewerText = data.reviewers.map((entry) => `${entry.modelName} · ${entry.providerName}`).join("；");
  lines.push(`- ${copy.answerersLabel}：${answererText}`);
  lines.push(`- ${copy.reviewersLabel}：${reviewerText}`);
  lines.push(`- ${copy.arbiterLabel}：${data.arbiter.modelName} · ${data.arbiter.providerName}`);
  lines.push(`- ${copy.roundsLabel}：${data.rounds}`);

  lines.push("", copy.answersHeading);
  for (const answer of data.answers) {
    const revised = answer.revised > 0 ? render(copy.revisedNote, { n: answer.revised }) : "";
    lines.push("", `### ${copy.answerHeading} ${answer.id} · ${answer.entry.modelName} · ${answer.entry.providerName}${revised}`, "");
    lines.push(truncateText(answer.text, data.maxAnswerChars));
  }

  lines.push("", copy.reviewHeading, "");
  if (data.reviews.length === 0) {
    lines.push(copy.noReviews);
  } else {
    lines.push(copy.rankingTableHeader);
    lines.push("| --- | --- | --- | --- |");
    data.ranking.forEach((row, index) => {
      const average = row.votes > 0 ? row.averageRank.toFixed(2) : "—";
      lines.push(`| ${index + 1} | ${row.answerId} | ${average} | ${row.votes} |`);
    });
    renderStringList(lines, copy.consensusHeading, collectReviews(data.reviews, "consensus"), copy);
    renderStringList(lines, copy.contradictionsHeading, collectReviews(data.reviews, "contradictions"), copy);
    const gaps = collectReviews(data.reviews, "coverageGaps");
    if (gaps.length > 0) renderStringList(lines, copy.gapsHeading, gaps, copy);
    renderStringList(lines, copy.blindSpotsHeading, collectReviews(data.reviews, "blindSpots"), copy);
    const insights = uniqueStrings(
      data.reviews.flatMap((review) => review.uniqueInsights.map((item) => `${item.answerId}: ${item.insight}`)),
    );
    if (insights.length > 0) renderStringList(lines, copy.uniqueHeading, insights, copy);
  }

  lines.push("", copy.finalHeading);
  if (data.arbiterResult !== undefined) {
    lines.push("", `> ${copy.arbiterModelLabel}${data.arbiterResult.entry.modelName} · ${data.arbiterResult.entry.providerName}`);
  }
  if (data.finalFallback) lines.push("", copy.fallbackFinal);
  lines.push("", data.finalText || copy.noFinal);

  if (data.failures.length > 0) {
    lines.push("", copy.failuresHeading);
    for (const failure of data.failures) {
      const who = failure.entry !== undefined
        ? `${failure.entry.modelName}（${failure.entry.providerName}）`
        : (failure.label ?? "");
      const suffix = who === "" ? "" : ` · ${who}`;
      lines.push(`- ${failure.stage}${suffix}：${failure.message}`);
    }
  }

  if (data.notes.length > 0) {
    lines.push("", copy.notesHeading);
    for (const note of uniqueStrings(data.notes)) lines.push(`- ${note}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// Meeting records
//
// A meeting is the durable shape of one roundtable run. `engine.js` produces a
// result object; `meetings.js` folds that result into the record below and the
// page API serializes it. Everything here is plain data in, plain data out.
// ---------------------------------------------------------------------------

export const MEETING_STATUSES = Object.freeze([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export const MEETING_STAGES = Object.freeze([
  "queued",
  "answering",
  "discussing",
  "reviewing",
  "deciding",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

/** Terminal statuses never change again except through explicit history edits. */
export function isMeetingTerminal(status) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted";
}

/** ISO timestamp for durable records. */
export function nowIso() {
  return new Date().toISOString();
}

/** Stable catalog key for one `{ provider, model }` pair. */
export function modelKey(provider, model) {
  return `${provider}/${model}`;
}

/** Resolve one `{ provider, model }` or `"provider/model"` reference against a catalog. */
export function findModel(directory, wanted) {
  const models = Array.isArray(directory?.models) ? directory.models : [];
  if (typeof wanted === "string") {
    const key = wanted.trim();
    if (key === "") return undefined;
    return models.find((entry) => entry.key === key);
  }
  if (wanted === undefined || wanted === null || typeof wanted !== "object") return undefined;
  const provider = typeof wanted.provider === "string" ? wanted.provider.trim() : "";
  const model = typeof wanted.model === "string" ? wanted.model.trim() : "";
  if (provider === "" || model === "") return undefined;
  return models.find((entry) => entry.provider === provider && entry.model === model);
}

/** One pick per provider first, then fill from the remaining catalog order. */
export function spreadPicks(entries, limit) {
  const picks = [];
  const seenProviders = new Set();
  for (const entry of entries) {
    if (picks.length >= limit) break;
    if (seenProviders.has(entry.provider)) continue;
    seenProviders.add(entry.provider);
    picks.push(entry);
  }
  for (const entry of entries) {
    if (picks.length >= limit) break;
    if (picks.includes(entry)) continue;
    picks.push(entry);
  }
  return picks;
}

/** Models that did not answer, preferring provider diversity: reviewers avoid self-review. */
export function independentReviewers(directory, answerers, limit = 3) {
  const used = new Set(answerers.map((entry) => entry.key));
  const candidates = (directory?.models ?? []).filter((entry) => !used.has(entry.key));
  return spreadPicks(candidates, limit);
}

/** An arbiter that neither answered nor reviewed, when the catalog allows it. */
export function independentArbiter(directory, excluded) {
  const used = new Set(excluded.map((entry) => entry.key));
  const candidates = (directory?.models ?? []).filter((entry) => !used.has(entry.key));
  return candidates[0];
}

/** Display label for one meeting status, falling back to the raw token. */
export function statusLabel(copy, status) {
  const table = {
    queued: copy.statusQueued,
    running: copy.statusRunning,
    completed: copy.statusCompleted,
    failed: copy.statusFailed,
    cancelled: copy.statusCancelled,
    interrupted: copy.statusInterrupted,
  };
  return table[status] ?? status;
}

/**
 * Meeting output language: `auto` follows the topic, `zh`/`en` pin it.
 *
 * Missing or unknown values — records written before the language selector
 * existed, hand-edited files — read back as `auto` instead of `undefined`.
 */
export function normalizeMeetingLanguage(value) {
  return value === "zh" || value === "en" ? value : "auto";
}

/** One history row: small, stable, and safe to poll in a list. */
export function meetingSummary(record) {
  const roster = record?.roster ?? {};
  const answerers = Array.isArray(roster.answerers) ? roster.answerers : [];
  const reviewers = Array.isArray(roster.reviewers) ? roster.reviewers : [];
  const finalText = typeof record?.finalAnswer?.text === "string" ? record.finalAnswer.text : "";
  return {
    id: record?.id,
    topic: record?.topic,
    language: normalizeMeetingLanguage(record?.language),
    status: record?.status,
    stage: record?.stage,
    rounds: record?.rounds ?? 0,
    workspace: record?.workspace,
    createdAt: record?.createdAt,
    updatedAt: record?.updatedAt,
    endedAt: record?.endedAt,
    rosterCounts: {
      answerers: answerers.length,
      reviewers: reviewers.length,
      arbiter: roster.arbiter === undefined || roster.arbiter === null ? 0 : 1,
    },
    fallback: record?.finalAnswer?.fallback === true,
    finalPreview: finalText === "" ? undefined : truncateText(finalText, 280),
    attachments: Array.isArray(record?.attachments) ? record.attachments.length : 0,
  };
}

/** Force one roster member into a detail-shaped entry. */
function memberOf(role, member) {
  return {
    key: member?.key,
    role,
    anonymousId: member?.anonymousId,
    provider: member?.provider,
    providerName: member?.providerName,
    model: member?.model,
    modelName: member?.modelName,
    label: member?.label,
    status: member?.status ?? "pending",
    stage: member?.stage,
    error: member?.error,
    revised: member?.revised,
  };
}

/**
 * The full meeting document served to the page.
 *
 * `progress.members` is derived from the roster on every read so a member's
 * status cannot disagree with the roster it belongs to.
 */
export function meetingDetail(record) {
  if (record === undefined || record === null) return undefined;
  const detail = structuredClone(record);
  const roster = detail.roster ?? {};
  const answerers = (Array.isArray(roster.answerers) ? roster.answerers : []).map((member) => memberOf("answerer", member));
  const reviewers = (Array.isArray(roster.reviewers) ? roster.reviewers : []).map((member) => memberOf("reviewer", member));
  const arbiter = roster.arbiter === undefined || roster.arbiter === null
    ? undefined
    : memberOf("arbiter", roster.arbiter);
  detail.roster = { answerers, reviewers, ...(arbiter === undefined ? {} : { arbiter }) };

  const members = [...answerers, ...reviewers, ...(arbiter === undefined ? [] : [arbiter])];
  const total = Number.isSafeInteger(detail.progress?.total) ? detail.progress.total : 0;
  const completed = Number.isSafeInteger(detail.progress?.completed) ? detail.progress.completed : 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  detail.progress = {
    stageIndex: detail.progress?.stageIndex ?? 0,
    stageCount: detail.progress?.stageCount ?? 0,
    completed,
    total,
    percent: isMeetingTerminal(detail.status) && detail.status === "completed" ? 100 : percent,
    members,
  };
  detail.transcript = Array.isArray(detail.transcript) ? detail.transcript : [];
  detail.reviews = Array.isArray(detail.reviews) ? detail.reviews : [];
  detail.failures = Array.isArray(detail.failures) ? detail.failures : [];
  detail.limitations = Array.isArray(detail.limitations) ? detail.limitations : [];
  detail.notes = Array.isArray(detail.notes) ? detail.notes : [];
  detail.finalAnswer = detail.finalAnswer ?? null;
  detail.attachments = Array.isArray(detail.attachments) ? detail.attachments : [];
  detail.language = normalizeMeetingLanguage(detail.language);
  return detail;
}

/** Render one meeting record as the Markdown export. */
export function formatMeeting(record, copy) {
  const lines = [];
  const roster = record.roster ?? {};
  lines.push(copy.exportMeetingTitle, "");
  lines.push(`${copy.exportIdLabel}\`${record.id}\``);
  lines.push(`${copy.exportStatusLabel}${statusLabel(copy, record.status)} · ${record.stage ?? ""}`.trimEnd());
  lines.push(`${copy.exportTopicLabel}${record.topic}`);
  lines.push(`${copy.exportWorkspaceLabel}\`${record.workspace}\``);
  lines.push(`${copy.exportCreatedLabel}${record.createdAt ?? ""}`);
  lines.push(`${copy.exportUpdatedLabel}${record.updatedAt ?? ""}`);
  if (record.endedAt !== undefined) lines.push(`${copy.exportEndedLabel}${record.endedAt}`);
  lines.push("");

  lines.push(copy.exportRosterHeading);
  const rosterLine = (role, member) => {
    const status = member.status === undefined ? "" : ` — ${member.status}`;
    const anonymous = member.anonymousId === undefined ? "" : ` · ${member.anonymousId}`;
    lines.push(`- ${role}${anonymous}：${member.label ?? member.key}（${member.provider}）${status}`);
  };
  for (const member of roster.answerers ?? []) rosterLine(copy.answerersLabel, member);
  for (const member of roster.reviewers ?? []) rosterLine(copy.reviewersLabel, member);
  if (roster.arbiter !== undefined && roster.arbiter !== null) rosterLine(copy.arbiterLabel, roster.arbiter);
  lines.push("");

  if (Array.isArray(record.attachments) && record.attachments.length > 0) {
    lines.push(copy.exportAttachmentsHeading);
    for (const attachment of record.attachments) {
      const kind = attachment.kind === "image" ? copy.attachmentKindImage : copy.attachmentKindText;
      lines.push(`- ${attachment.name}（${kind} · ${attachment.bytes} B）`);
    }
    lines.push("");
  }

  const answers = Array.isArray(record.answers) ? record.answers : [];
  if (answers.length > 0) {
    lines.push(copy.exportAnswersHeading);
    for (const answer of answers) {
      const revised = answer.revised > 0 ? render(copy.revisedNote, { n: answer.revised }) : "";
      lines.push("", `### ${copy.answerHeading} ${answer.anonymousId}${revised}${answer.label === undefined ? "" : ` · ${answer.label}`}`, "", answer.text ?? "");
    }
    lines.push("");
  }

  lines.push(copy.exportReviewsHeading);
  if (record.reviews.length === 0) {
    lines.push(copy.noReviews);
  } else {
    lines.push("", `${copy.rankingTableHeader}`, "| --- | --- | --- | --- |");
    for (const [index, row] of (record.ranking ?? []).entries()) {
      lines.push(`| ${index + 1} | ${row.answerId} | ${Number(row.averageRank ?? 0).toFixed(2)} | ${row.votes ?? 0} |`);
    }
    for (const review of record.reviews) {
      lines.push("", `### ${copy.reviewerLabel} ${review.reviewerLabel ?? review.reviewerKey}`, "");
      for (const [index, item] of (review.ranking ?? []).entries()) {
        // Vote rows arrive as `{ answerId, averageRank }`; older records and
        // hand-written fixtures may still carry `{ anonymousId, rank }`.
        const answerId = item?.answerId ?? item?.anonymousId ?? "?";
        const rank = item?.rank ?? item?.averageRank ?? index + 1;
        lines.push(`- ${answerId} → ${rank}${item?.comment ? `：${item.comment}` : ""}`);
      }
      if (review.selfReview === true) lines.push("", `> ${copy.limitationSelfReview}`);
      if (review.error !== undefined) lines.push("", `> ${review.error}`);
    }
  }
  lines.push("");

  lines.push(copy.exportFinalHeading);
  if (record.finalAnswer === null || record.finalAnswer === undefined || record.finalAnswer.text === "") {
    lines.push(copy.noFinal);
  } else {
    const final = record.finalAnswer;
    if (final.fallback === true) lines.push(copy.fallbackFinal, "");
    const author = final.authorLabel === undefined ? "" : `${copy.finalAuthorLabel}${final.authorLabel}`;
    if (author !== "") lines.push(author, "");
    lines.push(final.text);
  }
  lines.push("");

  if (record.failures.length > 0) {
    lines.push(copy.exportFailuresHeading);
    for (const failure of record.failures) {
      const who = failure.entry?.modelName === undefined ? "" : ` · ${failure.entry.modelName}`;
      lines.push(`- ${failure.stage}${who}：${failure.message}`);
    }
    lines.push("");
  }

  const extra = uniqueStrings([...(record.limitations ?? []), ...(record.notes ?? [])]);
  if (extra.length > 0) {
    lines.push(copy.exportLimitationsHeading);
    for (const note of extra) lines.push(`- ${note}`);
    lines.push("");
  }

  const transcript = Array.isArray(record.transcript) ? record.transcript : [];
  if (transcript.length > 0) {
    lines.push(copy.exportTranscriptHeading);
    for (const entry of transcript) {
      const heading = [entry.title, entry.anonymousId, entry.error === undefined ? "" : `(${entry.error})`].filter((part) => part !== undefined && part !== "").join(" · ");
      lines.push("", `#### ${entry.at ?? ""} · ${heading}`, "", entry.text ?? "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
