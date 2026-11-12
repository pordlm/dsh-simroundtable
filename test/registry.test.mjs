/**
 * Protocol registry contract (PR-1).
 *
 * These assertions are about the *pure* layer: the registry must resolve the
 * default protocol, hide unknown ids behind one stable code, expose only frozen
 * arrays, and describe roundtable stages without depending on the closed
 * meeting-stage enum in `core.js`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MEETING_STAGES } from "../lib/core.js";
import { STAGE_ORDER } from "../lib/stages.js";
import { dataBoundary } from "../lib/prompts.js";
import { PROTOCOL_HOOKS, ProtocolError } from "../lib/protocols/types.js";
import { defaultProtocolId, listProtocols, requireProtocol } from "../lib/protocols/registry.js";
import {
  protocolEnabled,
  protocolFor,
  protocolVersionKey,
  protocolVersions,
} from "../lib/protocols/registry.js";

test("requireProtocol defaults to roundtable for an omitted id", () => {
  const protocol = requireProtocol();

  assert.equal(protocol.id, "roundtable");
  assert.equal(defaultProtocolId(), "roundtable");
  assert.equal(requireProtocol(undefined), protocol);
  assert.equal(requireProtocol(null), protocol);
  assert.equal(requireProtocol("roundtable"), protocol);
  assert.ok(Object.isFrozen(protocol), "descriptors are frozen so a surface cannot edit the registry");
});

test("requireProtocol rejects unknown ids with one stable code", () => {
  assert.throws(
    () => requireProtocol("red-team"),
    (error) => {
      assert.ok(error instanceof ProtocolError);
      assert.equal(error.code, "unknown-protocol");
      return true;
    },
  );
  assert.throws(() => requireProtocol("  "), (error) => error.code === "unknown-protocol");
});

test("listProtocols returns a frozen array of frozen descriptors", () => {
  const protocols = listProtocols();

  assert.ok(Object.isFrozen(protocols));
  assert.deepEqual(
    protocols.map((protocol) => protocol.id),
    ["roundtable"],
  );
  for (const protocol of protocols) assert.ok(Object.isFrozen(protocol));

  // The internal Map stays private: the returned value is a plain array.
  assert.equal(typeof protocols.set, "undefined");
  assert.deepEqual(
    listProtocols({ includeExperimental: true }).map((protocol) => protocol.id),
    ["roundtable"],
  );
});

test("roundtable stages follow STAGE_ORDER and stay a subset of MEETING_STAGES", () => {
  const stages = [...requireProtocol("roundtable").stages];

  assert.ok(stages.every((stage) => MEETING_STAGES.includes(stage)));
  assert.deepEqual(stages, [...STAGE_ORDER]);
  // MEETING_STAGES also carries queued/completed/... — never deep-equal them.
  assert.notDeepEqual(stages, [...MEETING_STAGES]);
});

test("the shared data boundary is importable and the hook list is frozen", () => {
  const boundary = dataBoundary("Scope for this stage.");

  assert.ok(Array.isArray(boundary));
  assert.ok(boundary.includes("Scope for this stage."));
  assert.equal(PROTOCOL_HOOKS.length, 11);
  assert.ok(Object.isFrozen(PROTOCOL_HOOKS));
});

test("roundtable v2 is registered but disabled until PR-4 wires it", () => {
  assert.equal(protocolVersionKey("roundtable", 2), "roundtable@2");
  assert.deepEqual([...protocolVersions("roundtable")], ["1", "2"]);

  const v2 = protocolFor("roundtable", 2);
  assert.equal(v2.id, "roundtable");
  assert.equal(v2.version, 2);
  assert.equal(v2.experimental, true);
  assert.equal(protocolEnabled("roundtable", 2), false, "PR-3 must not expose the v2 adapter");

  const v1 = protocolFor("roundtable", 1);
  assert.equal(v1, requireProtocol("roundtable"));
  assert.equal(protocolEnabled("roundtable", 1), true);

  assert.equal(protocolFor("roundtable", 9), null);
  assert.equal(protocolEnabled("nope", 1), false);
  // the public list still shows only the v1 roundtable
  assert.deepEqual(listProtocols().map((protocol) => protocol.id), ["roundtable"]);
});