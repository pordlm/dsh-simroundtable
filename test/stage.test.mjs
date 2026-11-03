/**
 * Stage asset routes: the long-table page loads PIXI, Cubism and the Live2D
 * model through Connection exact routes, so those routes are part of the
 * plugin's public surface and get checked like the meeting API.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/[\\/]+$/, "");
const { registerStageRoutes, STAGE_BASE } = await import(new URL("../lib/stage.js", import.meta.url).href);

function fakeConnection() {
  const routes = new Map();
  return {
    routes,
    fetch: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`);
        routes.set(route.path, route);
        return async () => {
          routes.delete(route.path);
        };
      },
    },
  };
}

const expected = [
  "art/chair.png",
  "art/table.png",
  "model/c_0120.moc3",
  "model/c_0120.physics3.json",
  "model/model3.json",
  "model/textures/texture_00.png",
  "model/textures/texture_01.png",
  "vendor/cubism4.min.js",
  "vendor/live2dcubismcore.min.js",
  "vendor/pixi.min.js",
].map((tail) => `${STAGE_BASE}/${tail}`).sort();

/**
 * Rigs are local build output (`assets/build/**`, .gitignore'd), so the routes
 * for a member's own model appear only when those files are on disk. Tests run
 * from a checkout that may or may not have them; this mirrors `characterReady`.
 */
const CHARACTERS = {
  claude: {
    probe: "../assets/build/claude-v3/model/claude.layout.moc3",
    files: ["model3.json", "claude.layout.moc3", "claude.layout.physics3.json", "texture_00.png"],
  },
  gpt: {
    probe: "../assets/build/gpt-half-atlas2048/gpt.moc3",
    files: [
      "model3.json",
      "gpt.moc3",
      "gpt.physics3.json",
      "texture_00.png",
      "texture_01.png",
      "texture_02.png",
      "texture_03.png",
      "texture_04.png",
      "texture_05.png",
    ],
  },
  claudeBook: {
    probe: "../assets/build/claude-book-model/claude-book.layout.moc3",
    files: ["model3.json", "claude-book.layout.moc3", "claude-book.layout.physics3.json", "texture_00.png"],
  },
};

async function builtCharacters() {
  const built = [];
  for (const [name, definition] of Object.entries(CHARACTERS)) {
    try {
      await stat(new URL(definition.probe, import.meta.url));
      built.push(name);
    } catch {
      // Not built in this checkout.
    }
  }
  return built;
}

async function characterRoutes() {
  const routes = [];
  for (const name of await builtCharacters()) {
    for (const file of CHARACTERS[name].files) routes.push(`${STAGE_BASE}/char/${name}/${file}`);
  }
  return routes;
}

test("stage routes cover every asset the page fetches", async () => {
  const connection = fakeConnection();
  const dispose = registerStageRoutes(connection);
  try {
    assert.deepEqual([...connection.routes.keys()].sort(), [...expected, ...(await characterRoutes())].sort());
    for (const route of connection.routes.values()) {
      assert.deepEqual(route.methods, ["GET"]);
      assert.equal(route.requestBody, "buffered");
    }
  } finally {
    await dispose();
  }
  assert.equal(connection.routes.size, 0, "disposer removes every route");
});

test("stage serves the model descriptor trimmed to what the page uses", async () => {
  const connection = fakeConnection();
  const dispose = registerStageRoutes(connection);
  try {
    const response = await connection.routes.get(`${STAGE_BASE}/model/model3.json`).fetch(
      new Request(`http://localhost${STAGE_BASE}/model/model3.json`),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const body = await response.json();
    assert.equal(body.Version, 3);
    assert.deepEqual(Object.keys(body.FileReferences).sort(), ["Moc", "Physics", "Textures"]);
    assert.deepEqual(body.FileReferences.Textures, ["textures/texture_00.png", "textures/texture_01.png"]);
    assert.equal(body.FileReferences.Moc, "c_0120.moc3");
    // No motion groups: the roundtable drives parameters itself.
    assert.equal(body.Motions, undefined);
    assert.deepEqual(body.Groups.map((group) => group.Name), ["EyeBlink"]);
  } finally {
    await dispose();
  }
});

test("stage serves binary assets with their type and a cache header", async () => {
  const connection = fakeConnection();
  const dispose = registerStageRoutes(connection);
  try {
    const png = await connection.routes.get(`${STAGE_BASE}/art/table.png`).fetch(
      new Request(`http://localhost${STAGE_BASE}/art/table.png`),
    );
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.match(png.headers.get("cache-control"), /max-age/);
    const bytes = new Uint8Array(await png.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const onDisk = await stat(`${root}/assets/table-long.png`);
    assert.equal(bytes.byteLength, onDisk.size);
    assert.equal(png.headers.get("content-length"), String(onDisk.size));

    const moc = await connection.routes.get(`${STAGE_BASE}/model/c_0120.moc3`).fetch(
      new Request(`http://localhost${STAGE_BASE}/model/c_0120.moc3`),
    );
    assert.equal(moc.status, 200);
    assert.equal(moc.headers.get("content-type"), "application/octet-stream");
    assert.equal((await moc.arrayBuffer()).byteLength, (await stat(`${root}/assets/models/whale-girl/c_0120.moc3`)).size);
  } finally {
    await dispose();
  }
});

test("a member's own descriptor points at sibling files, not at a subdirectory", async () => {
  const routesToCheck = await characterRoutes();
  if (!routesToCheck.length) return; // Rig not built in this checkout.
  const connection = fakeConnection();
  const dispose = registerStageRoutes(connection);
  try {
    const response = await connection.routes.get(`${STAGE_BASE}/char/claude/model3.json`).fetch(
      new Request(`http://localhost${STAGE_BASE}/char/claude/model3.json`),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    // Relative to the descriptor URL itself, so any slash would resolve into
    // `char/claude/<segment>` and 404 against the route table.
    assert.equal(body.FileReferences.Moc, "claude.layout.moc3");
    assert.equal(body.FileReferences.Physics, "claude.layout.physics3.json");
    assert.deepEqual(body.FileReferences.Textures, ["texture_00.png"]);
    assert.equal(body.Motions, undefined, "the stage drives parameters, not motions");
    assert.deepEqual(body.Groups.map((group) => group.Name), ["EyeBlink"]);

    const moc = await connection.routes.get(`${STAGE_BASE}/char/claude/claude.layout.moc3`).fetch(
      new Request(`http://localhost${STAGE_BASE}/char/claude/claude.layout.moc3`),
    );
    assert.equal(moc.headers.get("content-type"), "application/octet-stream");
    assert.ok((await moc.arrayBuffer()).byteLength > 1000);

    // Resolve every reference the way the loader does — relative to the
    // descriptor's own URL — and make sure each one lands on a real route.
    const descriptorUrl = new URL(`http://localhost${STAGE_BASE}/char/claude/model3.json`);
    const references = [
      body.FileReferences.Moc,
      ...body.FileReferences.Textures,
      body.FileReferences.Physics,
    ].filter(Boolean);
    assert.deepEqual(references.length, 3);
    for (const reference of references) {
      const url = new URL(reference, descriptorUrl);
      const route = connection.routes.get(url.pathname);
      assert.ok(route, `${reference} resolves to a registered route`);
      const served = await route.fetch(new Request(url));
      assert.equal(served.status, 200, `${reference} is served`);
      assert.ok((await served.arrayBuffer()).byteLength > 100, `${reference} has bytes`);
    }
  } finally {
    await dispose();
  }
});