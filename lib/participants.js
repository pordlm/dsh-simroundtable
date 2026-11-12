// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Seats, identity and the v1 roster projection.
 *
 * Four keys with one job each (identity model v3):
 *
 * - `participantId` — the seat. Unique within one meeting, and the only key
 *   allowed to label a transcript actor. Client-provided ids and server
 *   generated `p1…pN` ids go through the same normalizer and are then
 *   equivalent; no branch may treat them differently after that point.
 * - `modelRouteKey` — `provider/model`. The only key that decides
 *   independence: a second Persona on the same model is not a second opinion.
 * - `seatFingerprint` — route + persona + role. Used only to disclose
 *   same-origin seats; never as identity.
 * - `roster.key` — the v1 shape (`provider/model`), produced by
 *   `participantsToRoster` so exports and self-review keep working.
 *
 * `participantsOf` is a pure read: on a v1 record it derives the seats from the
 * stored roster and never writes them back.
 */
import { ProtocolError } from "./protocols/types.js";

/** Seats ids are short, URL-safe, and start with an alphanumeric character. */
export const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** v2 seats per meeting; v1 keeps its own 2–8 / 1–8 roster limits. */
export const DEFAULT_PARTICIPANT_LIMITS = Object.freeze({ min: 2, max: 8 });

export const PARTICIPANT_ROLES = Object.freeze(["answerer", "reviewer", "arbiter"]);

function messageFor(copy, key, fallback) {
  const text = copy?.[key];
  return typeof text === "string" && text !== "" ? text : fallback;
}

/**
 * `provider/model` — the identity used for independence and self-review.
 *
 * @param {{provider?: string, model?: string}} participant
 * @returns {string}
 */
export function modelRouteKey(participant) {
  const provider = participant?.provider;
  const model = participant?.model;
  if (typeof provider !== "string" || provider === "" || typeof model !== "string" || model === "") {
    throw new ProtocolError("invalid-participant", "A participant needs both provider and model.");
  }
  return `${provider}/${model}`;
}

/**
 * Route + persona + role. Only for same-origin disclosure and UI grouping.
 *
 * @param {{provider?: string, model?: string, personaId?: string | null, role?: string}} participant
 * @returns {string}
 */
export function seatFingerprint(participant) {
  return `${modelRouteKey(participant)}#${participant?.personaId ?? "none"}#${participant?.role}`;
}

/**
 * The set of independent voices: one entry per distinct model route.
 *
 * @param {Array<{provider?: string, model?: string}>} participants
 * @returns {Set<string>}
 */
export function independentSet(participants) {
  return new Set((participants ?? []).map((participant) => modelRouteKey(participant)));
}

function compact(object) {
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) delete object[key];
  }
  return object;
}

/**
 * Normalize one requested seat.
 *
 * @param {object} raw Requested seat; may carry `id`/`participantId`.
 * @param {string} [role] Seat role; defaults to `raw.role`.
 * @param {number} [index] Zero-based position, used to generate `p<n>` ids.
 * @returns {object} Normalized seat with derived `modelRouteKey` and
 *   `seatFingerprint`.
 */
export function normalizeParticipant(raw, role, index = 0) {
  const source = raw ?? {};
  const resolvedRole = role ?? source.role;
  if (!PARTICIPANT_ROLES.includes(resolvedRole)) {
    throw new ProtocolError("invalid-participant-role", `Unknown participant role: ${String(resolvedRole)}`);
  }

  const provided = source.participantId ?? source.id;
  const participantId = provided === undefined ? `p${index + 1}` : provided;
  if (typeof participantId !== "string" || !PARTICIPANT_ID_PATTERN.test(participantId)) {
    throw new ProtocolError("invalid-participant-id", `Invalid participant id: ${String(participantId)}`);
  }

  const personaId = source.personaId ?? null;
  if (personaId !== null && (typeof personaId !== "string" || personaId.trim() === "")) {
    throw new ProtocolError("invalid-participant", "personaId must be a non-empty string when present.");
  }

  const participant = {
    participantId,
    role: resolvedRole,
    provider: source.provider,
    model: source.model,
    providerName: source.providerName,
    modelName: source.modelName,
    label: source.label,
    personaId,
  };
  participant.modelRouteKey = modelRouteKey(participant);
  participant.seatFingerprint = seatFingerprint(participant);
  return participant;
}

