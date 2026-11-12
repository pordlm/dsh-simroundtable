// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Metadata for the legacy roundtable.
 *
 * This is deliberately metadata only: the legacy roundtable keeps running
 * through `runDeliberation`, and the editable adapter (`roundtable-v2`) arrives
 * in PR-3. Registering the descriptor now lets the registry, the API and the
 * tests describe "the only protocol that exists" without touching the
 * production path.
 */
import { STAGE_ORDER } from "../stages.js";

export const ROUNDTABLE_ID = "roundtable";

export const roundtableProtocol = Object.freeze({
  id: ROUNDTABLE_ID,
  version: 1,
  experimental: false,
  description:
    "Independent answers, peer revision, anonymous review, and an arbiter — the original roundtable.",
  stages: STAGE_ORDER,
  roles: Object.freeze(["answerer", "reviewer", "arbiter"]),
});