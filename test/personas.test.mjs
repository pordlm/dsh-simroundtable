/**
 * Persona infrastructure (PR-2).
 *
 * The store is deliberately dull: whitelisted fields, hard ceilings, atomic
 * writes, and built-ins that code owns. Nothing here is wired into a meeting
 * yet — `personaBinding` defaults to `off` and this batch never touches
 * `create()`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BUILTIN_PERSONAS } from "../lib/personas/builtin.js";
import {
  PersonaError,
  PERSONA_BINDING_MODES,
  personaBindingOf,
  validatePersona,
} from "../lib/personas/schema.js";
import {
  PERSONA_DIRECTORY,
  PERSONA_FILE,
  PersonaStore,
  personaDirectory,
  personaFilePath,
} from "../lib/personas/store.js";

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "persona-test-"));
}

function withWorkspace(run) {
  const workspace = makeWorkspace();
  try {
    return run(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function card(overrides = {}) {
  return { id: "focus-hunter", name: "焦点猎手", ...overrides };
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof PersonaError, `expected PersonaError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  };
}

test("unknown persona fields are rejected by name", () => {
  assert.throws(
    () => validatePersona({ ...card(), tools: ["write"] }),
    (error) => {
      assert.equal(error.code, "persona-unknown-field");
      assert.equal(error.details.field, "tools");
      assert.match(error.message, /tools/u);
      return true;
    },
  );
});

test("field, array and card ceilings are enforced", () => {
  assert.throws(
    () => validatePersona(card({ name: "x".repeat(61) })),
    (error) => {
      assert.equal(error.code, "persona-field-too-long");
      assert.equal(error.details.field, "name");
      return true;
    },
  );

  assert.throws(
    () =>
      validatePersona(
        card({ domain: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }),
      ),
    expectCode("persona-too-many-items"),
  );

  const filled = {
    summary: "s".repeat(200),
    lens: "l".repeat(400),
    mission: "m".repeat(400),
    evidenceStandard: "e".repeat(400),
    tone: "t".repeat(120),
    domain: Array.from({ length: 8 }, () => "d".repeat(32)),
    priorities: Array.from({ length: 8 }, () => "p".repeat(60)),
    coreAssumptions: Array.from({ length: 8 }, () => "c".repeat(200)),
    blindSpots: Array.from({ length: 8 }, () => "b".repeat(200)),
    challengeRules: Array.from({ length: 8 }, () => "r".repeat(200)),
  };
  assert.throws(() => validatePersona(card(filled)), expectCode("persona-too-large"));
});

test("built-in personas are read-only and cannot be impersonated", () => {
  withWorkspace((workspace) => {
    const store = new PersonaStore({ workspace });
    assert.ok(BUILTIN_PERSONAS.length >= 10);
    assert.equal(store.get("architect")?.builtin, true);
    assert.throws(() => store.save({ id: "architect", name: "Clone" }), expectCode("persona-builtin-readonly"));
    assert.throws(
      () => store.save({ ...card(), builtin: true }),
      expectCode("persona-builtin-readonly"),
    );
    assert.throws(() => store.remove("judge"), expectCode("persona-builtin-readonly"));
    assert.ok(Object.isFrozen(BUILTIN_PERSONAS[0]));
  });
});

test("snapshots are frozen deep copies, and history survives rename/delete", () => {
  withWorkspace((workspace) => {
    const store = new PersonaStore({ workspace });
    store.save(card({ name: "第一版" }));

    const first = store.snapshot(["focus-hunter", "architect"]);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first["focus-hunter"]));
    assert.ok(Object.isFrozen(first["focus-hunter"].domain));
    assert.throws(() => {
      first["focus-hunter"].name = "被篡改";
    }, TypeError);
    assert.equal(first["focus-hunter"].name, "第一版");

    store.save(card({ name: "第二版" }));
    const second = store.snapshot(["focus-hunter"]);
    assert.equal(second["focus-hunter"].name, "第二版");
    assert.equal(first["focus-hunter"].name, "第一版", "an old snapshot must not follow the card");

    store.remove("focus-hunter");
    assert.equal(store.snapshot(["focus-hunter"])["focus-hunter"], undefined);
    assert.equal(first["focus-hunter"].name, "第一版");
  });
});

test("writes are atomic and leave no temporary file behind", () => {
  withWorkspace((workspace) => {
    const store = new PersonaStore({ workspace });
    store.save(card());
    assert.deepEqual(readdirSync(personaDirectory(workspace)), [PERSONA_FILE]);
    assert.ok(personaFilePath(workspace).endsWith(join(".roundtable", PERSONA_DIRECTORY, PERSONA_FILE)));
  });
});

test("a failed write keeps the previous file readable", () => {
  withWorkspace((workspace) => {
    const store = new PersonaStore({ workspace });
    store.save(card({ name: "可恢复版本" }));

    const failing = new PersonaStore({
      workspace,
      fs: {
        renameSync() {
          throw Object.assign(new Error("rename denied"), { code: "EPERM" });
        },
      },
    });
    assert.throws(() => failing.save(card({ name: "不会落地" })), expectCode("personas-write-failed"));

    const reopened = new PersonaStore({ workspace });
    assert.equal(reopened.get("focus-hunter").name, "可恢复版本");
    assert.deepEqual(readdirSync(personaDirectory(workspace)), [PERSONA_FILE], "no .tmp may survive");
  });
});

test("store ceilings stop unbounded growth", () => {
  withWorkspace((workspace) => {
    const store = new PersonaStore({ workspace });
    let code;
    for (let index = 0; index < 60; index += 1) {
      try {
        store.save({
          id: `card-${String(index).padStart(2, "0")}`,
          name: `Card ${index}`,
          challengeRules: Array.from({ length: 8 }, () => "x".repeat(200)),
        });
      } catch (error) {
        code = error.code;
        break;
      }
    }
    assert.ok(
      code === "persona-limit-exceeded" || code === "personas-too-large",
      `expected a ceiling, got ${code}`,
    );
  });
});

test("the personas file is invisible to meeting listing", async () => {
  const { MeetingManager } = await import("../lib/meetings.js");
  withWorkspace((workspace) => {
    const manager = new MeetingManager({
      ctx: {},
      config: {},
      copyFor: () => ({}),
      resolveLocale: () => "zh",
    });
    const store = new PersonaStore({ workspace });
    store.save(card());

    assert.equal(manager.list(workspace, 200).meetings.length, 0);

    // The hazard this layout avoids: a bare personas.json would match the
    // meeting-id pattern and be parsed on every poll. The decoy is skipped as
    // corrupt; the real store is one directory down and never scanned.
    const top = join(workspace, ".roundtable");
    writeFileSync(join(top, "personas.json"), "", "utf8");
    assert.equal(manager.list(workspace, 200).meetings.length, 0);
    assert.ok(personaFilePath(workspace).includes(join(PERSONA_DIRECTORY, PERSONA_FILE)));
  });
});

test("personaBinding is off unless explicitly opt-in", () => {
  assert.deepEqual(PERSONA_BINDING_MODES, ["off", "opt-in"]);
  assert.equal(personaBindingOf({}), "off");
  assert.equal(personaBindingOf({ personaBinding: "yes" }), "off");
  assert.equal(personaBindingOf({ personaBinding: "opt-in" }), "opt-in");
});