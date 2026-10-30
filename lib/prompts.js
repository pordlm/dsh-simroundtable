/**
 * Prompts and structured-output schemas for the roundtable stages.
 *
 * Prompts are deliberately in English (models follow them reliably) while the
 * first rule always asks for the topic's language, so a Chinese topic produces
 * Chinese answers and a Chinese final result.
 */

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    evaluations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          answerId: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
        },
        required: ["answerId", "strengths", "weaknesses"],
      },
    },
    consensus: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    coverageGaps: { type: "array", items: { type: "string" } },
    uniqueInsights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          answerId: { type: "string" },
          insight: { type: "string" },
        },
        required: ["answerId", "insight"],
      },
    },
    blindSpots: { type: "array", items: { type: "string" } },
    ranking: { type: "array", items: { type: "string" } },
  },
  required: [
    "evaluations",
    "consensus",
    "contradictions",
    "coverageGaps",
    "uniqueInsights",
    "blindSpots",
    "ranking",
  ],
};

export const ARBITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answerMarkdown: { type: "string" },
    consensus: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    blindSpots: { type: "array", items: { type: "string" } },
    confidenceNotes: { type: "array", items: { type: "string" } },
  },
  required: ["answerMarkdown", "consensus", "contradictions", "blindSpots", "confidenceNotes"],
};

function quoteTopic(topic) {
  return `"""\n${topic}\n"""`;
}

function renderAnswers(answers) {
  return answers.map((answer) => `### Answer ${answer.id}\n\n${answer.text}`).join("\n\n");
}

function renderReviews(reviews) {
  return JSON.stringify(
    reviews.map((review) => ({
      ranking: review.ranking,
      consensus: review.consensus,
      contradictions: review.contradictions,
      blindSpots: review.blindSpots,
      uniqueInsights: review.uniqueInsights,
    })),
    null,
    2,
  );
}

export function answerPrompt(topic) {
  return [
    "You are one participant in a multi-model roundtable. Other participants are different models from different providers. Answer the topic below independently and rigorously.",
    "",
    "Rules:",
    "- Write in the same language as the topic.",
    "- Be concrete and concise. State important assumptions and uncertainty.",
    "- You may call web_search/web_fetch at most twice, and only when current facts are genuinely needed; otherwise answer from your own knowledge.",
    "- Do not ask the user questions or wait for clarification.",
    "- Do not mention being an AI model, your provider, or the roundtable setup.",
    '- End with exactly one line: "Confidence: high|medium|low — <short reason>".',
    "",
    "Topic:",
    quoteTopic(topic),
  ].join("\n");
}

export function discussionPrompt(topic, answers) {
  return [
    "You are one participant in a roundtable. Below are anonymized answers from all participants to the same topic. Read them, then write YOUR revised final answer.",
    "",
    "Rules:",
    "- Write in the same language as the topic.",
    '- Do not refer to "Answer A/B" or to other participants; write a self-contained answer.',
    "- Correct errors, fill important omissions, and state unresolved uncertainty.",
    "- Do not use tools.",
    "- Keep it under about 700 words.",
    "- Output only the revised answer.",
    "",
    "Topic:",
    quoteTopic(topic),
    "",
    "Anonymized answers:",
    renderAnswers(answers),
  ].join("\n");
}

