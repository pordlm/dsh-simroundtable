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
import { roundtableV2 } from "./roundtable-v2.js";
import { ProtocolError } from "./types.js";

const DEFAULT_PROTOCOL_ID = ROUNDTABLE_ID;

/** @type {Map<string, object>} */
const protocols = new Map([[roundtableProtocol.id, roundtableProtocol]]);

/**
 * Versioned runtime protocols. `enabled` is the production switch: PR-3 ships
 * the v2 adapter registered but disabled, so nothing can reach it until PR-4
 * wires `MeetingManager.create()` and PR-5 exposes a selector.
 *
 * The public `requireProtocol(id)` still answers with the v1 protocol: a
 * request that names only "roundtable" keeps the 0.6.1 behaviour.
 */
const runtimeProtocols = new Map([
  ["roundtable@1", Object.freeze({ protocol: roundtableProtocol, enabled: true })],
  ["roundtable@2", Object.freeze({ protocol: roundtableV2, enabled: false })],
]);

export function protocolVersionKey(id, version) {
  return `${String(id)}@${String(version)}`;
}

/**
 * Look up a versioned protocol without enabling it.
 *
 * @returns {object | null} The protocol object, or null when not registered.
 */
export function protocolFor(id, version) {
  const entry = runtimeProtocols.get(protocolVersionKey(id, version));
  return entry === undefined ? null : entry.protocol;
}

/** Whether a versioned protocol may be used by the runtime right now. */
export function protocolEnabled(id, version) {
  const entry = runtimeProtocols.get(protocolVersionKey(id, version));
  return entry !== undefined && entry.enabled === true;
}

/** Versions registered for one protocol id, enabled or not (for diagnostics). */
export function protocolVersions(id) {
  const prefix = `${String(id)}@`;
  return Object.freeze(
    [...runtimeProtocols.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length)),
  );
}

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