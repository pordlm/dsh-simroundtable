#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Deterministic directory walker shared by the two gates.
 *
 * `scripts/check.mjs` and `scripts/test.mjs` used to call `readdirSync` once on
 * their top-level directory, so a module placed in a new subdirectory
 * (`lib/protocols/*.js`, `lib/personas/*.js`) would ship without ever being
 * parsed or run. This walker makes both gates recursive from a single place.
 *
 * The walk is deterministic (sorted, depth-first) and does not follow symbolic
 * links or junctions by default, so a stray link cannot smuggle duplicate or
 * out-of-tree files into a gate.
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export const DEFAULT_IGNORED_DIRS = Object.freeze(["node_modules", ".git"]);

function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function toPosix(relativePath) {
  return relativePath.split(sep).join("/");
}

/**
 * Walk `root` and return every matching file as a POSIX-style path relative to
 * `root`.
 *
 * @param {string} root Directory to walk.
 * @param {object} [options]
 * @param {(relativePath: string) => boolean} [options.filter] Keep only paths
 *   for which this returns true. Receives the relative POSIX path.
 * @param {readonly string[]} [options.ignoreDirs] Directory names skipped at
 *   any depth. Defaults to `node_modules` and `.git`.
 * @param {boolean} [options.followSymlinks] Follow symbolic links and
 *   junctions. Defaults to false.
 * @returns {string[]} Sorted relative paths using `/` separators.
 */
export function walkFiles(root, options = {}) {
  const { filter = () => true, ignoreDirs = DEFAULT_IGNORED_DIRS, followSymlinks = false } = options;
  const base = resolve(root);
  const skip = new Set(ignoreDirs);
  const files = [];

  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
      const absolute = join(dir, entry.name);
      const linked = entry.isSymbolicLink();
      if (linked && !followSymlinks) continue;
      const stats = linked ? statSync(absolute) : entry;
      if (stats.isDirectory()) {
        if (!skip.has(entry.name)) visit(absolute);
        continue;
      }
      if (!stats.isFile()) continue;
      const relativePath = toPosix(absolute.slice(base.length + 1));
      if (filter(relativePath)) files.push(relativePath);
    }
  };

  visit(base);
  return files.sort();
}