export function reviewPrompt(topic, answers) {
  return [
    "You are a review model in a roundtable. Compare the anonymized final answers below. Do NOT write your own answer to the topic.",
    "",
    "The authors are hidden. If one of these answers happens to be your own, judge it on merit exactly like the others; do not favor it and do not penalize it.",
    "Long answers may be truncated before you see them; judge what is shown and say so when a gap looks like truncation.",
    "",
    "Return ONE JSON object with exactly this shape:",
    "{",
    '  "ranking": ["A", "B", "C"],',
    '  "evaluations": [{"answerId": "A", "strengths": ["..."], "weaknesses": ["..."]}],',
    '  "consensus": ["..."],',
    '  "contradictions": ["..."],',
    '  "coverageGaps": ["..."],',
    '  "uniqueInsights": [{"answerId": "A", "insight": "..."}],',
    '  "blindSpots": ["..."]',
    "}",
    "",
    "Rules:",
    "- answerId and ranking values must be exactly the labels shown below.",
    "- ranking must list every answer exactly once, best first.",
    "- Write the ranking key first: replies can be cut off at the length limit, and the vote must already be on the page when that happens.",
    "- Judge correctness, completeness, specificity, and calibration; ignore length and style.",
    "- Keep every list item to one short sentence; do not restate the answers.",
    "- Write all prose in the same language as the topic.",
    "- No prose outside the JSON.",
    "- If the structured_output tool is available, submit the object through it; otherwise print only the JSON.",
    "",
    "Topic:",
    quoteTopic(topic),
    "",
    "Anonymized answers:",
    renderAnswers(answers),
  ].join("\n");
}

/**
 * Compact retry for a reviewer whose full report was cut off by the completion
 * limit. Only the vote is requested, so a small budget still fits.
 */
export function reviewRankingPrompt(topic, answers) {
  return [
    "You are a review model in a roundtable. Rank the anonymized final answers below; do NOT write your own answer.",
    "",
    "Print ONE JSON object and nothing else:",
    '{"ranking": ["A", "B", "C"]}',
    "",
    "Rules:",
    "- Use exactly the labels shown below, each exactly once, best first.",
    "- Judge correctness, completeness, specificity, and calibration; ignore length and style.",
    "- Do not restate the answers and do not explain the ranking.",
    "",
    "Topic:",
    quoteTopic(topic),
    "",
    "Anonymized answers:",
    renderAnswers(answers),
  ].join("\n");
}

/**
 * Last-resort retry for an arbiter that exhausted its budget before closing the
 * JSON envelope: ask for the final answer alone, as plain markdown.
 */
export function arbiterPlainPrompt(topic, answers, reviews) {
  return [
    "You are the arbiter of a multi-model roundtable. Write the final answer for the user as plain Markdown.",
    "",
    "Rules:",
    "- Write in the same language as the topic.",
    "- Synthesize the strongest correct content. Do not average contradictions: choose a position and explain why in one sentence.",
    "- Lead with the direct answer, then the key reasoning, then caveats.",
    "- Do not mention models, providers, answer labels, or the roundtable process.",
    "- Do not wrap the answer in JSON or in a code fence.",
    "",
    "Topic:",
    quoteTopic(topic),
    "",
    "Anonymized answers:",
    renderAnswers(answers),
    "",
    "Reviewer rankings and observations:",
    renderReviews(reviews),
  ].join("\n");
}

export function arbiterPrompt(topic, answers, reviews) {
  return [
    "You are the arbiter of a multi-model roundtable. Write the final answer for the user.",
    "",
    "Rules:",
    "- Write in the same language as the topic.",
    "- Synthesize the strongest correct content. Do not average contradictions: choose a position and explain why in one sentence.",
    "- Lead with the direct answer, then the key reasoning, then caveats.",
    "- Do not mention models, providers, answer labels, or the roundtable process.",
    "- Be concrete and useful; aim for 600–1200 words unless the topic needs otherwise.",
    "- If the structured_output tool is available, submit the object below through it; otherwise print only this JSON object.",
    "{",
    '  "answerMarkdown": "the final answer for the user",',
    '  "consensus": ["..."],',
    '  "contradictions": ["..."],',
    '  "blindSpots": ["..."],',
    '  "confidenceNotes": ["..."]',
    "}",
    "",
    "Topic:",
    quoteTopic(topic),
    "",
    "Anonymized answers:",
    renderAnswers(answers),
    "",
    "Reviewer rankings and observations:",
    renderReviews(reviews),
  ].join("\n");
}