/**
 * Self-review disclosure (0.7修复.md P2 #5): a reviewer sharing an answerer's
 * model route is a self-review — the route, not the seat, is the identity v1
 * used — while a reviewer on its own route is not.
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";

import {
  SEATS,
  makeContext,
  makeManager,
  makeSpawner,
  makeWorkspace,
  runToEnd,
  v2CreateInput,
} from "./helpers/v2-harness.mjs";

test("a reviewer on an answerer's route is disclosed as a self-review", async () => {
  const workspace = makeWorkspace();
  try {
    // SEATS: r1 runs p1/p1-model, the same route as answerer a1.
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const detail = await manager.create(v2CreateInput("peers 互评自评", SEATS, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.reviews.length, 1);
    assert.equal(final.reviews[0].reviewerKey, "p1/p1-model");
    assert.equal(final.reviews[0].selfReview, true, "same route as an answerer → self-review");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a reviewer on its own route is not a self-review", async () => {
  const workspace = makeWorkspace();
  try {
    const seats = [
      { id: "a1", provider: "p1", model: "p1-model", role: "answerer" },
      { id: "a2", provider: "p2", model: "p2-model", role: "answerer" },
      { id: "r1", provider: "p3", model: "p3-model", role: "reviewer" },
      { id: "j1", provider: "p3", model: "p3-model", role: "arbiter" },
    ];
    const manager = makeManager(makeContext({
      workspace,
      spawner: makeSpawner(),
      providers: ["p1", "p2", "p3"],
    }));
    const detail = await manager.create(v2CreateInput("独立评审", seats, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.reviews.length, 1);
    assert.equal(final.reviews[0].reviewerKey, "p3/p3-model");
    assert.equal(final.reviews[0].selfReview, false, "no shared route → not a self-review");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
