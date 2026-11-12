// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Protocol contract: the shape every deliberation protocol implements.
 *
 * PR-1 ships the contract and the registry only — no protocol is dispatched
 * from the production path yet. Keeping the hook list in one frozen array lets
 * the registry, the runner and the adapter tests agree on the same surface
 * without importing each other's internals.
 *
 * @typedef {object} ProtocolMetadata
 * @property {string} id Stable id, e.g. `roundtable`.
 * @property {number} version Metadata version, bumped when semantics change.
 * @property {boolean} experimental Hidden unless experimental protocols are
 *   explicitly enabled. Must not be used to hide a promised Persona selector.
 * @property {string} description Human-readable summary for the API.
 * @property {readonly string[]} stages Stages this protocol walks, in order.
 * @property {readonly string[]} roles Seats this protocol needs.
 *
 * @typedef {object} Protocol
 * @property {() => ProtocolMetadata} metadata
 * @property {(request: object) => void} validateRequest
 * @property {(request: object) => object} createState
 * @property {(state: object) => string | null} nextStage
 * @property {(state: object, stage: string) => object[]} buildTasks
 * @property {(context: object) => string} buildPrompt
 * @property {object} outputSchema
 * @property {(task: object, result: object) => object} normalizeResult
 * @property {(state: object, stage: string, results: object[]) => object} reduce
 * @property {(state: object) => boolean} isComplete
 * @property {(state: object) => object} buildReport
 */

/** Every hook a protocol implementation must provide, in call order. */
export const PROTOCOL_HOOKS = Object.freeze([
  "metadata",
  "validateRequest",
  "createState",
  "nextStage",
  "buildTasks",
  "buildPrompt",
  "outputSchema",
  "normalizeResult",
  "reduce",
  "isComplete",
  "buildReport",
]);

/**
 * Request-level protocol failure with a stable code for the API envelope.
 *
 * The pure layers (registry, participants) throw this; `create()` turns it
 * into a 400 later, and nothing here touches HTTP.
 */
export class ProtocolError extends Error {
  /**
   * @param {string} code Stable machine code, e.g. `unknown-protocol`.
   * @param {string} message Human-readable message.
   */
  constructor(code, message) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}