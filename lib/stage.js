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
import { existsSync } from "node:fs";
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
 * Extra characters, one per member that has its own rig.
 *
 * The whale-girl is the house model: every seat that has no rig of its own
 * borrows her. A member whose model has been built locally (Claude, GPT) gets
 * its own descriptor and its own file routes, and the client picks it per seat
 * by the member key. Everything is optional on purpose: a checkout without the
 * build artefacts must still serve the whale-girl stage, so a character whose
 * files are missing is registered as "absent" and the client keeps the
 * whale-girl for that seat (see `characterAvailability`).
 */
const CHARACTERS = {
  claude: {
    dir: "build/claude-v3/model",
    prefix: "claude",
    moc: { file: "claude.layout.moc3", type: OCTET },
    physics: { file: "claude.layout.physics3.json", type: JSON_TYPE },
    textures: [{ file: "claude.layout.4096/texture_00.png", type: PNG }],
  },
  gpt: {
    dir: "build/gpt-p2l/p2l",
    prefix: "gpt",
    moc: { file: "gpt.moc3", type: OCTET },
    physics: { file: "gpt.physics3.json", type: JSON_TYPE },
    textures: [
      { file: "gpt.4096/texture_00.png", type: PNG },
      { file: "gpt.4096/texture_01.png", type: PNG },
      { file: "gpt.4096/texture_02.png", type: PNG },
      { file: "gpt.4096/texture_03.png", type: PNG },
      { file: "gpt.4096/texture_04.png", type: PNG },
      { file: "gpt.4096/texture_05.png", type: PNG },
    ],
  },
};

/**
 * The whale-girl descriptor as the browser must see it.
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

/**
 * The descriptor for a member's own rig.
 *
 * Same trimming rule as the whale-girl: moc, physics, textures and the
 * eye-blink group. `char/<name>/texture_NN.png` is the address the client will
 * ask for, so the descriptor points there and the route table below mirrors it
 * — the on-disk name of a texture is a PSD2Live detail the browser never sees.
 */
function characterDescriptor(name) {
  const definition = CHARACTERS[name];
  // Paths are relative to this descriptor's own URL
  // (`.../stage/char/<name>/model3.json`), so they are bare file names — the
  // route table below serves them from `char/<name>/`.
  const references = {
    Moc: definition.moc.file,
    Textures: definition.textures.map((_, index) => `texture_${String(index).padStart(2, "0")}.png`),
  };
  if (definition.physics) references.Physics = definition.physics.file;
  return {
    Version: 3,
    FileReferences: references,
    Groups: [{ Target: "Parameter", Name: "EyeBlink", Ids: ["ParamEyeLOpen", "ParamEyeROpen"] }],
  };
}

/**
 * A character counts as present only when every file it names is on disk.
 *
 * `existsSync` keeps route registration synchronous: the host registers stage
 * routes during plugin setup and expects the disposer back, not a promise.
 */
function characterReady(name) {
  const definition = CHARACTERS[name];
  const wanted = [definition.moc.file, ...definition.textures.map((texture) => texture.file)];
  if (definition.physics) wanted.push(definition.physics.file);
  return wanted.every((file) => existsSync(new URL(`${definition.dir}/${file}`, ASSET_ROOT)));
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
 *
 * Character routes are registered only for characters whose files exist. The
 * stage is committed but the rigs are not, so a fresh checkout registers the
 * whale-girl alone; the client falls back to her whenever a member's rig is not
 * there (see `stageModelFor` in `lib/client.js`).
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
  for (const name of Object.keys(CHARACTERS)) {
    if (!characterReady(name)) continue;
    const definition = CHARACTERS[name];
    routes.push({
      path: `${STAGE_BASE}/char/${name}/model3.json`,
      run: async () =>
        new Response(JSON.stringify(characterDescriptor(name)), {
          status: 200,
          headers: {
            "content-type": JSON_TYPE,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        }),
    });
    routes.push({
      path: `${STAGE_BASE}/char/${name}/${definition.moc.file}`,
      run: () => serveFile({ source: `${definition.dir}/${definition.moc.file}`, type: definition.moc.type, cache: WEEK }),
    });
    if (definition.physics) {
      routes.push({
        path: `${STAGE_BASE}/char/${name}/${definition.physics.file}`,
        run: () =>
          serveFile({ source: `${definition.dir}/${definition.physics.file}`, type: definition.physics.type, cache: WEEK }),
      });
    }
    definition.textures.forEach((texture, index) => {
      routes.push({
        path: `${STAGE_BASE}/char/${name}/texture_${String(index).padStart(2, "0")}.png`,
        run: () => serveFile({ source: `${definition.dir}/${texture.file}`, type: texture.type, cache: WEEK }),
      });
    });
  }
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