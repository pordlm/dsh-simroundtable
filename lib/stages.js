// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Stage vocabulary shared by the meeting manager and protocol descriptors.
 *
 * The manager used to keep a private `stageIndexOf`, which meant a protocol
 * could not describe the same ordering without copying it. Keeping the order
 * here makes the private copy impossible and lets both sides be tested against
 * one constant.
 */
export const STAGE_ORDER = Object.freeze(["answering", "discussing", "reviewing", "deciding"]);

/** Roundtable runs with `rounds: 0` skip the discussion stage entirely. */
export const STAGE_ORDER_WITHOUT_DISCUSSION = Object.freeze(["answering", "reviewing", "deciding"]);

/**
 * The stages a meeting actually walks, in order.
 *
 * @param {number} rounds Cross-examination rounds; `0` skips `discussing`.
 * @returns {readonly string[]}
 */
export function stageOrderFor(rounds) {
  return rounds > 0 ? STAGE_ORDER : STAGE_ORDER_WITHOUT_DISCUSSION;
}

/**
 * One-based progress index for `stage`, matching `progress.stage` semantics.
 * Unknown stages report `0` rather than throwing, as the manager always has.
 *
 * @param {string} stage
 * @param {number} rounds
 * @returns {number}
 */
export function stageIndexOf(stage, rounds) {
  const index = stageOrderFor(rounds).indexOf(stage);
  return index < 0 ? 0 : index + 1;
}