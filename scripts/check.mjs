#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Syntax-check every module under `lib/`.
 *
 * The npm script used to name the files by hand, so a newly added `lib/*.js`
 * could ship without ever being parsed. Walking the directory keeps the gate
 * honest without extra tooling or a dependency.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "lib"))
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => join("lib", name));

if (files.length === 0) {
  console.error("dsh-simroundtable: no lib/*.js files found");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`dsh-simroundtable: node --check failed for ${failed} of ${files.length} files under lib/`);
  process.exit(1);
}
console.log(`dsh-simroundtable: node --check passed for all ${files.length} files under lib/`);