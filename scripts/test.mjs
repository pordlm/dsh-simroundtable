#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Run every test file with one command.
 *
 * The files are discovered instead of listed by hand: a hand-written list once
 * dropped `test/stage-math.test.mjs` from `npm test` without anything failing.
 * `test/manual/` holds opt-in live-provider probes that need real credentials
 * and tokens, so only top-level `test/*.test.mjs` files are part of the suite.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "test"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join("test", name));

if (files.length === 0) {
  console.error("dsh-simroundtable: no test/*.test.mjs files found");
  process.exit(1);
}

console.log(`dsh-simroundtable: node --test ${files.join(" ")}`);
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);