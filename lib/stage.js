// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Long-table stage assets.
 *
 * The 「圆桌会议」 page renders the meeting as a long-table Live2D stage. The
 * browser needs the PIXI/Cubism runtime, two PNGs and one Live2D model, and a
 * plugin package has no static URL of its own — the host only serves the SPA
 * dist and the composed client bundle. So every stage file gets one exact
 * Connection Fetch route below `/api/roundtable/stage`, next to the meeting
 * API and behind the same browser authentication.
 *
 * Each file is read from `../assets` on demand: the assets are a few megabytes
 * in total, and caching them in memory would only make a plugin reload serve
 * stale bytes. Browsers cache the binary responses instead.
 */
import { readFile } from "node:fs/promises";

/** Browser-visible prefix of the stage routes; the client half mirrors it. */
export const STAGE_BASE = "/api/roundtable/stage";

const ASSET_ROOT = new URL("../assets/", import.meta.url);

const WEEK = "public, max-age=604800";
const JS = "text/javascript; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const PNG = "image/png";
const OCTET = "application/octet-stream";

/**
 * One route per file. `path` is the exact Connection route; keys of `files`
 * are the URL tails below {@link STAGE_BASE}.
 */
const files = {
  "vendor/live2dcubismcore.min.js": { source: "vendor/live2dcubismcore.min.js", type: JS, cache: WEEK },
  "vendor/pixi.min.js": { source: "vendor/pixi.min.js", type: JS, cache: WEEK },
  "vendor/cubism4.min.js": { source: "vendor/cubism4.min.js", type: JS, cache: WEEK },
  "art/table.png": { source: "table-long.png", type: PNG, cache: WEEK },
  "art/chair.png": { source: "chairs/chair-long-back.png", type: PNG, cache: WEEK },
  "model/c_0120.moc3": { source: "models/whale-girl/c_0120.moc3", type: OCTET, cache: WEEK },
  "model/c_0120.physics3.json": { source: "models/whale-girl/c_0120.physics3.json", type: JSON_TYPE, cache: WEEK },
  "model/textures/texture_00.png": { source: "models/whale-girl/c_0120.2048/texture_00.png", type: PNG, cache: WEEK },
  "model/textures/texture_01.png": { source: "models/whale-girl/c_0120.2048/texture_01.png", type: PNG, cache: WEEK },
};

/**
 * The model descriptor as the browser must see it.
 *
 * The shipped `c_0120.model3.json` references eight motion groups, forty
 * expressions and a display-info table. The stage never plays a motion — the
 * roundtable drives parameters directly — so serving the descriptor verbatim
 * would download a dozen files nobody uses. The served copy keeps the moc,
 * physics and textures (plus the eye-blink group, which is what makes the
 * faces look alive) and points the texture paths at their own routes.
 */
async function modelDescriptor() {
  const raw = JSON.parse(String(await readFile(new URL("models/whale-girl/c_0120.model3.json", ASSET_ROOT), "utf8")));
  const references = raw && typeof raw.FileReferences === "object" && raw.FileReferences ? raw.FileReferences : {};
  const descriptor = {
    Version: typeof raw.Version === "number" ? raw.Version : 3,
    FileReferences: {
      Moc: "c_0120.moc3",
      Textures: ["textures/texture_00.png", "textures/texture_01.png"],
    },
  };
  if (typeof references.Physics === "string") descriptor.FileReferences.Physics = "c_0120.physics3.json";
  const groups = (Array.isArray(raw.Groups) ? raw.Groups : []).filter(
    (group) => group && group.Name === "EyeBlink" && Array.isArray(group.Ids) && group.Ids.length > 0,
  );
  if (groups.length > 0) descriptor.Groups = groups;
  if (Array.isArray(raw.HitAreas) && raw.HitAreas.length > 0) descriptor.HitAreas = raw.HitAreas;
  return descriptor;
}

async function serveFile(definition) {
  const bytes = await readFile(new URL(definition.source, ASSET_ROOT));
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": definition.type,
      "content-length": String(bytes.byteLength),
      "cache-control": definition.cache,
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Register the stage asset routes on the Connection service.
 *
 * Returns an async disposer, mirroring `registerRoundtableApi`. A missing file
 * answers 500 with a plain message instead of a stack trace: the page shows
 * its own "stage unavailable" note for any non-ok response.
 */
export function registerStageRoutes(connection) {
  const routes = [];
  for (const key of Object.keys(files)) {
    routes.push({
      path: `${STAGE_BASE}/${key}`,
      run: () => serveFile(files[key]),
    });
  }
  routes.push({
    path: `${STAGE_BASE}/model/model3.json`,
    run: async () =>
      new Response(JSON.stringify(await modelDescriptor()), {
        status: 200,
        headers: {
          "content-type": JSON_TYPE,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      }),
  });
  const disposers = [];
  for (const route of routes) {
    disposers.push(
      connection.fetch.register({
        path: route.path,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: async () => {
          try {
            return await route.run();
          } catch (error) {
            const message = error && typeof error.message === "string" ? error.message : "stage asset unavailable";
            return new Response(`stage asset unavailable: ${message}`, {
              status: 500,
              headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
            });
          }
        },
      }),
    );
  }
  return async () => {
    for (const dispose of disposers) {
      try {
        await dispose();
      } catch {
        // The connection may already be gone at shutdown.
      }
    }
  };
}