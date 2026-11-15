/**
 * Checkpoint degradation (0.7修复.md P2 #2): a failed `manager.write` during a
 * running meeting must surface as `record.persistence.degraded` plus a
 * limitation — not silently disappear — and stay sticky after the terminal
 * write succeeds. Records that never hit the path carry no `persistence` key.
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";

import {
  ZH,
  SEATS,
  makeContext,
  makeManager,
  makeSpawner,
  makeWorkspace,
  onDiskRecord,
  runToEnd,
  v2CreateInput,
} from "./helpers/v2-harness.mjs";

test("a failed checkpoint write degrades visibly and stays sticky after the terminal write", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    // Fail only the writes that happen while the meeting is running (the
    // stage-start / stage-end checkpoints); the queued record, the settle and
    // the terminal write go through untouched.
    const realWrite = manager.write.bind(manager);
    let failedWrites = 0;
    manager.write = (record) => {
      if (record.status === "running") {
        failedWrites += 1;
        return false;
      }
      return realWrite(record);
    };

    const detail = await manager.create(v2CreateInput("checkpoint 降级", SEATS, { workspace }));
    await runToEnd(manager, detail);

    assert.ok(failedWrites > 0, "at least one running-period write was failed");
    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed", "the meeting still completes");
    assert.equal(final.persistence?.degraded, true, "the degradation is recorded and sticky");
    assert.equal(typeof final.persistence.failedAt, "string");
    assert.ok(final.persistence.lastFailedStage, "the degraded stage is named");
    assert.ok(
      final.limitations.includes(ZH.checkpointDegradedNote),
      "the limitation explains the lost checkpoint",
    );

    const onDisk = onDiskRecord(workspace, detail.id);
    assert.equal(onDisk.persistence?.degraded, true, "the sticky field survives the terminal write");
    assert.ok(
      onDisk.limitations.includes(ZH.checkpointDegradedNote),
      "the limitation is durable",
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a healthy run carries no persistence key", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    const detail = await manager.create(v2CreateInput("正常路径", SEATS, { workspace }));
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.persistence, undefined, "no degradation, no field");
    assert.equal(onDiskRecord(workspace, detail.id).persistence, undefined);
    assert.equal(final.limitations.includes(ZH.checkpointDegradedNote), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a v1 record never gains the persistence key", async () => {
  const workspace = makeWorkspace();
  try {
    const manager = makeManager(makeContext({ workspace, spawner: makeSpawner() }));
    // No participants and no protocol version → the v1 engine path.
    const detail = await manager.create({
      topic: "v1 无 persistence 键",
      workspace,
      rounds: 0,
      answerers: ["p1/p1-model", "p2/p2-model"],
    });
    await runToEnd(manager, detail);

    const final = manager.detail(workspace, detail.id);
    assert.equal(final.status, "completed");
    assert.equal(final.persistence, undefined, "v1 records are untouched by the v2 field");
    assert.equal(onDiskRecord(workspace, detail.id).persistence, undefined);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
