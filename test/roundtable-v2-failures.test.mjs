/**
 * Task-level failure history (0.7修复.md P2 #3): `reduce` keeps an append-only
 * errorLog, a later success never erases an earlier task failure, the report
 * is marked incomplete when any task failed, and the settlement projects the
 * log into `record.failures` with the seat's participantId.
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";

import { roundtableV2 } from "../lib/protocols/roundtable-v2.js";
import {
  SEATS,
  makeContext,
  makeManager,
  makeSpawner,
  makeWorkspace,
  runToEnd,
  v2CreateInput,
} from "./helpers/v2-harness.mjs";

const CONTEXT = {
  topic: "failure history",
  participants: SEATS.map((seat) => ({ ...seat, participantId: seat.id })),
  config: { rounds: 0 },
};

test("reduce keeps an append-only errorLog; a later success does not erase an earlier failure", () => {
  const state0 = roundtableV2.createState(CONTEXT);
  const state1 = roundtableV2.reduce(state0, [{
    taskId: "t-answer-a1",
    participantId: "a1",
    stage: "answer",
    round: 0,
    status: "failed",
    error: "boom",
  }]);
  assert.equal(state1.errorLog.length, 1, "the failure is logged");
  assert.equal(state1.errors.a1.error, "boom", "the last-status snapshot still names the failure");

  const state2 = roundtableV2.reduce(state1, [{
    taskId: "t-discussion-a1",
    participantId: "a1",
    stage: "discussion",
    round: 1,
    status: "ok",
    output: { text: "recovered answer" },
  }]);
  assert.equal(state2.errorLog.length, 1, "a later success does not erase the logged failure");
  assert.equal(state2.errorLog[0].stage, "answer");
  assert.equal(state2.errorLog[0].participantId, "a1");
  assert.equal(state2.errorLog[0].taskId, "t-answer-a1");
  assert.equal(state2.errorLog[0].error, "boom");
  assert.equal(typeof state2.errorLog[0].at, "string", "the failure carries a timestamp");
  assert.equal(state2.errors.a1, undefined, "the snapshot no longer names the recovered seat");
  assert.equal(state2.seatStatus.a1, "ok");
  assert.equal(state2.answers.a1.text, "recovered answer");
});

test("buildReport marks the report incomplete when any task failed, even with reviews", () => {
  const base = roundtableV2.createState(CONTEXT);
  const withReviews = {
    ...base,
    reviews: { r1: { ranking: ["A", "B"] } },
    ranking: { r1: ["A", "B"] },
    answers: { a1: { text: "answer one", round: 0 }, a2: { text: "answer two", round: 0 } },
  };

  const clean = roundtableV2.buildReport(withReviews, CONTEXT);
  assert.equal(clean.incomplete, false, "a clean run with reviews is not incomplete");

  const withFailure = roundtableV2.reduce(withReviews, [{
    taskId: "t-answer-a1",
    participantId: "a1",
    stage: "answer",
    round: 0,
    status: "failed",
    error: "boom",
  }]);
  const report = roundtableV2.buildReport(withFailure, CONTEXT);
  assert.equal(report.incomplete, true, "a task-level failure makes the report a best effort");
});

test("the settlement projects the errorLog into record.failures with the participantId", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner({ failAnswers: 1 }) }));
    const detail = await manager.create(v2CreateInput("errorLog 投影", SEATS, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.failures.length, 1);
    assert.equal(final.failures[0].participantId, "a1", "the failure names its seat id");
    assert.equal(final.failures[0].stage, "answer");
    assert.equal(final.failures[0].message, "boom");
    assert.equal(typeof final.failures[0].at, "string");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
