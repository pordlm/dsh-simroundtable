// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Protocol registry.
 *
 * The registry owns the list of known protocols and answers two questions:
 * "which protocol does this request mean?" (default: roundtable) and "what may
 * the surface show?" (experimental protocols stay hidden unless enabled).
 *
 * The internal `Map` is private: callers receive frozen arrays, so a surface
 * cannot mutate the registry by pushing into a returned list.
 */
import { ROUNDTABLE_ID, roundtableProtocol } from "./roundtable-protocol.js";
import { ProtocolError } from "./types.js";

const DEFAULT_PROTOCOL_ID = ROUNDTABLE_ID;

/** @type {Map<string, object>} */
const protocols = new Map([[roundtableProtocol.id, roundtableProtocol]]);

/**
 * Known protocols, in registration order.
 *
 * @param {object} [options]
 * @param {boolean} [options.includeExperimental] Include protocols whose
 *   `experimental` flag is set. Defaults to false.
 * @returns {readonly object[]} Frozen array; entries are frozen descriptors.
 */
export function listProtocols(options = {}) {
  const includeExperimental = options?.includeExperimental === true;
  const visible = [...protocols.values()].filter(
    (protocol) => includeExperimental || protocol.experimental !== true,
  );
  return Object.freeze(visible);
}

/**
 * Resolve a requested protocol id.
 *
 * An omitted id (`undefined`/`null`) means the default roundtable, which is why
 * `/roundtable`, the model tool and the page keep working unchanged.
 *
 * @param {string | null | undefined} id
 * @returns {object} Frozen protocol descriptor.
 * @throws {ProtocolError} `unknown-protocol` when the id is not registered.
 */
export function requireProtocol(id) {
  const wanted = id === undefined || id === null ? DEFAULT_PROTOCOL_ID : id;
  if (typeof wanted !== "string" || wanted.trim() === "") {
    throw new ProtocolError("unknown-protocol", `Unknown protocol: ${String(id)}`);
  }
  const protocol = protocols.get(wanted.trim());
  if (protocol === undefined) {
    throw new ProtocolError("unknown-protocol", `Unknown protocol: ${wanted}`);
  }
  return protocol;
}

/** The protocol a request means when it does not name one. */
export function defaultProtocolId() {
  return DEFAULT_PROTOCOL_ID;
}