/**
 * Normalize and validate a requested participant list.
 *
 * Duplicate `participantId`s are rejected because the progress updater keys
 * seats by id; duplicates would silently update the first seat twice. A
 * duplicate *seat* (same route, persona and role) is allowed: it is a valid
 * request, disclosed as same-origin, not an identity clash.
 *
 * @param {object[]} list
 * @param {{min?: number, max?: number}} [limits]
 * @param {object} [copy]
 * @returns {object[]} Normalized seats, in request order.
 */
export function validateParticipants(list, limits = DEFAULT_PARTICIPANT_LIMITS, copy) {
  if (!Array.isArray(list)) {
    throw new ProtocolError("invalid-participant", messageFor(copy, "participantsMustBeList", "participants must be an array."));
  }
  const min = limits?.min ?? DEFAULT_PARTICIPANT_LIMITS.min;
  const max = limits?.max ?? DEFAULT_PARTICIPANT_LIMITS.max;
  if (list.length < min || list.length > max) {
    throw new ProtocolError(
      "participant-count",
      messageFor(copy, "participantCount", `Expected ${min}–${max} participants, received ${list.length}.`),
    );
  }

  const normalized = list.map((raw, index) => normalizeParticipant(raw, raw?.role, index));
  const seen = new Set();
  for (const participant of normalized) {
    if (seen.has(participant.participantId)) {
      throw new ProtocolError(
        "duplicate-participant-id",
        messageFor(copy, "duplicateParticipantId", `Duplicate participantId: ${participant.participantId}`),
      );
    }
    seen.add(participant.participantId);
  }
  return normalized;
}

/**
 * Read the seats of a record without mutating it.
 *
 * v2 records carry `participants`; v1 records only have the roster, so the
 * seats are derived per call and never written back. The synthesized v1 ids
 * are stable within one read and exist only for projection.
 *
 * @param {object} record
 * @returns {object[]}
 */
export function participantsOf(record) {
  if (!record || typeof record !== "object") return [];

  if (Array.isArray(record.participants)) {
    return record.participants.map((seat, index) =>
      normalizeParticipant(seat, seat?.role, index),
    );
  }

  const roster = record.roster ?? {};
  const seats = [];
  for (const role of PARTICIPANT_ROLES) {
    const entries = role === "arbiter" ? (roster.arbiter === undefined ? [] : [roster.arbiter]) : (roster[`${role}s`] ?? []);
    entries.forEach((entry, index) => {
      seats.push(
        normalizeParticipant(
          {
            participantId: entry?.participantId ?? `${role}-${index + 1}`,
            role,
            provider: entry?.provider,
            model: entry?.model,
            providerName: entry?.providerName,
            modelName: entry?.modelName,
            label: entry?.label,
          },
          role,
          index,
        ),
      );
    });
  }
  return seats;
}

/**
 * Project seats back to the v1 roster shape.
 *
 * `key` is always `provider/model`; v1 consumers (`answererKeys`, exports,
 * `memberOf`) rely on that.
 *
 * @param {object[]} participants
 * @returns {{answerers: object[], reviewers: object[], arbiter?: object}}
 */
export function participantsToRoster(participants) {
  const roster = { answerers: [], reviewers: [] };
  for (const participant of participants ?? []) {
    const slot = compact({
      key: participant.modelRouteKey ?? modelRouteKey(participant),
      provider: participant.provider,
      providerName: participant.providerName,
      model: participant.model,
      modelName: participant.modelName,
      label: participant.label,
    });
    if (participant.role === "answerer") roster.answerers.push(slot);
    else if (participant.role === "reviewer") roster.reviewers.push(slot);
    else if (participant.role === "arbiter") roster.arbiter = slot;
  }
  return roster;
}