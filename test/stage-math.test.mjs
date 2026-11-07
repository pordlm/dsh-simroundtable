// Regression tests for the stage math that drove three user-visible bugs:
//
//   - a NaN parameter collapses the deformer it feeds, which on the dark stage
//     reads as "the hair vanished" or "a black patch appeared";
//   - ParamHairFront past +/-0.22 slides the side locks off the scalp and opens
//     a hole for the background to show through;
//   - with autoUpdate:false the library no longer blinks or breathes for us, and
//     a seat whose parameters stop changing reads as a frozen picture.
//
// These run the real `stageFrame` from lib/client.js against fake rigs, so they
// cover the shipped code rather than a copy of it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// --- module stubs -----------------------------------------------------------
const React = {
  Fragment: "fragment",
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (init) => ({ current: init }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn(),
};
const primitives = new Proxy({ MarkdownText: function MarkdownText() {} }, {
  get: (target, prop) => target[prop] || function Stub() {},
});
const requireStub = (id) => {
  if (id === "react") return React;
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error(`unexpected client require: ${id}`);
};

let plugin = null;
// Node 22 ships its own `navigator`; the plugin is loaded through a plain
// `Function(...)` call, so the stubs have to be replaceable properties.
Object.defineProperty(globalThis, "document", {
  value: { documentElement: { lang: "zh-CN" } },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { language: "zh-CN" },
  configurable: true,
});
globalThis.window = {
  __ModuleLoader__: { load: (definition) => { plugin = definition.factory(requireStub); } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
Function("window", "document", "navigator", source)(globalThis.window, globalThis.document, globalThis.navigator);

assert.ok(plugin, "client plugin must register");
const math = globalThis.window.__dshStageMath;
assert.ok(math, "stage math must be exposed for tests");

const { stageFrame, stageWobble, stageLayout, stageCharacterFor } = math;

// --- fake rigs --------------------------------------------------------------
const BREATH = {
  ParamAngleX: 1.5,
  ParamAngleY: 0.5,
  ParamAngleZ: 0.25,
  ParamBodyAngleX: 1.7,
  ParamBodyAngleY: 0.4,
  ParamBodyAngleZ: 0.6,
};

function fakeModel(name, overrides = {}) {
  const values = new Map();
  const state = { writes: 0, updates: 0, breathSteps: [], physicsSteps: [] };
  const core = {
    setParameterValueById(id, value) {
      state.writes += 1;
      values.set(id, value);
    },
    getParameterValueById(id) {
      return values.has(id) ? values.get(id) : 0;
    },
    setPartOpacityById() {},
    update() {
      state.updates += 1;
    },
  };
  const internalModel = {
    coreModel: core,
    settings: { name },
    breath: {
      update(_core, dt) {
        state.breathSteps.push(dt);
        for (const [id, value] of Object.entries(internalModel.breath.values || BREATH)) values.set(id, value);
      },
    },
    physics: {
      evaluate(_core, dt) {
        state.physicsSteps.push(dt);
      },
    },
  };
  return {
    x: 0,
    y: 0,
    rotation: 0,
    alpha: 1,
    internalModel,
    __stageCharacter: null,
    ...overrides,
    // exposed last so the test sees the live maps
    $: { values, state, core },
  };
}

const SEATS = ["grok-v1", "claude", "gemini-v1", "gpt-half-atlas2048", "whale-girl"];

// stageGesture picks its next move with Math.random, so without a seed the
// assertions below would pass or fail depending on the run. Freeze it.
{
  let seed = 20261107;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function buildRow(elapsedFrom = 0, breathValues = null) {
  const models = SEATS.map((name) => {
    const model = fakeModel(name);
    if (breathValues) model.internalModel.breath.values = breathValues;
    model.__stageCharacter = stageCharacterFor({ key: name, label: name });
    return model;
  });
  const wobbles = models.map(() => stageWobble());
  return { models, wobbles, elapsedFrom };
}

// --- 1. no non-finite parameter ever reaches a rig ---------------------------
{
  const { models, wobbles } = buildRow();
  const layout = stageLayout(models.length);
  for (let elapsed = 0; elapsed <= 20000; elapsed += 37) {
    stageFrame(models, wobbles, elapsed, elapsed % 6000 < 3000 ? 0 : 2, layout.baseY);
    for (const model of models) {
      for (const [id, value] of model.$.values) {
        assert.ok(Number.isFinite(value), `${id} went non-finite at t=${elapsed} (${model.internalModel.settings.name})`);
      }
    }
  }
}

// --- 2. hair stays inside the range the art tolerates ------------------------
{
  const { models, wobbles } = buildRow();
  const layout = stageLayout(models.length);
  let min = Infinity;
  let max = -Infinity;
  for (let elapsed = 0; elapsed <= 30000; elapsed += 23) {
    stageFrame(models, wobbles, elapsed, -1, layout.baseY);
    for (const model of models) {
      const hair = model.$.values.get("ParamHairFront");
      assert.ok(Number.isFinite(hair), "hair must be written every frame");
      min = Math.min(min, hair);
      max = Math.max(max, hair);
    }
  }
  assert.ok(min >= -0.22 - 1e-9, `hair floor broken: ${min}`);
  assert.ok(max <= 0.22 + 1e-9, `hair ceiling broken: ${max}`);
  // And it has to actually move, otherwise the locks are glued in place.
  assert.ok(max - min > 0.05, `hair never swings (range ${min}..${max})`);
}

// --- 3. every seat is animated: blink, breath, physics ----------------------
{
  const { models, wobbles } = buildRow();
  const layout = stageLayout(models.length);
  const seen = models.map(() => ({ eyes: new Set(), angles: [], blob: [] }));
  for (let elapsed = 0; elapsed <= 24000; elapsed += 41) {
    stageFrame(models, wobbles, elapsed, -1, layout.baseY);
    models.forEach((model, index) => {
      seen[index].eyes.add(Number(model.$.values.get("ParamEyeLOpen").toFixed(3)));
      seen[index].angles.push(model.$.values.get("ParamAngleX"));
      seen[index].blob.push(model.$.values.get("ParamBodyAngleZ"));
    });
  }
  models.forEach((model, index) => {
    const eyes = [...seen[index].eyes];
    assert.ok(eyes.every((v) => v >= 0 && v <= 1), `eye value out of range on seat ${index}`);
    assert.ok(eyes.some((v) => v < 0.95), `seat ${index} never blinks (${eyes.length} distinct values)`);
    assert.ok(model.$.state.breathSteps.length > 0, `seat ${index} breath module never stepped`);
    assert.ok(model.$.state.physicsSteps.length > 0, `seat ${index} physics never stepped`);
    // Breath is added on top of the acting offsets: ParamBodyAngleX carries
    // nothing else, so it must be exactly what the breath module wrote.
    assert.ok(
      Math.abs(model.$.values.get("ParamBodyAngleX") - BREATH.ParamBodyAngleX) < 1e-9,
      `seat ${index} dropped the breath offset`,
    );
    const span = Math.max(...seen[index].angles) - Math.min(...seen[index].angles);
    assert.ok(span > 0.5, `seat ${index} head angle barely moves (span ${span.toFixed(3)}°)`);
  });
}

// --- 4. per-rig hair corrections are armed by name -------------------------
{
  const { models, wobbles } = buildRow();
  const layout = stageLayout(models.length);
  stageFrame(models, wobbles, 1000, -1, layout.baseY);
  assert.equal(models[0].__hairComp, 1, "grok rig must get the counter-offset");
  assert.equal(models[2].__shoulderComp, 1, "gemini rig must get the shoulder guard");
  for (const [index, model] of models.entries()) {
    if (index === 0) continue;
    assert.equal(model.__hairComp, 0, `${model.internalModel.settings.name} must not get it`);
  }
  for (const [index, model] of models.entries()) {
    if (index === 2) continue;
    assert.equal(model.__shoulderComp, 0, `${model.internalModel.settings.name} must not get it`);
  }
}

// --- 4b. Gemini's head turn is capped only while the torso is turned -------
// Browser evidence (preview/_evidence/safe_corner.txt): with the forward hair
// bias applied the enclosed hole stays at the ~1228 px pose baseline up to
// -8 deg; at -10 deg with the torso also turned it reopens to 2376 px, so the
// *summed* head turn is capped at 8 there. With the torso square the same
// -10 deg measures 1309 px, i.e. no seam - and a blanket cap printed exactly
// -8.00 under gestures, truncating the acting nod. So the cap is conditional.
{
  // The real rig's breath module writes AngleX (+-4.9 deg), so the fixture picks a
  // breath strong enough to cross the cap - otherwise the branch stays untested.
  const { models, wobbles } = buildRow(0, { ...BREATH, ParamAngleX: 7 });
  const layout = stageLayout(models.length);
  const gemini = models[2];
  assert.equal(BREATH.ParamBodyAngleX > 0.8, true, "fixture must simulate a turned torso");
  let capped = 0;
  let maxRaw = 0;
  // Gemini is the speaking seat here: that is when the head turn is largest
  // (the browser sample reached -15.5 deg while seat 2 held the floor).
  for (let elapsed = 0; elapsed <= 40000; elapsed += 41) {
    stageFrame(models, wobbles, elapsed, 2, layout.baseY);
    const raw = gemini.__headTurnRaw;
    const value = gemini.$.values.get("ParamAngleX");
    assert.ok(Math.abs(value - Math.max(-8, Math.min(8, raw))) < 1e-9,
      `gemini head turn is not capped at 8: raw ${raw.toFixed(2)} -> ${value.toFixed(2)}`);
    maxRaw = Math.max(maxRaw, Math.abs(raw));
    if (Math.abs(raw) > 8) capped += 1;
  }
  assert.equal(gemini.__headTurnCap, 8, "gemini must arm the cap while the torso is turned");
  assert.ok(capped > 0, `fixture never crossed the cap (max ${maxRaw.toFixed(2)}), so the branch is untested`);
}

// --- 4c. ... and the cap widens to 10 deg when the torso is square ---------
{
  const { models, wobbles } = buildRow(0, { ...BREATH, ParamAngleX: 7, ParamBodyAngleX: 0 });
  const layout = stageLayout(models.length);
  const gemini = models[2];
  stageFrame(models, wobbles, 1000, -1, layout.baseY);
  assert.equal(gemini.__headTurnCap, 10, "a square torso must widen the cap to 10");
  for (let elapsed = 0; elapsed <= 24000; elapsed += 41) {
    stageFrame(models, wobbles, elapsed, -1, layout.baseY);
    const raw = gemini.__headTurnRaw;
    assert.ok(Math.abs(gemini.$.values.get("ParamAngleX") - Math.max(-10, Math.min(10, raw))) < 1e-9,
      `square-torso head turn must pass through up to 10 deg: raw ${raw.toFixed(2)}`);
  }
}

// --- 5. layout sanity: seats do not overlap --------------------------------
{
  for (const count of [1, 2, 3, 5, 8]) {
    const layout = stageLayout(count);
    assert.equal(layout.xs.length, count);
    const gaps = layout.xs.slice(1).map((x, i) => x - layout.xs[i]);
    for (const gap of gaps) {
      assert.ok(gap > 40, `${count} seats: seats ${gap.toFixed(0)}px apart`);
    }
    assert.ok(layout.stageH >= 280 && layout.stageH <= 440, `${count} seats: stage height ${layout.stageH}`);
  }
}

console.log("stage math tests passed");