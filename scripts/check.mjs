#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Syntax-check every module under `lib/`, at any depth.
 *
 * The npm script used to name the files by hand, so a newly added `lib/*.js`
 * could ship without ever being parsed. The walker keeps the gate honest
 * without extra tooling or a dependency — including subdirectories such as
 * `lib/protocols/` and `lib/personas/`.
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { walkFiles } from "./walker.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = walkFiles(join(root, "lib"), { filter: (path) => path.endsWith(".js") }).map((path) =>
  join("lib", path),
);

if (files.length === 0) {
  console.error("dsh-simroundtable: no lib/**/*.js files found");
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