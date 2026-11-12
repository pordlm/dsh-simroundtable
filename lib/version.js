// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Record version accessors.
 *
 * Every reader (detail, history, export, report) asks these three questions
 * through this module instead of sniffing keys inline. The accessors are pure:
 * reading a v1 record must not rewrite it (D9), and `protocolOf` must not call
 * `requireProtocol`, so an unknown future protocol still renders read-only.
 */
import { participantsOf } from "./participants.js";

/** What a record without a `protocol` field means. */
export const LEGACY_PROTOCOL = Object.freeze({ id: "roundtable", version: 1 });

/**
 * The protocol a record was produced by.
 *
 * Takes `record.protocol` verbatim when present — including an id this build
 * does not know — because read-only rendering must not depend on the registry.
 *
 * @param {object} record
 * @returns {{id: string, version: number}}
 */
export function protocolOf(record) {
  const protocol = record?.protocol;
  if (protocol && typeof protocol === "object" && typeof protocol.id === "string") {
    return protocol;
  }
  return LEGACY_PROTOCOL;
}

/**
 * Stored record version; anything that is not an explicit v2 reads as v1.
 *
 * @param {object} record
 * @returns {1 | 2}
 */
export function recordVersionOf(record) {
  return record?.version === 2 ? 2 : 1;
}

export { participantsOf };