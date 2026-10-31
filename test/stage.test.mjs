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

test("stage routes cover every asset the page fetches", async () => {
  const connection = fakeConnection();
  const dispose = registerStageRoutes(connection);
  try {
    assert.deepEqual([...connection.routes.keys()].sort(), expected);
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