/**
 * Workspace Persona storage — Phase 1, PR-2.
 *
 * Cards live in `<workspace>/.roundtable/personas/personas.json`, deliberately
 * one directory below the meeting records: `MeetingManager.list()` scans
 * `<workspace>/.roundtable/*.json` and a bare `personas.json` would match its
 * meeting-id pattern (eight characters) and be parsed as a meeting on every
 * poll.
 *
 * Reads and writes are synchronous. A meeting create() takes its snapshot
 * between reserving the concurrency slot and starting work; yielding there
 * would open a window for a second meeting to slip past the limit.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { ROUNDTABLE_DIR } from "../core.js";
import { BUILTIN_PERSONA_IDS, BUILTIN_PERSONAS, builtinPersona } from "./builtin.js";
import {
  deepFreeze,
  PersonaError,
  PERSONA_STORE_LIMITS,
  validatePersona,
} from "./schema.js";

/** Directory (inside `.roundtable/`) and file that own custom personas. */
export const PERSONA_DIRECTORY = "personas";
export const PERSONA_FILE = "personas.json";
export const PERSONA_FILE_VERSION = 1;

export function personaDirectory(workspace) {
  return join(workspace, ROUNDTABLE_DIR, PERSONA_DIRECTORY);
}

export function personaFilePath(workspace) {
  return join(personaDirectory(workspace), PERSONA_FILE);
}

const DEFAULT_FS = Object.freeze({
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
});

function fail(code, message, details) {
  throw new PersonaError(code, message, details);
}

export class PersonaStore {
  constructor({ workspace, fs: fileSystem = DEFAULT_FS } = {}) {
    this.workspace = workspace;
    this.fs = { ...DEFAULT_FS, ...fileSystem };
  }

  get filePath() {
    return personaFilePath(this.workspace);
  }

