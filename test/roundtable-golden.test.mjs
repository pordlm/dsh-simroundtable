import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { copyFor } from "../lib/copy.js";
import { exportFilename, renderExport } from "../lib/render.js";

// The v1 export is a compatibility surface: a v1 record must render the exact
// same Markdown it always did. This test pins the bytes so a later refactor of
// the report path cannot silently change v1 output.
const FIXTURES = join(import.meta.dirname, "fixtures");
const record = JSON.parse(readFileSync(join(FIXTURES, "roundtable-v1-record.json"), "utf8"));
const expected = readFileSync(join(FIXTURES, "roundtable-v1-export.md"), "utf8");

test("v1 record renders the pinned Markdown export byte for byte", () => {
  const rendered = renderExport(record, copyFor("en"));
  assert.equal(rendered.markdown, expected);
});

test("v1 export keeps the roundtable-<id>.md file name", () => {
  assert.equal(exportFilename(record), "roundtable-golden-v1-meeting.md");
});

test("the golden fixture is a v1 record with no v2 fields", () => {
  assert.equal(record.version, 1);
  assert.equal(record.protocol, undefined);
  assert.equal(record.participants, undefined);
  // A v1 record still renders through formatMeeting, not the protocol report.
  assert.match(expected, /^# Roundtable Meeting Record/m);
});