/**
 * Verification probes for docs/fix-0.7-verification.md (task t29).
 *
 * Not part of `npm test` (test/manual/ stays out of the suite). Run with:
 *   node test/manual/probe-fix-0.7-regression.mjs
 *
 * Uses the shared fake-host harness — no real model calls, no deployment.
 */
import assert from "node:assert/strict";
import { readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  SEATS,
  makeContext,
  makeManager,
  makeSpawner,
  makeWorkspace,
  optInConfig,
  config,
  onDiskRecord,
  runToEnd,
  v2CreateInput,
} from "../helpers/v2-harness.mjs";
import { PersonaStore } from "../../lib/personas/store.js";
import { normalizeConfig } from "../../lib/core.js";

const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      ${evidence}`);
}

function fileState(workspace, id) {
  const path = join(workspace, ".roundtable", `${id}.json`);
  const stats = statSync(path);
  return { path, bytes: readFileSync(path), mtime: stats.mtimeMs };
}

// ── A. v1 golden invariance: detail/list/markdown must not touch the record ──
{
  const workspace = makeWorkspace();
  const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
  const detail = await manager.create({
    topic: "v1 golden invariance",
    workspace,
    rounds: 0,
    answerers: ["p1/p1-model", "p2/p2-model"],
    reviewers: ["p1/p1-model"],
    arbiter: "p2/p2-model",
  });
  await runToEnd(manager, detail);
  const before = fileState(workspace, detail.id);
  manager.detail(workspace, detail.id);
  manager.list(workspace);
  manager.markdown(workspace, detail.id);
  const after = fileState(workspace, detail.id);
  record(
    "A1 v1 record bytes+mtime unchanged after detail/list/markdown",
    before.bytes.equals(after.bytes) && before.mtime === after.mtime,
    `bytes equal=${before.bytes.equals(after.bytes)}, mtime ${before.mtime} → ${after.mtime}`,
  );
  const disk = onDiskRecord(workspace, detail.id);
  record(
    "A2 v1 record has no protocol/participants fields (version stays 1)",
    disk.protocol === undefined && disk.participants === undefined && disk.version === 1,
    `protocol=${JSON.stringify(disk.protocol)}, participants=${JSON.stringify(disk.participants)}, version=${JSON.stringify(disk.version)}, status=${disk.status}`,
  );
  const markdown = manager.markdown(workspace, detail.id);
  record(
    "A3 v1 markdown export renders",
    typeof markdown === "string" && markdown.startsWith("# "),
    `markdown head=${JSON.stringify(markdown.slice(0, 40))}, chars=${markdown.length}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── B. single persona seat lifts the run to v2 ──
{
  const workspace = makeWorkspace();
  const store = new PersonaStore({ workspace });
  store.save({ id: "focus-hunter", name: "焦点猎手" });
  const seats = SEATS.map((seat, index) => (index === 0 ? { ...seat, personaId: "focus-hunter" } : seat));
  const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), optInConfig);
  const detail = await manager.create(v2CreateInput("single persona seat", seats, { workspace }));
  await runToEnd(manager, detail);
  const disk = onDiskRecord(workspace, detail.id);
  const personas = (disk.participants ?? []).map((p) => p.personaId).filter(Boolean);
  record(
    "B1 single persona seat → v2 (protocol v2 + participants, one persona)",
    disk.protocol?.id === "roundtable" && disk.protocol?.version === 2
      && Array.isArray(disk.participants) && personas.length === 1 && personas[0] === "focus-hunter",
    `protocol=${JSON.stringify(disk.protocol)}, participants=${disk.participants?.length}, personas=${JSON.stringify(personas)}, status=${disk.status}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── C. all persona seats → v2 ──
{
  const workspace = makeWorkspace();
  const store = new PersonaStore({ workspace });
  store.save({ id: "focus-hunter", name: "焦点猎手" });
  store.save({ id: "red-teamer", name: "红队" });
  const seats = SEATS.map((seat, index) => ({
    ...seat,
    personaId: index % 2 === 0 ? "focus-hunter" : "red-teamer",
  }));
  const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), optInConfig);
  const detail = await manager.create(v2CreateInput("all persona seats", seats, { workspace }));
  await runToEnd(manager, detail);
  const disk = onDiskRecord(workspace, detail.id);
  const personas = (disk.participants ?? []).map((p) => p.personaId).filter(Boolean);
  record(
    "C1 all persona seats → v2 (4/4 seats carry personas)",
    disk.protocol?.version === 2 && personas.length === seats.length,
    `protocol=${JSON.stringify(disk.protocol)}, seats=${disk.participants?.length}, personas=${JSON.stringify(personas)}, status=${disk.status}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── D. 9 participants are refused with 400 before any child starts ──
{
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const manager = makeManager(makeContext({ workspace, spawner }), optInConfig);
  const seats = [];
  for (let i = 0; i < 5; i += 1) seats.push({ id: `a${i + 1}`, provider: "p1", model: "p1-model", role: "answerer" });
  for (let i = 0; i < 3; i += 1) seats.push({ id: `r${i + 1}`, provider: "p2", model: "p2-model", role: "reviewer" });
  seats.push({ id: "j1", provider: "p2", model: "p2-model", role: "arbiter" });
  let outcome;
  try {
    await manager.create(v2CreateInput("9 seats", seats, { workspace }));
    outcome = "created (BUG)";
  } catch (error) {
    outcome = `400 ${error.code}: ${error.message}`;
  }
  record(
    "D1 9 participants → 400 participant-count (backend gate)",
    outcome.startsWith("400 participant-count") && spawner.calls.length === 0,
    `${outcome}; child activations=${spawner.calls.length}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── E. empty reviewer list falls back to peer review (server-level) ──
{
  const workspace = makeWorkspace();
  const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), optInConfig);
  const seats = [
    { id: "a1", provider: "p1", model: "p1-model", role: "answerer" },
    { id: "a2", provider: "p2", model: "p2-model", role: "answerer" },
    { id: "j1", provider: "p2", model: "p2-model", role: "arbiter" },
  ];
  const detail = await manager.create(v2CreateInput("peer-review fallback", seats, { workspace }));
  await runToEnd(manager, detail);
  const final = manager.detail(workspace, detail.id);
  const reviewers = final.participants?.filter((p) => p.role === "reviewer") ?? [];
  record(
    "E1 empty reviewer list → synthesized peer reviewers, disclosed limitation, completed",
    final.status === "completed" && reviewers.length === 2 && final.limitations.some((l) => l.includes("互相评审")),
    `status=${final.status}, reviewers=${JSON.stringify(reviewers.map((r) => r.id))}, limitations=${JSON.stringify(final.limitations)}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── F. partial failure → completed but incomplete report ──
{
  const workspace = makeWorkspace();
  const spawner = makeSpawner({ failAnswers: 1 });
  const manager = makeManager(makeContext({ workspace, spawner }), optInConfig);
  const detail = await manager.create(v2CreateInput("partial failure", SEATS, { workspace }));
  await runToEnd(manager, detail);
  const final = manager.detail(workspace, detail.id);
  record(
    "F1 one failed answer → completed meeting, incomplete report, failures recorded",
    final.status === "completed" && final.finalReport?.incomplete === true && final.failures?.length >= 1,
    `status=${final.status}, finalReport.incomplete=${final.finalReport?.incomplete}, failures=${JSON.stringify(final.failures?.map((f) => `${f.stage}/${f.participantId ?? "?"}`))}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── G. all answers fail → meeting failed ──
{
  const workspace = makeWorkspace();
  const spawner = makeSpawner({ failAnswers: 99 });
  const manager = makeManager(makeContext({ workspace, spawner }), optInConfig);
  const detail = await manager.create(v2CreateInput("all answers fail", SEATS, { workspace }));
  await runToEnd(manager, detail);
  const final = manager.detail(workspace, detail.id);
  record(
    "G1 all answers fail → status failed (never completed)",
    final.status === "failed",
    `status=${final.status}, stage=${final.stage}, failures=${final.failures?.length}`,
  );
  rmSync(workspace, { recursive: true, force: true });
}

// ── H. personaBinding off (default config object) refuses persona seats ──
{
  const workspace = makeWorkspace();
  const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }), config);
  const seats = SEATS.map((seat, index) => (index === 0 ? { ...seat, personaId: "focus-hunter" } : seat));
  let outcome;
  try {
    await manager.create(v2CreateInput("off refuses persona", seats, { workspace }));
    outcome = "created (BUG)";
  } catch (error) {
    outcome = `400 ${error.code}`;
  }
  record(
    "H1 personaBinding=off + persona seat → 400 persona-not-supported",
    outcome === "400 persona-not-supported",
    outcome,
  );
  rmSync(workspace, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\nprobes: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