  /** Built-ins first (stable order), then custom cards in file order. */
  list() {
    return deepFreeze([...BUILTIN_PERSONAS, ...this.#readCustom()]);
  }

  get(id) {
    if (typeof id !== "string") return undefined;
    return this.list().find((card) => card.id === id);
  }

  /**
   * Create or replace a custom card.
   *
   * Built-in ids are read-only, and a custom card can never carry
   * `builtin: true`: the flag is owned by the code that ships the card.
   */
  save(input) {
    const raw = input === null || typeof input !== "object" ? input : { ...input };
    if (raw && typeof raw === "object" && raw.builtin === true) {
      fail("persona-builtin-readonly", "built-in personas are read-only and cannot be claimed", {
        field: "builtin",
      });
    }
    if (raw && typeof raw === "object" && BUILTIN_PERSONA_IDS.has(raw.id)) {
      fail("persona-builtin-readonly", `built-in persona ${raw.id} is read-only`, { personaId: raw.id });
    }

    const card = validatePersona({ ...raw, builtin: false });
    const custom = this.#readCustom();
    const existing = custom.findIndex((entry) => entry.id === card.id);
    const next = existing === -1 ? [...custom, card] : custom.map((entry, index) => (index === existing ? card : entry));

    if (next.length > PERSONA_STORE_LIMITS.customPersonas) {
      fail("persona-limit-exceeded", `at most ${PERSONA_STORE_LIMITS.customPersonas} custom personas`, {
        limit: PERSONA_STORE_LIMITS.customPersonas,
      });
    }
    if (BUILTIN_PERSONAS.length + next.length > PERSONA_STORE_LIMITS.totalPersonas) {
      fail("persona-limit-exceeded", `at most ${PERSONA_STORE_LIMITS.totalPersonas} personas in total`, {
        limit: PERSONA_STORE_LIMITS.totalPersonas,
      });
    }

    this.#writeCustom(next);
    return card;
  }

  /** Delete one custom card; built-ins can never be removed. */
  remove(id) {
    if (BUILTIN_PERSONA_IDS.has(id)) {
      fail("persona-builtin-readonly", `built-in persona ${id} is read-only`, { personaId: id });
    }
    const custom = this.#readCustom();
    const next = custom.filter((entry) => entry.id !== id);
    if (next.length === custom.length) {
      fail("persona-not-found", `persona ${id} was not found`, { personaId: id });
    }
    this.#writeCustom(next);
    return true;
  }

  /**
   * Frozen deep copies of the requested cards, keyed by id.
   *
   * The copy is what a meeting persists: renaming or deleting a card later must
   * not rewrite history. Unknown ids are simply absent from the result; the
   * caller decides whether that is a validation error (create) or an
   * `invalid` task (a snapshot that went missing).
   */
  snapshot(ids) {
    const wanted = ids === undefined ? undefined : new Set(ids);
    const cards = this.list();
    const result = {};
    for (const card of cards) {
      if (wanted !== undefined && !wanted.has(card.id)) continue;
      result[card.id] = deepFreeze(structuredClone(card));
    }
    return deepFreeze(result);
  }

  #readCustom() {
    let text;
    try {
      const stat = this.fs.statSync(this.filePath);
      if (stat.size > PERSONA_STORE_LIMITS.fileBytes) {
        fail(
          "personas-too-large",
          `personas.json must be at most ${PERSONA_STORE_LIMITS.fileBytes} bytes`,
          { bytes: stat.size, limit: PERSONA_STORE_LIMITS.fileBytes },
        );
      }
      text = this.fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (error instanceof PersonaError) throw error;
      if (error?.code === "ENOENT") return [];
      fail("personas-corrupt", `could not read personas.json: ${error?.message ?? error}`, {
        cause: error?.code,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      fail("personas-corrupt", `personas.json is not valid JSON: ${error.message}`, { cause: "parse" });
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("personas-corrupt", "personas.json must contain an object", { cause: "shape" });
    }
    if (parsed.version !== PERSONA_FILE_VERSION) {
      fail("personas-corrupt", `personas.json version must be ${PERSONA_FILE_VERSION}`, {
        cause: "version",
        version: parsed.version,
      });
    }
    if (!Array.isArray(parsed.personas)) {
      fail("personas-corrupt", "personas.json must contain a personas array", { cause: "shape" });
    }

    const seen = new Set();
    return parsed.personas.map((raw) => {
      const card = validatePersona(raw);
      if (card.builtin) {
        fail("persona-builtin-readonly", "custom persona store must not redeclare a built-in card", {
          personaId: card.id,
        });
      }
      if (BUILTIN_PERSONA_IDS.has(card.id)) {
        fail("persona-builtin-readonly", `persona ${card.id} collides with a built-in id`, {
          personaId: card.id,
        });
      }
      if (seen.has(card.id)) {
        fail("personas-corrupt", `duplicate persona id in personas.json: ${card.id}`, {
          personaId: card.id,
        });
      }
      seen.add(card.id);
      return card;
    });
  }

  /**
   * Atomic replace: write a sibling temporary file, then rename over the target
   * so a crash or a failing write can never truncate the readable store.
   */
  #writeCustom(personas) {
    const text = `${JSON.stringify({ version: PERSONA_FILE_VERSION, personas }, null, 2)}\n`;
    if (Buffer.byteLength(text, "utf8") > PERSONA_STORE_LIMITS.fileBytes) {
      fail("personas-too-large", `personas.json must be at most ${PERSONA_STORE_LIMITS.fileBytes} bytes`, {
        limit: PERSONA_STORE_LIMITS.fileBytes,
      });
    }

    const target = this.filePath;
    const temporary = `${target}.tmp`;
    try {
      this.fs.mkdirSync(dirname(target), { recursive: true });
      this.fs.writeFileSync(temporary, text, "utf8");
      this.fs.renameSync(temporary, target);
    } catch (error) {
      try {
        this.fs.unlinkSync(temporary);
      } catch {
        // The temporary file may never have been created; nothing to clean.
      }
      fail("personas-write-failed", `could not write personas.json: ${error?.message ?? error}`, {
        cause: error?.code,
      });
    }
  }
}

/** Convenience: a built-in card by id, or undefined. */
export { builtinPersona };