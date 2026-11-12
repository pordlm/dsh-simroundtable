/**
 * Identity model v3 (PR-1): the six completion assertions from the plan.
 *
 * The point of these tests is that the four keys keep one job each — seats are
 * identity, `provider/model` is independence, and a Persona never invents a new
 * independent voice.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  independentSet,
  modelRouteKey,
  normalizeParticipant,
  participantsOf,
  participantsToRoster,
  validateParticipants,
} from "../lib/participants.js";
import { ProtocolError } from "../lib/protocols/types.js";
import { protocolOf, recordVersionOf } from "../lib/version.js";

function seat(overrides = {}) {
  return { provider: "provider-a", model: "model-1", ...overrides };
}

function withoutId(participant) {
  const { participantId, ...rest } = participant;
  return rest;
}

test("same model with different Personas: routes match, seats differ, one independent voice", () => {
  const answerer = normalizeParticipant(seat({ id: "s1", personaId: "card-a" }), "answerer", 0);
  const reviewer = normalizeParticipant(seat({ id: "s2", personaId: "card-b" }), "reviewer", 1);

  assert.notEqual(answerer.participantId, reviewer.participantId);
  assert.equal(answerer.modelRouteKey, reviewer.modelRouteKey);
  assert.equal(answerer.modelRouteKey, "provider-a/model-1");
  assert.equal(independentSet([answerer, reviewer]).size, 1);
});

test("same model and Persona across roles: fingerprints differ, independence does not", () => {
  const answerer = normalizeParticipant(seat({ personaId: "card" }), "answerer", 0);
  const reviewer = normalizeParticipant(seat({ personaId: "card" }), "reviewer", 1);

  assert.notEqual(answerer.participantId, reviewer.participantId);
  assert.notEqual(answerer.seatFingerprint, reviewer.seatFingerprint);
  assert.equal(independentSet([answerer, reviewer]).size, 1);
});

test("duplicate participantId is a meeting-level error, not a global one", () => {
  const duplicated = [
    seat({ id: "s1", role: "answerer" }),
    seat({ id: "s1", role: "reviewer", provider: "provider-b" }),
  ];
  assert.throws(
    () => validateParticipants(duplicated),
    (error) => {
      assert.ok(error instanceof ProtocolError);
      assert.equal(error.code, "duplicate-participant-id");
      return true;
    },
  );

  const meetingA = [
    seat({ id: "s1", role: "answerer" }),
    seat({ id: "s2", role: "reviewer", provider: "provider-b" }),
  ];
  const meetingB = [
    seat({ id: "s1", role: "answerer" }),
    seat({ id: "s2", role: "reviewer", provider: "provider-b" }),
  ];
  assert.doesNotThrow(() => validateParticipants(meetingA));
  assert.doesNotThrow(() => validateParticipants(meetingB));
});

test("a client-provided id and a generated id produce the same structure", () => {
  const provided = normalizeParticipant(seat({ id: "seat-1", personaId: "card" }), "answerer", 0);
  const generated = normalizeParticipant(seat({ personaId: "card" }), "answerer", 0);

  assert.equal(generated.participantId, "p1");
  assert.deepEqual(withoutId(provided), withoutId(generated));
});

test("v1 roster projection always keys seats by provider/model", () => {
  const participants = [
    normalizeParticipant(seat({ id: "s1", personaId: "card" }), "answerer", 0),
    normalizeParticipant(seat({ id: "s2", provider: "provider-b" }), "reviewer", 1),
    normalizeParticipant(seat({ id: "s3", provider: "provider-c", model: "model-2" }), "arbiter", 2),
  ];
  const roster = participantsToRoster(participants);

  assert.deepEqual(
    roster.answerers.map((entry) => entry.key),
    ["provider-a/model-1"],
  );
  assert.deepEqual(
    roster.reviewers.map((entry) => entry.key),
    ["provider-b/model-1"],
  );
  assert.equal(roster.arbiter.key, "provider-c/model-2");
  assert.equal(roster.arbiter.key, modelRouteKey(participants[2]));
});

test("participantsOf is a pure read for v1 records", () => {
  const record = {
    roster: {
      answerers: [{ key: "a/1", provider: "a", model: "1", anonymousId: "A" }],
      reviewers: [{ key: "b/2", provider: "b", model: "2" }],
    },
    answers: [],
  };
  const before = JSON.stringify(record);

  const first = participantsOf(record);
  const second = participantsOf(record);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(record), before, "v1 reads must not write seats back");
  assert.ok(!("participants" in record));
  assert.deepEqual(
    first.map((entry) => [entry.participantId, entry.role, entry.modelRouteKey]),
    [
      ["answerer-1", "answerer", "a/1"],
      ["reviewer-1", "reviewer", "b/2"],
    ],
  );
});

test("participantsOf keeps stored v2 seats and version accessors stay pure", () => {
  const record = {
    version: 2,
    protocol: { id: "roundtable", version: 2 },
    participants: [seat({ participantId: "seat-a", role: "answerer", personaId: "card" })],
  };

  const [participant] = participantsOf(record);
  assert.equal(participant.participantId, "seat-a");
  assert.equal(participant.personaId, "card");

  assert.equal(recordVersionOf(record), 2);
  assert.deepEqual(protocolOf(record), { id: "roundtable", version: 2 });
  assert.equal(recordVersionOf({}), 1);
  assert.deepEqual(protocolOf({}), { id: "roundtable", version: 1 });

  const future = { protocol: { id: "not-installed", version: 3 } };
  assert.deepEqual(protocolOf(future), future.protocol, "an unknown protocol still renders read-only");
});