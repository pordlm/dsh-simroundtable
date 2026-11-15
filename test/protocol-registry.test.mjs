import test from "node:test";
import assert from "node:assert/strict";

import {
  makeContext,
  makeSpawner,
  onDiskRecord,
  makeManager,
  makeWorkspace,
  runToEnd,
  v2CreateInput,
  SEATS,
} from "./helpers/v2-harness.mjs";

test("B2 #1: v2 with an explicit protocol declaration resolves through the registry", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const ctx = makeContext({ workspace, spawner });
  const manager = makeManager(ctx);
  const detail = await manager.create(v2CreateInput("registry reachable", SEATS, { workspace }));
  await runToEnd(manager, detail);
  const record = onDiskRecord(workspace, detail.id);
  assert.equal(record.status, "completed");
  assert.equal(record.protocol.id, "roundtable");
  assert.equal(record.protocol.version, 2);
});

test("B2 #2: unknown protocol id is a 400 before anything expensive happens", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const ctx = makeContext({ workspace, spawner });
  const manager = makeManager(ctx);
  await assert.rejects(
    manager.create(v2CreateInput("bad id", SEATS, {
      workspace,
      protocol: { id: "not-a-protocol", version: 2 },
    })),
    (error) => error.code === "unknown-protocol" && error.status === 400,
  );
});

test("B2 #3: unknown protocol version is a 400", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const ctx = makeContext({ workspace, spawner });
  const manager = makeManager(ctx);
  await assert.rejects(
    manager.create(v2CreateInput("bad version", SEATS, {
      workspace,
      protocol: { id: "roundtable", version: 3 },
    })),
    (error) => error.code === "unknown-protocol" && error.status === 400,
  );
});

test("B2 #4: persona seats with binding=off are refused at protocol resolution", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const ctx = makeContext({ workspace, spawner });
  // The default config is personaBinding "off".
  const manager = makeManager(ctx);
  const seats = SEATS.map((seat, index) =>
    index === 0 ? { ...seat, personaId: "red-teamer" } : seat,
  );
  await assert.rejects(
    manager.create(v2CreateInput("persona refused", seats, { workspace })),
    (error) => error.code === "persona-not-supported" && error.status === 400,
  );
});

test("B2 #5: plain v1 requests are unaffected by protocol resolution", async () => {
  const workspace = makeWorkspace();
  const spawner = makeSpawner();
  const ctx = makeContext({ workspace, spawner });
  const manager = makeManager(ctx);
  const detail = await manager.create({
    topic: "plain v1 run",
    workspace,
    rounds: 0,
    answerers: ["p1/p1-model", "p2/p2-model"],
    reviewers: ["p1/p1-model"],
    arbiter: "p2/p2-model",
  });
  await runToEnd(manager, detail);
  const record = onDiskRecord(workspace, detail.id);
  assert.equal(record.status, "completed");
  // v1 records carry no protocol declaration at all.
  assert.equal(record.protocol, undefined);
});



