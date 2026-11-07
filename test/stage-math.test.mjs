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
  const state = { writes: 0, updates: 0, breathSteps: [], physicsSteps: [], hooks: {} };
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
    on(event, callback) {
      state.hooks[event] = callback;
    },
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
      const hair = model.__stageActing && model.__stageActing.hair;
      assert.ok(Number.isFinite(hair), "hair must be computed every frame");
      min = Math.min(min, hair);
      max = Math.max(max, hair);
    }
  }
  assert.ok(min >= -0.22 - 1e-9, `hair floor broken: ${min}`);
  assert.ok(max <= 0.22 + 1e-9, `hair ceiling broken: ${max}`);
  // And it has to actually move, otherwise the locks are glued in place.
  assert.ok(max - min > 0.05, `hair never swings (range ${min}..${max})`);
}

// --- 3. every seat gets its acting through the library's own update hook ---
// The stage no longer writes parameters from stageFrame. Each rig registers a
// `beforeModelUpdate` listener; the library's update() calls it after breath,
// blink and physics have written their values and right before its single
// core.update(). That is what makes the idle look like the showcase pages, and
// it is why the tests below invoke the hook instead of reading the values map.
{
  const { models, wobbles } = buildRow();
  const layout = stageLayout(models.length);
  const seen = models.map(() => ({ turns: [], nods: [] }));
  for (let elapsed = 0; elapsed <= 24000; elapsed += 41) {
    stageFrame(models, wobbles, elapsed, -1, layout.baseY);
    models.forEach((model, index) => {
      const acting = model.__stageActing;
      assert.ok(acting, `seat ${index} has no acting pose`);
      for (const key of ["turn", "nod", "lean", "hair", "mouth", "mouthForm", "axe"]) {
        assert.ok(Number.isFinite(acting[key]), `seat ${index} acting.${key} is not finite`);
      }
      seen[index].turns.push(acting.turn);
      seen[index].nods.push(acting.nod);
      // Nothing may be written outside the library's update: if stageFrame
      // started writing parameters again we would be back to double updates.
      assert.equal(model.$.state.writes, 0, `seat ${index} wrote parameters outside the update hook`);
    });
  }
  models.forEach((model, index) => {
    assert.ok(model.$.state.hooks.beforeModelUpdate, `seat ${index} never registered the acting hook`);
    const span = Math.max(...seen[index].turns) - Math.min(...seen[index].turns);
    assert.ok(Number.isFinite(span) && span >= 0, `seat ${index} turn spans nothing`);
  });
}

// --- 3b. the hook composes with breath instead of overwriting it ------------
// Breath writes AngleX = 5 before the hook runs; our acting turn must be *added*
// on top (5 + turn), not replace it. Gemini is the exception: its summed turn is
// held at +/-6 because past that the head/hair seam opens.
{
  const { models, wobbles } = buildRow();
  const layout = stageLayout(models.length);
  stageFrame(models, wobbles, 5123, -1, layout.baseY);
  models.forEach((model, index) => {
    const hook = model.$.state.hooks.beforeModelUpdate;
    model.$.values.set("ParamAngleX", 5);
    model.$.values.set("ParamBodyAngleZ", 0.4);
    hook();
    const turn = model.__stageActing.turn;
    const got = model.$.values.get("ParamAngleX");
    if (index === 2) {
      assert.ok(Math.abs(got - Math.max(-6, Math.min(6, 5 + turn))) < 1e-9,
        `gemini must clamp the summed turn to 6: ${got.toFixed(3)}`);
    } else {
      assert.ok(Math.abs(got - (5 + turn)) < 1e-9,
        `seat ${index} must add its turn to the breath value (got ${got.toFixed(3)}, turn ${turn.toFixed(3)})`);
    }
    // The acting turn itself is the only thing we contribute, and it stays small
    // so the summed angle never leaves the band where the seam shows.
    assert.ok(Math.abs(turn) <= 2.5 + 1e-9, `seat ${index} acting turn ${turn.toFixed(2)} exceeds 2.5 deg`);
    assert.ok(Math.abs(model.$.values.get("ParamBodyAngleZ") - (0.4 + model.__stageActing.lean)) < 1e-9,
      `seat ${index} must add its lean to the breath value`);
    assert.ok(Math.abs(model.$.values.get("ParamHairFront")) <= 0.22 + 1e-9,
      `seat ${index} hair out of range after the hook`);
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