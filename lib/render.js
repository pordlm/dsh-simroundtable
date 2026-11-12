// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * One export renderer for every record version.
 *
 * v1 records keep going through `formatMeeting`, which is the roundtable-shaped
 * renderer the page and tests already depend on. A v2 record carries a protocol
 * report whose shape the protocol itself owns, so this module renders that
 * report instead of trying to force it through `formatMeeting`. Callers get
 * `{ markdown, filename }` and never need to know which branch ran.
 */

import { formatMeeting } from "./core.js";
import { recordVersionOf } from "./version.js";

/** File name shared by both versions: the download keeps its old identity. */
export function exportFilename(record) {
  return `roundtable-${record?.id}.md`;
}

/** Render one record as `{ markdown, filename }` without touching the disk. */
export function renderExport(record, copy) {
  if (recordVersionOf(record) === 2) {
    return { markdown: renderProtocolReport(record), filename: exportFilename(record) };
  }
  return { markdown: formatMeeting(record, copy), filename: exportFilename(record) };
}

/**
 * Render the v2 report. The protocol already built the final answer, ranking
 * rows and participant notes, so this only wraps them with identity metadata.
 */
function renderProtocolReport(record) {
  const lines = [];
  const protocol = record.protocol ?? { id: "roundtable", version: 2 };
  lines.push("# Roundtable report", "");
  lines.push(`- id: \`${record.id ?? ""}\``);
  lines.push(`- protocol: \`${protocol.id ?? "roundtable"}@${protocol.version ?? 2}\``);
  lines.push(`- status: ${record.status ?? ""}`);
  lines.push(`- topic: ${record.topic ?? ""}`);
  lines.push(`- created: ${record.createdAt ?? ""}`);
  if (record.endedAt !== undefined) lines.push(`- ended: ${record.endedAt}`);
  lines.push("");

  appendParticipants(lines, record);
  appendFinalAnswer(lines, record);
  appendRanking(lines, record);
  appendProtocolNotes(lines, record);
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendParticipants(lines, record) {
  const seats = Array.isArray(record.participants) ? record.participants : [];
  if (seats.length === 0) return;
  lines.push("## Participants", "");
  for (const seat of seats) {
    const persona = seat.personaName !== undefined
      ? ` — persona: ${seat.personaName}`
      : "";
    const handle = seat.anonymousId !== undefined ? ` (${seat.anonymousId})` : "";
    lines.push(`- ${seat.role} · ${seat.modelName ?? seat.model} · ${seat.providerName ?? seat.provider}${handle}${persona}`);
  }
  lines.push("");
}

function appendFinalAnswer(lines, record) {
  const report = record.finalReport ?? {};
  // Prefer the arbiter's own answer text; older v2 records only stored the full
  // report markdown, which stays a readable fallback.
  const text = typeof record.finalAnswer?.text === "string" && record.finalAnswer.text !== ""
    ? record.finalAnswer.text
    : (typeof report.markdown === "string" ? report.markdown : "");
  lines.push("## Final answer", "");
  lines.push(text.trim() === "" ? "(no final answer)" : text.trim(), "");
  if (report.fallback === true) lines.push("> fallback: the arbiter failed; this answer is a deterministic summary.", "");
  if (report.incomplete === true) lines.push("> incomplete: at least one stage failed to produce a full result.", "");
}

function appendRanking(lines, record) {
  const ranking = Array.isArray(record.finalReport?.ranking)
    ? record.finalReport.ranking
    : (Array.isArray(record.ranking) ? record.ranking : []);
  if (ranking.length === 0) return;
  lines.push("## Ranking", "");
  for (const row of ranking) {
    const votes = row.votes === undefined ? "" : ` (${row.votes} votes)`;
    const average = row.averageRank === undefined ? "" : ` · avg rank ${row.averageRank}`;
    lines.push(`- ${row.answerId ?? row.id ?? "?"}${average}${votes}`);
  }
  lines.push("");
}

function appendProtocolNotes(lines, record) {
  const notes = Array.isArray(record.finalReport?.sameRouteNotes) ? record.finalReport.sameRouteNotes : [];
  if (notes.length > 0) {
    lines.push("## Same-route seats", "");
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  const limitations = Array.isArray(record.limitations) ? record.limitations : [];
  if (limitations.length > 0) {
    lines.push("## Limitations", "");
    for (const limitation of limitations) lines.push(`- ${limitation}`);
    lines.push("");
  }
  const failures = Array.isArray(record.failures) ? record.failures : [];
  if (failures.length > 0) {
    lines.push("## Failures", "");
    for (const failure of failures) {
      const stage = failure.stage ?? "?";
      const message = failure.message ?? "";
      lines.push(`- ${stage}: ${message}`);
    }
    lines.push("");
  }
}