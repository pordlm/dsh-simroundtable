/**
 * Persona (Role Card) schema — Phase 1, PR-2.
 *
 * A Persona is a reusable *viewpoint*, never a capability: it cannot name
 * tools, providers or models, and its text is escaped before it reaches a
 * prompt (see PR-3 `lib/prompts/persona.js`). Everything here is pure and
 * synchronous so a meeting can take a snapshot without yielding.
 */

/** Persona ids are lowercase slugs; built-in ids follow the same rule. */
export const PERSONA_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/u;

/** Longest accepted serialized persona (a card, not a document). */
export const PERSONA_MAX_BYTES = 6 * 1024;

/** Store-wide ceilings: custom cards, all cards, and the file on disk. */
export const PERSONA_STORE_LIMITS = Object.freeze({
  customPersonas: 50,
  totalPersonas: 64,
  fileBytes: 256 * 1024,
});

/** Per-field ceilings. Both "how long" and "how many items" are capped. */
export const PERSONA_FIELD_LIMITS = Object.freeze({
  name: 60,
  summary: 200,
  lens: 400,
  mission: 400,
  evidenceStandard: 400,
  tone: 120,
  domain: { items: 8, itemLength: 32 },
  priorities: { items: 8, itemLength: 60 },
  coreAssumptions: { items: 8, itemLength: 200 },
  blindSpots: { items: 8, itemLength: 200 },
  challengeRules: { items: 8, itemLength: 200 },
});

/**
 * The accepted field set. Anything else is rejected by name — silently
 * dropping unknown keys would hide a typo or an attempt to inject a field such
 * as `tools` into the prompt.
 */
export const PERSONA_FIELDS = Object.freeze([
  "id",
  "version",
  "name",
  "summary",
  "domain",
  "lens",
  "mission",
  "priorities",
  "coreAssumptions",
  "blindSpots",
  "challengeRules",
  "evidenceStandard",
  "tone",
  "builtin",
]);

/** Text fields (single string) and list fields (array of strings). */
const TEXT_FIELDS = Object.freeze([
  "name",
  "summary",
  "lens",
  "mission",
  "evidenceStandard",
  "tone",
]);
const LIST_FIELDS = Object.freeze([
  "domain",
  "priorities",
  "coreAssumptions",
  "blindSpots",
  "challengeRules",
]);

/** `personaBinding` modes; the default is `off` (decision ①A / ④A). */
export const PERSONA_BINDING_MODES = Object.freeze(["off", "opt-in"]);

export class PersonaError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PersonaError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

/** Fail-closed: an unknown or missing binding mode means Persona is off. */
export function personaBindingOf(config) {
  const mode = config?.personaBinding;
  return PERSONA_BINDING_MODES.includes(mode) ? mode : "off";
}

export function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function fail(code, message, details) {
  throw new PersonaError(code, message, details);
}

function assertText(field, raw, limits) {
  const value = raw ?? "";
  if (typeof value !== "string") fail("persona-field-type", `${field} must be a string`, { field });
  const trimmed = value.trim();
  if (trimmed.length > limits) {
    fail("persona-field-too-long", `${field} must be at most ${limits} characters`, {
      field,
      limit: limits,
    });
  }
  return trimmed;
}

function assertList(field, raw, limits) {
  if (raw === undefined) return Object.freeze([]);
  if (!Array.isArray(raw)) fail("persona-field-type", `${field} must be an array of strings`, { field });
  if (raw.length > limits.items) {
    fail("persona-too-many-items", `${field} must have at most ${limits.items} items`, {
      field,
      limit: limits.items,
    });
  }
  const items = raw.map((item) => {
    if (typeof item !== "string") {
      fail("persona-field-type", `${field} must contain only strings`, { field });
    }
    const trimmed = item.trim();
    if (trimmed.length > limits.itemLength) {
      fail("persona-field-too-long", `${field} items must be at most ${limits.itemLength} characters`, {
        field,
        limit: limits.itemLength,
      });
    }
    return trimmed;
  });
  return Object.freeze(items.filter((item) => item.length > 0));
}

/**
 * Validate and normalize one persona card.
 *
 * Returns a deeply frozen object with exactly the whitelisted fields. The
 * `builtin` flag is not taken from user input: callers that accept user input
 * must pass `builtin: false` and let the store decide, so a custom card can
 * never impersonate a built-in one.
 */
export function validatePersona(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail("persona-field-type", "a persona must be an object");
  }
  for (const key of Object.keys(raw)) {
    if (!PERSONA_FIELDS.includes(key)) {
      fail("persona-unknown-field", `unknown persona field: ${key}`, { field: key });
    }
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!PERSONA_ID_PATTERN.test(id)) {
    fail("persona-invalid-id", "persona id must be a lowercase slug of 2-48 characters", { field: "id" });
  }

  const version = raw.version ?? 1;
  if (!Number.isInteger(version) || version < 1 || version > 100) {
    fail("persona-invalid-version", "persona version must be an integer between 1 and 100", {
      field: "version",
    });
  }

  const persona = { id, version };
  for (const field of TEXT_FIELDS) persona[field] = assertText(field, raw[field], PERSONA_FIELD_LIMITS[field]);
  for (const field of LIST_FIELDS) persona[field] = assertList(field, raw[field], PERSONA_FIELD_LIMITS[field]);

  if (persona.name.length === 0) {
    fail("persona-invalid-name", "persona name must not be empty", { field: "name" });
  }
  persona.builtin = raw.builtin === true;

  const size = Buffer.byteLength(JSON.stringify(persona), "utf8");
  if (size > PERSONA_MAX_BYTES) {
    fail("persona-too-large", `persona must serialize to at most ${PERSONA_MAX_BYTES} bytes`, {
      bytes: size,
      limit: PERSONA_MAX_BYTES,
    });
  }

  return deepFreeze(persona);
}

/** Whether an id belongs to the built-in set (they are read-only). */
export function isBuiltinId(id, builtinIds) {
  return builtinIds.has(id);
}