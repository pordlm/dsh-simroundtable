/**
 * Gate tests for discovery and packaging.
 *
 * `scripts/check.mjs` and `scripts/test.mjs` used a flat `readdirSync`, so a
 * module placed in a new `lib/` subdirectory was never parsed or run; the
 * `files` glob in `package.json` had the same flat shape. These tests pin the
 * recursive walker, the `test/manual/` exclusion, symlink safety, and the
 * packaging glob — the nested probe proves the glob is recursive, because the
 * previous `"lib/*.js"` pattern could not have matched it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { walkFiles } from "../scripts/walker.mjs";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]+$/, "");
const libRoot = join(root, "lib");

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeModule(dir, relativePath) {
  const absolute = join(dir, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, "export const ok = 1;\n");
}

function drop(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test("walker recurses three levels and returns sorted POSIX paths", () => {
  const dir = tempDir("walker-deep-");
  try {
    writeModule(dir, "z.js");
    writeModule(dir, "a/one.js");
    writeModule(dir, "a/b/two.js");
    writeModule(dir, "a/b/c/three.js");
    writeFileSync(join(dir, "notes.txt"), "not a module\n");

    const found = walkFiles(dir, { filter: (path) => path.endsWith(".js") });

    assert.deepEqual(found, ["a/b/c/three.js", "a/b/two.js", "a/one.js", "z.js"]);
  } finally {
    drop(dir);
  }
});

test("walker skips ignored directories such as manual/", () => {
  const dir = tempDir("walker-ignore-");
  try {
    writeModule(dir, "keep.test.mjs");
    writeModule(dir, "manual/live.test.mjs");
    writeModule(dir, "nested/manual/deep.test.mjs");
    writeModule(dir, "node_modules/pkg/index.js");

    const found = walkFiles(dir, {
      filter: (path) => path.endsWith(".test.mjs"),
      ignoreDirs: ["manual", "node_modules"],
    });

    assert.deepEqual(found, ["keep.test.mjs"]);
  } finally {
    drop(dir);
  }
});

test("walker does not follow symlinks unless asked", (t) => {
  const tree = tempDir("walker-link-");
  const outside = tempDir("walker-target-");
  try {
    writeModule(tree, "real.js");
    writeFileSync(join(outside, "linked.js"), "export const ok = 1;\n");

    try {
      symlinkSync(outside, join(tree, "link"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlinks unavailable on this machine: ${error.code ?? error.message}`);
      return;
    }

    const linksIgnored = walkFiles(tree, { filter: (path) => path.endsWith(".js") });
    assert.deepEqual(linksIgnored, ["real.js"], "a link must not pull out-of-tree files into a gate");

    const linksFollowed = walkFiles(tree, { filter: (path) => path.endsWith(".js"), followSymlinks: true });
    assert.deepEqual(linksFollowed, ["link/linked.js", "real.js"]);
  } finally {
    drop(tree);
    drop(outside);
  }
});

test("check.mjs parses modules in new lib subdirectories", () => {
  const probeDir = join(libRoot, "__gate_probe__");
  const probe = join(probeDir, "nested", "probe.js");
  try {
    const topLevel = readdirSync(libRoot).filter((name) => name.endsWith(".js")).length;
    const baseline = walkFiles(libRoot, { filter: (path) => path.endsWith(".js") });
    assert.ok(
      baseline.length > topLevel,
      "the repository already ships nested lib modules, so a flat listing would be incomplete",
    );

    mkdirSync(dirname(probe), { recursive: true });
    writeFileSync(probe, "export const gateProbe = true;\n");

    const recursive = walkFiles(libRoot, { filter: (path) => path.endsWith(".js") });
    assert.ok(recursive.includes("__gate_probe__/nested/probe.js"), "walker must see nested lib modules");
    assert.equal(recursive.length, baseline.length + 1, "the probe must add exactly one file");

    const result = spawnSync(process.execPath, ["scripts/check.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`all ${baseline.length + 1} files under lib/`));
  } finally {
    drop(probeDir);
  }
});

test("npm pack ships files in new lib subdirectories", () => {
  const probeDir = join(libRoot, "__pack_probe__");
  const probe = join(probeDir, "nested", "probe.js");
  try {
    mkdirSync(dirname(probe), { recursive: true });
    writeFileSync(probe, "export const packProbe = true;\n");

    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.ok(manifest.files.includes("lib/**/*.js"), "package.json must ship lib/ recursively");

    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npm, ["pack", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    assert.equal(result.status, 0, result.stderr);

    const [packed] = JSON.parse(result.stdout);
    const shipped = packed.files.map((file) => file.path);
    assert.ok(
      shipped.includes("lib/__pack_probe__/nested/probe.js"),
      `tarball manifest is missing the nested probe: ${shipped.join(", ")}`,
    );
  } finally {
    drop(probeDir);
    assert.equal(existsSync(probeDir), false, "the probe directory must not survive the test");
  }
});