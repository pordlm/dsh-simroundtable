/**
 * Prompt composition for roundtable-v2 — Phase 1, PR-3.
 *
 * Layer order (design §4.4): global safety rules and stage rules (layer 1+2+4
 * live in the untouched v1 constructor), persona card (layer 3), then the topic
 * and quoted material (5–7, also from the v1 constructor).
 *
 * The important property is the fallback: a seat without a persona returns the
 * v1 constructor's string verbatim — not "equivalent", byte-identical. That is
 * what keeps the no-Persona path indistinguishable from 0.6.1.
 */
import { answerPrompt, arbiterPrompt, discussionPrompt, reviewPrompt } from "../prompts.js";
import { ProtocolError } from "./types.js";
import { personaBlock } from "../prompts/persona.js";

/** Every stage the roundtable adapter can emit. */
export const COMPOSER_STAGES = Object.freeze(["answer", "discussion", "review", "arbiter"]);

/**
 * Rebuild exactly the v1 prompt for one task.
 *
 * Exported so the adapter and its tests can assert the fallback without going
 * through persona rendering.
 */
export function v1StagePrompt(task, context = {}) {
  const topic = task.topic ?? context.topic;
  const attachments = task.attachments ?? context.attachments ?? [];
  const language = task.language ?? context.language;

  switch (task.stage) {
    case "answer":
      return answerPrompt(topic, attachments, language, { web: task.web !== false });
    case "discussion":
      return discussionPrompt(topic, task.answers ?? [], language);
    case "review":
      return reviewPrompt(topic, task.answers ?? [], language);
    case "arbiter":
      return arbiterPrompt(topic, task.answers ?? [], task.reviews ?? [], attachments, language);
    default:
      throw new ProtocolError("unknown-stage", `unknown protocol stage: ${String(task.stage)}`, {
        stage: task.stage,
      });
  }
}

/**
 * Compose one stage prompt.
 *
 * `persona` is a frozen snapshot from the meeting record. No persona means the
 * v1 string, unchanged; with one, the card is prepended as fenced reference
 * data while the stage rules and quoted material stay exactly as v1 wrote them.
 */
export function composeStagePrompt({ task, context, persona, nonce } = {}) {
  const base = v1StagePrompt(task, context);
  if (persona === null || persona === undefined) return base;
  return `${personaBlock(persona, { nonce })}\n\n${base}`;
}