import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let plugin;
let loadCount = 0;

// ---------------------------------------------------------------------------
// React stub: createElement returning plain element objects, plus the small
// hook subset the workbench uses. Hooks are reset before every render pass.
// ---------------------------------------------------------------------------
const hooks = { index: 0, states: [], effects: [] };
function resetHooks() {
  hooks.index = 0;
  hooks.states = [];
  hooks.effects = [];
}
const React = {
  Fragment: "fragment",
  createElement(type, props, ...children) {
    const merged = props ? { ...props } : {};
    if (children.length === 1) merged.children = children[0];
    else if (children.length > 1) merged.children = children;
    return { type, props: merged, children };
  },
  useState(init) {
    const i = hooks.index++;
    if (hooks.states[i] === undefined) hooks.states[i] = typeof init === "function" ? init() : init;
    const setState = (value) => {
      hooks.states[i] = typeof value === "function" ? value(hooks.states[i]) : value;
    };
    return [hooks.states[i], setState];
  },
  useEffect(fn) {
    hooks.effects.push(fn);
  },
  useRef(init) {
    const i = hooks.index++;
    if (hooks.states[i] === undefined) hooks.states[i] = { current: init };
    return hooks.states[i];
  },
  useMemo(fn, deps) {
    const i = hooks.index++;
    const prev = hooks.states[i];
    if (
      prev &&
      prev.__memo &&
      Array.isArray(deps) &&
      prev.deps.length === deps.length &&
      deps.every((d, j) => d === prev.deps[j])
    ) {
      return prev.value;
    }
    hooks.states[i] = { __memo: true, deps: deps || [], value: fn() };
    return hooks.states[i].value;
  },
  useCallback(fn, deps) {
    const i = hooks.index++;
    if (hooks.states[i] === undefined) hooks.states[i] = { value: fn };
    return hooks.states[i].value;
  },
};

const MarkdownText = function MarkdownText() {};
const ICON_NAMES = [
  "IconUsersOutlineRegular",
  "IconChevronLeftOutlineRegular",
  "IconChevronDownOutlineRegular",
  "IconRefreshOutlineRegular",
  "IconDownloadOutlineRegular",
  "IconStopFillRegular",
  "IconWarningTriangleOutlineRegular",
  "IconSendOutlineRegular",
];
const primitives = { MarkdownText };
for (const name of ICON_NAMES) {
  primitives[name] = function IconStub() {};
}
const requireStub = (id) => {
  if (id === "react") return React;
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error(`unexpected client require: ${id}`);
};

Object.defineProperty(globalThis, "document", {
  value: { documentElement: { lang: "zh-CN" } },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { language: "zh-CN" },
  configurable: true,
});
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loadCount += 1;
      assert.equal(definition.id, "dsh-simroundtable");
      plugin = definition.factory(requireStub);
    },
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};

const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
Function("window", "document", "navigator", source)(globalThis.window, globalThis.document, globalThis.navigator);

assert.ok(plugin, "client plugin must register through __ModuleLoader__");
assert.deepEqual(plugin.inject, ["slots"]);

const { store, actions } = window.__dshRoundtable;
assert.ok(store, "store must be exposed for tests");
assert.ok(typeof actions.initPage === "function", "actions must be exposed for tests");

// ---------------------------------------------------------------------------
// Slot registration capture
// ---------------------------------------------------------------------------
const registrations = [];
function slotsHost() {
  return {
    slots: {
      inject(name, factory) {
        factory();
      },
      register(options, component) {
        registrations.push({ options, component });
        return options;
      },
    },
  };
}
plugin.apply(slotsHost());

const byName = (name) => registrations.filter((r) => r.options.name === name);
const commandviews = byName("conversation.chat.commandview");
const panellist = byName("sidebar.panellist");
const panels = byName("main");

assert.equal(commandviews.length, 1, "commandview registration preserved");
assert.equal(commandviews[0].options.key, "roundtable");
assert.equal(commandviews[0].options.id, "dsh-simroundtable");

assert.equal(panellist.length, 1, "sidebar.panellist entry registered");
assert.equal(panellist[0].options.id, "roundtable");
assert.equal(panellist[0].options.label(), "圆桌会议");

assert.equal(panels.length, 1, "main keyed panel registered");
assert.equal(panels[0].options.key, "roundtable");

assert.equal(
  panellist[0].options.id,
  panels[0].options.key,
  "panellist id must match the main panel key",
);

const PanelIcon = panellist[0].component;
const iconElement = PanelIcon({ size: 20 });
assert.equal(iconElement.type, primitives.IconUsersOutlineRegular, "panel icon uses the users icon");

// ---------------------------------------------------------------------------
// Roundtable command view (legacy behavior preserved)
// ---------------------------------------------------------------------------
const RoundtableView = commandviews[0].component;
const running = RoundtableView({ node: { outcome: null } });
assert.equal(running.props["data-roundtable-state"], "running");

const failed = RoundtableView({ node: { outcome: { kind: "error", text: "boom" } } });
assert.equal(failed.props["data-roundtable-state"], "error");

const done = RoundtableView({ node: { outcome: { kind: "success", text: "# 圆桌讨论结果\n\nhello" } } });
assert.equal(done.props["data-roundtable-state"], "done");
assert.equal(done.children[0].type, MarkdownText);
assert.equal(done.children[0].props.text, "# 圆桌讨论结果\n\nhello");
assert.equal(typeof done.children[0].props.labels.code.copyLabel, "string");

// ---------------------------------------------------------------------------
// Tiny renderer: expand function components into element trees
// ---------------------------------------------------------------------------
function renderTree(element) {
  resetHooks();
  return expand(element);
}
function expand(node) {
  if (node === null || node === undefined || typeof node === "boolean") return node;
  if (typeof node === "string" || typeof node === "number") return node;
  if (Array.isArray(node)) return node.map(expand).filter((x) => x !== null && x !== undefined);
  if (typeof node.type === "function") {
    const previous = hooks.index;
    hooks.index = 0;
    const output = node.type(node.props ?? {});
    hooks.index = previous;
    return { composite: node.type, props: node.props ?? {}, rendered: expand(output) };
  }
  const rawChildren = node.children === undefined ? [] : Array.isArray(node.children) ? node.children : [node.children];
  return { type: node.type, props: node.props ?? {}, children: rawChildren.map(expand).flat(Infinity).filter((x) => x !== null && x !== undefined) };
}
function findAll(node, predicate, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  if (predicate(node)) out.push(node);
  for (const key of ["children", "rendered"]) {
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) findAll(child, predicate, out);
    else if (value) findAll(value, predicate, out);
  }
  return out;
}
function findView(tree, name) {
  return findAll(tree, (n) => n.props && n.props["data-roundtable-view"] === name)[0];
}
function findByTestId(tree, testid) {
  return findAll(tree, (n) => n.props && n.props["data-roundtable-button"] === testid)[0];
}
function page() {
  return renderTree(React.createElement(WorkbenchPageComponent));
}
const WorkbenchPageComponent = panels[0].component;

function resetStore(patch) {
  store.reset();
  store.set({ boot: "ready" });
  if (patch) store.set(patch);
}

// ---------------------------------------------------------------------------
// Setup view
// ---------------------------------------------------------------------------
{
  resetStore({
    boot: "ready",
    workspaces: [{ id: "C:\\demo\\workspace", title: "demo" }],
    workspaceId: "C:\\demo\\workspace",
    catalog: "ready",
    models: [
      { key: "deepseek/deepseek-chat", provider: "deepseek", providerName: "DeepSeek", model: "deepseek-chat", label: "DeepSeek Chat" },
      { key: "deepseek/deepseek-reasoner", provider: "deepseek", providerName: "DeepSeek", model: "deepseek-reasoner" },
      { key: "zhipu/glm-4", provider: "zhipu", providerName: "智谱", model: "glm-4" },
    ],
    catalogDefaults: { rounds: 1 },
    catalogLimits: { maxAnswerers: 8, maxReviewers: 8, maxRounds: 5 },
    meetingsState: "ready",
    meetings: [],
    selected: [],
    topic: "",
  });
  const tree = page();
  assert.ok(findView(tree, "setup"), "setup view rendered");

  const topic = findAll(tree, (n) => n.props && n.props["data-roundtable-topic"])[0];
  assert.ok(topic, "topic textarea rendered");

  // No topic, no models → start disabled.
  const start = findByTestId(tree, "start");
  assert.ok(start, "start button rendered");
  assert.equal(start.props.disabled, true, "start disabled without topic/models");

  // Catalog error state shows retry.
  store.set({ catalog: "error", catalogError: "目录服务不可用" });
  const errorTree = page();
  const retry = findByTestId(errorTree, "retry");
  assert.ok(retry, "catalog error shows retry button");
  const errorText = findAll(errorTree, (n) => typeof n.children?.[0] === "string" && n.children[0].includes("模型目录加载失败"));
  assert.ok(errorText.length > 0, "catalog error title rendered");

  // Two models + topic → start enabled.
  store.set({ catalog: "ready", selected: ["deepseek/deepseek-chat", "zhipu/glm-4"], topic: "如何评估圆桌会议质量" });
  const readyTree = page();
  const startReady = findByTestId(readyTree, "start");
  assert.equal(startReady.props.disabled, false, "start enabled with topic + 2 models");

  // Live meeting banner with resume button.
  store.set({
    meetings: [{ id: "m-live", topic: "进行中的会议", status: "running", createdAt: "2026-01-01T08:00:00Z", updatedAt: "2026-01-01T08:00:00Z" }],
  });
  const bannerTree = page();
  const banner = findAll(bannerTree, (n) => n.props && n.props["data-roundtable-live-banner"])[0];
  assert.ok(banner, "live banner rendered");
  const resume = findByTestId(bannerTree, "resume");
  assert.ok(resume, "resume button rendered");
  resume.props.onClick();
  assert.equal(store.get().view, "detail");
  assert.equal(store.get().detailId, "m-live");
}

// ---------------------------------------------------------------------------
// Start meeting flow (POST /meetings) with fetch stub
// ---------------------------------------------------------------------------
{
  resetStore({
    boot: "ready",
    workspaces: [{ id: "C:\\demo\\ws" }],
    workspaceId: "C:\\demo\\ws",
    catalog: "ready",
    models: [
      { key: "a/model-1", provider: "a", providerName: "A", model: "model-1" },
      { key: "b/model-2", provider: "b", providerName: "B", model: "model-2" },
      { key: "b/model-3", provider: "b", providerName: "B", model: "model-3" },
    ],
    catalogDefaults: { rounds: 1 },
    catalogLimits: { maxAnswerers: 8, maxReviewers: 8, maxRounds: 5 },
    selected: ["a/model-1", "b/model-2"],
    topic: "测试议题",
    reviewersMode: "peers",
    meetingsState: "ready",
    meetings: [],
    attachments: [
      { id: "u-text", name: "spec.md", kind: "text", mime: "text/markdown", bytes: 12 },
      { id: "u-image", name: "chart.png", kind: "image", mime: "image/png", bytes: 34 },
    ],
  });

  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith("/api/roundtable/meetings") && options && options.method === "POST") {
      return {
        ok: true,
        status: 202,
        json: async () => ({ ok: true, data: { meeting: { id: "m-new", topic: "测试议题", status: "queued" } } }),
      };
    }
    if (String(url).startsWith("/api/roundtable/meeting?")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { meeting: { id: "m-new", topic: "测试议题", status: "completed", transcript: [] } } }),
      };
    }
    if (String(url).startsWith("/api/roundtable/meetings?")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { meetings: [] } }) };
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: { code: "not_found", message: "nope" } }) };
  };

  try {
    await actions.startMeeting();

    const post = calls.find((c) => c.options && c.options.method === "POST");
    assert.ok(post, "POST /api/roundtable/meetings issued");
    assert.ok(post.url.startsWith("/api/roundtable/meetings"), "create route is exact-path");
    const body = JSON.parse(post.options.body);
    assert.equal(body.topic, "测试议题");
    assert.deepEqual(body.answerers, [
      { provider: "a", model: "model-1" },
      { provider: "b", model: "model-2" },
    ]);
    assert.equal(body.rounds, 1, "rounds default applied");
    assert.equal(body.workspace, "C:\\demo\\ws", "workspace sent when known");
    assert.equal(body.reviewers, undefined, "peers mode omits reviewers");
    assert.equal(body.arbiter, undefined, "no arbiter by default");
    assert.deepEqual(body.attachments, ["u-text", "u-image"], "attachment ids ride the create call");
    assert.deepEqual(store.get().attachments, [], "pending attachments are cleared once the meeting owns them");

    assert.equal(store.get().view, "detail");
    assert.equal(store.get().detailId, "m-new");
    assert.equal(store.get().detailState, "ready");
    assert.equal(store.get().meeting.status, "completed", "detail loaded after create");

    const getDetail = calls.find((c) => String(c.url).startsWith("/api/roundtable/meeting?"));
    assert.ok(getDetail, "detail fetched via GET /api/roundtable/meeting?id=…");
    assert.ok(getDetail.url.includes("id=m-new"), "detail id passed via query");
    assert.ok(getDetail.url.includes("include=full"), "full detail requested");
  } finally {
    globalThis.fetch = previousFetch;
  }
}

// ---------------------------------------------------------------------------
// Detail view: running meeting
// ---------------------------------------------------------------------------
const RUNNING_MEETING = {
  id: "m1",
  topic: "测试议题",
  status: "running",
  stage: "reviewing",
  stageLabel: "匿名评审",
  rounds: 2,
  currentRound: 1,
  createdAt: "2026-01-01T08:00:00Z",
  startedAt: "2026-01-01T08:00:01Z",
  progress: {
    stageIndex: 2,
    stageCount: 4,
    percent: 50,
    members: [
      { key: "deepseek/deepseek-chat", role: "answerer", label: "DeepSeek Chat", status: "done" },
      { key: "zhipu/glm-4", role: "answerer", label: "GLM-4", status: "running" },
      { key: "deepseek/deepseek-reasoner", role: "reviewer", label: "Reasoner", status: "running" },
    ],
  },
  transcript: [
    { seq: 1, stage: "answering", round: null, role: "answerer", actorKey: "deepseek/deepseek-chat", anonymousId: "A", title: "A 的回答", text: "## 答案\n\n正文内容", at: "2026-01-01T08:01:00Z" },
    { seq: 2, stage: "answering", round: null, role: "answerer", actorKey: "zhipu/glm-4", anonymousId: "B", title: "B 的回答", error: "请求超时", at: "2026-01-01T08:02:00Z" },
  ],
  reviews: [],
  finalAnswer: null,
  failures: [{ stage: "answering", entry: { key: "zhipu/glm-4", provider: "zhipu", providerName: "Zhipu", model: "glm-4", modelName: "GLM-4", label: "GLM-4" }, message: "请求超时", at: "2026-01-01T08:02:00Z" }],
};
{
  resetStore({
    view: "detail",
    detailId: "m1",
    detailState: "ready",
    meeting: RUNNING_MEETING,
  });
  const tree = page();
  assert.ok(findView(tree, "detail"), "detail view rendered");

  const status = findAll(tree, (n) => n.props && n.props["data-roundtable-status"])[0];
  assert.equal(status.props["data-roundtable-status"], "running");

  const cancel = findByTestId(tree, "cancel");
  assert.ok(cancel, "cancel button shown while running");
  assert.ok(findByTestId(tree, "export"), "export button shown");

  const stageTitle = findAll(tree, (n) => n.props && n.props["data-roundtable-stage-title"] === "answering")[0];
  assert.ok(stageTitle, "answering stage group rendered");

  const members = findAll(tree, (n) => n.props && n.props["data-roundtable-member"]);
  assert.equal(members.length, 3, "three member chips rendered from real progress data");

  assert.ok(findAll(tree, (n) => n.props && n.props["data-roundtable-failures"])[0], "failure list rendered");
  assert.ok(JSON.stringify(tree).includes("GLM-4"), "failure entry label rendered from v1 shape");
  assert.equal(findAll(tree, (n) => n.props && n.props["data-roundtable-final"]).length, 0, "no final decision card yet");

  // Expand transcript entry 1 → Markdown text visible.
  const toggle = findAll(tree, (n) => n.props && n.props["data-roundtable-entry-toggle"] === "1")[0];
  assert.ok(toggle, "entry toggle rendered");
  toggle.props.onClick();
  assert.equal(store.get().expanded[1], true, "toggle updates store");
  const expandedTree = page();
  const markdown = findAll(expandedTree, (n) => n.type === MarkdownText || n.composite === MarkdownText);
  assert.ok(markdown.some((n) => n.props.text === "## 答案\n\n正文内容"), "expanded entry renders Markdown");

  // Failed entry keeps toggle but body shows error only after expanding.
  const errorToggle = findAll(expandedTree, (n) => n.props && n.props["data-roundtable-entry-toggle"] === "2")[0];
  errorToggle.props.onClick();
  const errorTree = page();
  const errorNodes = findAll(errorTree, (n) => n.props && typeof n.props.style === "object" && n.props.style.color === "var(--dsw-alias-state-error-primary)");
  assert.ok(errorNodes.some((n) => JSON.stringify(n.children).includes("请求超时")), "failed entry shows error text");
}

// ---------------------------------------------------------------------------
// Detail view: completed meeting with final decision pinned first
// ---------------------------------------------------------------------------
const COMPLETED_MEETING = {
  id: "m2",
  topic: "另一个议题",
  status: "completed",
  stage: "completed",
  rounds: 1,
  currentRound: 1,
  createdAt: "2026-01-01T08:00:00Z",
  startedAt: "2026-01-01T08:00:00Z",
  endedAt: "2026-01-01T08:05:00Z",
  transcript: [{ seq: 1, stage: "deciding", role: "arbiter", title: "最终决策", text: "仲裁文本", at: "2026-01-01T08:05:00Z" }],
  reviews: [
    { reviewerKey: "r1", reviewerLabel: "评审 A", anonymous: true, selfReview: false, ranking: [{ answerId: "A", averageRank: 1, votes: 1, sum: 1 }], note: "综合最优" },
    { reviewerKey: "r2", reviewerLabel: "评审 B", anonymous: true, selfReview: true, ranking: [{ answerId: "B", averageRank: 1 }, { answerId: "A", averageRank: 2 }], note: "紧凑排名已重试" },
  ],
  finalAnswer: {
    text: "最终答案正文",
    anonymousId: "A",
    authorLabel: "A",
    fallback: true,
    arbiter: { key: "deepseek/deepseek-chat", label: "DeepSeek Chat", provider: "deepseek", model: "deepseek-chat", text: "仲裁说明" },
    ranking: [{ answerId: "A", averageRank: 1, votes: 2, sum: 2 }],
  },
  failures: [],
};
{
  resetStore({ view: "detail", detailId: "m2", detailState: "ready", meeting: COMPLETED_MEETING });
  const tree = page();

  const finalCard = findAll(tree, (n) => n.props && n.props["data-roundtable-final"])[0];
  assert.ok(finalCard, "final decision card rendered");

  // Final card must appear before any stage group in document order.
  const ordered = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.props && node.props["data-roundtable-final"]) ordered.push("final");
    if (node.props && node.props["data-roundtable-stage-title"]) ordered.push("stage");
    for (const key of ["children", "rendered"]) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value) walk(value);
    }
  })(tree);
  assert.ok(ordered.indexOf("final") !== -1 && ordered.indexOf("final") < ordered.indexOf("stage"), "final decision pinned before transcript");

  assert.ok(findAll(tree, (n) => n.props && n.props["data-roundtable-fallback"])[0], "fallback badge shown");
  assert.equal(findByTestId(tree, "cancel"), undefined, "no cancel button on completed meeting");

  // Ranking collapse inside the final card.
  const rankingToggle = findAll(tree, (n) => n.props && n.props["data-roundtable-collapse"] === "ranking")[0];
  assert.ok(rankingToggle, "ranking collapse rendered");
  rankingToggle.props.onClick();
  const rankedTree = page();
  assert.ok(JSON.stringify(rankedTree).includes("#1"), "ranking rows visible after expand");
  assert.ok(JSON.stringify(rankedTree).includes("2 票"), "ranking votes rendered");

  // Review summary collapse (reviewerLabel from v1 field table).
  const reviewToggle = findAll(rankedTree, (n) => n.props && n.props["data-roundtable-collapse"] === "review-summary")[0];
  assert.ok(reviewToggle, "review summary collapse rendered");
  reviewToggle.props.onClick();
  const reviewsTree = page();
  assert.ok(JSON.stringify(reviewsTree).includes("评审 A"), "reviewerLabel visible after expand");
  assert.ok(JSON.stringify(reviewsTree).includes("综合最优"), "review note visible after expand");
  assert.ok(JSON.stringify(reviewsTree).includes("评审 B"), "second reviewer (v2 rows without votes) visible after expand");
  assert.ok(!JSON.stringify(reviewsTree).includes("undefined"), "no undefined leaks with v2 ranking rows");
}

// ---------------------------------------------------------------------------
// Detail view: cancelled + failed status
// ---------------------------------------------------------------------------
{
  resetStore({
    view: "detail",
    detailId: "m3",
    detailState: "ready",
    meeting: { ...COMPLETED_MEETING, id: "m3", status: "cancelled", stage: "cancelled", finalAnswer: null },
  });
  let tree = page();
  const status = findAll(tree, (n) => n.props && n.props["data-roundtable-status"])[0];
  assert.equal(status.props["data-roundtable-status"], "cancelled");
  assert.equal(findByTestId(tree, "cancel"), undefined, "no cancel on cancelled meeting");
  assert.ok(JSON.stringify(tree).includes("已取消"), "cancelled chip label");

  resetStore({
    view: "detail",
    detailId: "m4",
    detailState: "ready",
    meeting: { ...COMPLETED_MEETING, id: "m4", status: "failed", stage: "failed", finalAnswer: null, failures: [{ stage: "answering", message: "全部模型失败" }] },
  });
  tree = page();
  const failedStatus = findAll(tree, (n) => n.props && n.props["data-roundtable-status"])[0];
  assert.equal(failedStatus.props["data-roundtable-status"], "failed");
  assert.ok(findAll(tree, (n) => n.props && n.props["data-roundtable-failures"])[0], "failures listed on failed meeting");
}

// ---------------------------------------------------------------------------
// Detail loading + error states
// ---------------------------------------------------------------------------
{
  resetStore({ view: "detail", detailId: "mx", detailState: "loading", meeting: null });
  let tree = page();
  assert.ok(findView(tree, "detail"), "detail loading state rendered");

  store.set({ detailState: "error", detailError: "会议不存在" });
  tree = page();
  assert.ok(findByTestId(tree, "retry"), "detail error offers retry");
}

// ---------------------------------------------------------------------------
// History view
// ---------------------------------------------------------------------------
{
  resetStore({ view: "history", meetingsState: "ready", meetings: [] });
  let tree = page();
  assert.ok(findView(tree, "history"), "history view rendered");
  assert.ok(findAll(tree, (n) => n.props && n.props["data-roundtable-empty"])[0], "history empty state rendered");

  store.set({
    meetings: [
      { id: "a", topic: "议题一", status: "completed", stage: "completed", rounds: 1, createdAt: "2026-01-01T08:00:00Z", updatedAt: "2026-01-01T08:03:00Z", finalPreview: "决策预览" },
      { id: "b", topic: "议题二", status: "failed", stage: "failed", rounds: 2, createdAt: "2026-01-02T08:00:00Z", updatedAt: "2026-01-02T08:01:00Z" },
    ],
  });
  tree = page();
  const rows = findAll(tree, (n) => n.props && n.props["data-roundtable-history-item"]);
  assert.equal(rows.length, 2, "history rows rendered");
  assert.ok(JSON.stringify(tree).includes("议题一"), "history row topic shown");
  assert.ok(JSON.stringify(tree).includes("决策预览"), "final preview shown");
}

// ---------------------------------------------------------------------------
// History loading / error states
// ---------------------------------------------------------------------------
{
  resetStore({ view: "history", meetingsState: "loading", meetings: [] });
  let tree = page();
  assert.ok(findView(tree, "history"), "history loading rendered");

  store.set({ meetingsState: "error", meetingsError: "路由未注册" });
  tree = page();
  assert.ok(findByTestId(tree, "retry"), "history error offers retry");
}

// ---------------------------------------------------------------------------
// Toggle actions & workspace switch
// ---------------------------------------------------------------------------
{
  resetStore({ showSettings: false });
  actions.toggleSettings();
  assert.equal(store.get().showSettings, true, "settings toggle");

  resetStore({ selected: ["a/1", "a/2"], catalogLimits: { maxAnswerers: 3 } });
  actions.toggleModel("a/3");
  assert.deepEqual(store.get().selected, ["a/1", "a/2", "a/3"]);
  actions.toggleModel("a/1");
  assert.deepEqual(store.get().selected, ["a/2", "a/3"]);
  actions.toggleModel("b/new");
  assert.deepEqual(store.get().selected, ["a/2", "a/3", "b/new"], "max answerers enforced");

  resetStore({ rounds: null, catalogDefaults: { rounds: 2 }, catalogLimits: { maxRounds: 5 } });
  assert.equal(store.get().rounds, null);
  actions.setRounds("3");
  assert.equal(store.get().rounds, 3);
  actions.setRounds("0");
  assert.equal(store.get().rounds, 0, "rounds 0 allowed (no revision)");
}

// ---------------------------------------------------------------------------
// Markdown export: visible success, visible failure, never a dead button
// ---------------------------------------------------------------------------
{
  const EXPORT_MD = "# 圆桌会议记录\n\n## 话题\n导出测试\n";
  const calls = [];
  let postReply = null;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const entry = { url: String(url), options };
    calls.push(entry);
    if (String(url).startsWith("/api/roundtable/meeting/export") && (!options || options.method !== "POST")) {
      return { ok: true, status: 200, text: async () => EXPORT_MD, json: async () => ({ ok: true, data: {} }) };
    }
    if (String(url).startsWith("/api/roundtable/meeting/export") && options && options.method === "POST") {
      return postReply();
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: { code: "not_found", message: "nope" } }) };
  };
  const clipboard = [];
  globalThis.navigator.clipboard = { writeText: async (text) => void clipboard.push(text) };

  resetStore({ view: "detail", detailId: "m2", detailState: "ready", workspaceId: "C:\\demo\\ws", meeting: COMPLETED_MEETING });

  // 1) The browser save dialog is preferred and reports the chosen file name.
  const written = [];
  let closed = false;
  window.showSaveFilePicker = async (options) => {
    assert.equal(options.suggestedName, "roundtable-m2.md", "picker suggests the meeting file name");
    return {
      name: "我选的记录.md",
      createWritable: async () => ({
        write: async (text) => void written.push(text),
        close: async () => void (closed = true),
      }),
    };
  };
  await actions.exportMeeting();
  assert.equal(store.get().exportState, "saved");
  assert.equal(store.get().exportInfo.method, "picker");
  assert.equal(store.get().exportInfo.filename, "我选的记录.md");
  assert.deepEqual(written, [EXPORT_MD], "picker receives the fetched markdown");
  assert.equal(closed, true, "the writable stream is closed");
  let exportTree = page();
  const savedNode = findAll(exportTree, (n) => n.props && n.props["data-roundtable-export-state"] === "saved")[0];
  assert.ok(savedNode, "saved state is visible");
  assert.ok(JSON.stringify(savedNode.children).includes("我选的记录.md"), "saved file name shown");

  // 2) No picker → the host saves inside the workspace and the path is shown.
  delete window.showSaveFilePicker;
  postReply = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: { path: "C:\\demo\\ws\\.roundtable\\exports\\roundtable-m2.md", filename: "roundtable-m2.md", bytes: EXPORT_MD.length },
    }),
  });
  clipboard.length = 0;
  await actions.exportMeeting();
  assert.equal(store.get().exportState, "saved");
  assert.equal(store.get().exportInfo.method, "workspace");
  assert.equal(store.get().exportInfo.path, "C:\\demo\\ws\\.roundtable\\exports\\roundtable-m2.md");
  exportTree = page();
  assert.ok(JSON.stringify(exportTree).includes("roundtable-m2.md"), "workspace path visible");
  const copyPath = findByTestId(exportTree, "export-copy-path");
  assert.ok(copyPath, "copy-path button offered for the workspace save");
  await copyPath.props.onClick();
  assert.deepEqual(clipboard, ["C:\\demo\\ws\\.roundtable\\exports\\roundtable-m2.md"], "copy path writes the real path");

  // Closing the notice returns the button row to its idle state.
  findByTestId(page(), "export-close").props.onClick();
  assert.equal(store.get().exportState, "idle");

  // 3) Dismissing the save dialog is reported as a cancellation, not a save.
  postReply = async () => {
    throw new Error("must not save when the user cancelled");
  };
  window.showSaveFilePicker = async () => {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  };
  await actions.exportMeeting();
  assert.equal(store.get().exportState, "cancelled");
  assert.ok(JSON.stringify(findAll(page(), (n) => n.props && n.props["data-roundtable-export-state"] === "cancelled")[0]).includes("取消"));

  // 4) Both save paths failing shows the Markdown and the reason.
  delete window.showSaveFilePicker;
  postReply = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, error: { code: "export-failed", message: "磁盘只读" } }),
  });
  await actions.exportMeeting();
  assert.equal(store.get().exportState, "fallback");
  exportTree = page();
  const failure = findAll(exportTree, (n) => n.props && n.props["data-roundtable-export-error"])[0];
  assert.ok(failure, "export error is visible");
  assert.ok(JSON.stringify(failure.children).includes("导出失败"), "error label shown");
  const textarea = findAll(exportTree, (n) => n.props && n.props["data-roundtable-export-text"])[0];
  assert.ok(textarea, "markdown textarea offered as a fallback");
  assert.equal(textarea.props.value, EXPORT_MD, "fallback textarea holds the full markdown");
  assert.equal(textarea.props.readOnly, true, "fallback textarea is read-only");
  clipboard.length = 0;
  await findByTestId(exportTree, "export-copy").props.onClick();
  assert.deepEqual(clipboard, [EXPORT_MD], "copy button writes the markdown");

  // 5) A picker that never answers (the Electron desktop shell) must not hang
  //    the export: the timeout falls through to the host save, and the dead
  //    picker is not tried again for the rest of the page session.
  let pickerCalls = 0;
  window.__roundtablePickerTimeoutMs = 20;
  window.showSaveFilePicker = () => {
    pickerCalls += 1;
    return new Promise(() => {});
  };
  postReply = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: { path: "C:\\demo\\ws\\.roundtable\\exports\\roundtable-m2.md", filename: "roundtable-m2.md", bytes: EXPORT_MD.length },
    }),
  });
  await actions.exportMeeting();
  assert.equal(pickerCalls, 1, "the hanging picker was tried once");
  assert.equal(store.get().exportState, "saved");
  assert.equal(store.get().exportInfo.method, "workspace");
  assert.equal(store.get().exportInfo.path, "C:\\demo\\ws\\.roundtable\\exports\\roundtable-m2.md");
  await actions.exportMeeting();
  assert.equal(pickerCalls, 1, "an unresponsive picker is not retried in the same session");
  assert.equal(store.get().exportState, "saved");
  assert.equal(store.get().exportInfo.method, "workspace");
  delete window.__roundtablePickerTimeoutMs;

  // 6) A failing export request reports the HTTP status instead of nothing.
  postReply = async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: { code: "boom", message: "boom" } }) });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/meeting/export") && (!options || options.method !== "POST")) {
      return { ok: false, status: 404, json: async () => ({ ok: false, error: { code: "meeting-not-found", message: "会议不存在" } }) };
    }
    return realFetch(url, options);
  };
  await actions.exportMeeting();
  assert.equal(store.get().exportState, "error");
  const requestError = findAll(page(), (n) => n.props && n.props["data-roundtable-export-error"])[0];
  assert.ok(JSON.stringify(requestError.children).includes("404"), "HTTP status surfaced");
  assert.ok(JSON.stringify(requestError.children).includes("会议不存在"), "server message surfaced");

  // An empty response body is an error too: nothing would be written otherwise.
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "   " });
  await actions.exportMeeting();
  assert.equal(store.get().exportState, "error");
  assert.ok(JSON.stringify(findAll(page(), (n) => n.props && n.props["data-roundtable-export-error"])[0].children).includes("空"));

  globalThis.fetch = previousFetch;
  delete globalThis.navigator.clipboard;
  delete window.showSaveFilePicker;
  store.set({ exportState: "idle", exportError: null, exportInfo: null, exportText: null, exportCopied: false });
  assert.ok(calls.length > 0, "export used the page API");
}

// ---------------------------------------------------------------------------
// Topic attachments: upload, remove, text-only warning, detail listing
// ---------------------------------------------------------------------------
{
  const models = [
    { key: "a/model-1", provider: "a", providerName: "A", model: "model-1", label: "Model One" },
    { key: "b/model-2", provider: "b", providerName: "B", model: "model-2", label: "Model Two" },
  ];
  resetStore({
    boot: "ready",
    workspaceId: "C:\\demo\\ws",
    catalog: "ready",
    models,
    catalogLimits: { maxAnswerers: 8, maxReviewers: 8, maxRounds: 5, attachments: { maxFiles: 2, maxFileBytes: 1_000 } },
    selected: ["a/model-1", "b/model-2"],
    topic: "附件测试",
    meetingsState: "ready",
    meetings: [],
  });

  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith("/api/roundtable/upload/remove")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { removed: ["u1"] } }) };
    }
    if (String(url) === "/api/roundtable/upload" && options && options.method === "POST") {
      return {
        ok: true,
        status: 201,
        json: async () => ({ ok: true, data: { attachments: [{ id: "u1", name: "spec.md", kind: "text", mime: "text/markdown", bytes: 4 }], limits: { maxFiles: 2 } } }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: { code: "nf", message: "nf" } }) };
  };
  globalThis.FileReader = class FakeFileReader {
    readAsDataURL(file) {
      this.result = `data:${file.type || ""};base64,${Buffer.from(file.content || "").toString("base64")}`;
      queueMicrotask(() => this.onload());
    }
  };
  try {
    await actions.addAttachments([{ name: "spec.md", type: "text/markdown", size: 4, content: "# hi" }]);
    assert.equal(store.get().uploading, false);
    assert.deepEqual(store.get().attachments.map((item) => item.id), ["u1"], "uploaded attachment stored");
    const upload = calls.find((call) => call.url === "/api/roundtable/upload");
    const body = JSON.parse(upload.options.body);
    assert.equal(body.workspace, "C:\\demo\\ws");
    assert.equal(body.files[0].name, "spec.md");
    assert.equal(body.files[0].data, Buffer.from("# hi").toString("base64"), "file bytes are base64 encoded");

    let tree = page();
    const row = findAll(tree, (n) => n.props && n.props["data-roundtable-attachment"] === "u1")[0];
    assert.ok(row, "attachment row rendered in setup");
    assert.ok(JSON.stringify(row).includes("spec.md"), "attachment name shown");
    assert.ok(findAll(tree, (n) => n.props && n.props["data-roundtable-add-file"])[0], "add-file control rendered");

    findByTestId(tree, "remove-attachment:u1").props.onClick();
    assert.equal(store.get().attachments.length, 0, "removing drops it from the pending list");
    await Promise.resolve();
    assert.ok(calls.some((call) => call.url === "/api/roundtable/upload/remove"), "server is asked to drop the upload");

    // A text-only route is called out once both an image and its capability are known.
    store.set({
      attachments: [{ id: "u2", name: "chart.png", kind: "image", mime: "image/png", bytes: 10 }],
      capabilities: { "a/model-1": false, "b/model-2": true },
    });
    tree = page();
    const warning = findAll(tree, (n) => n.props && n.props["data-roundtable-capability-warning"])[0];
    assert.ok(warning, "text-only warning rendered for an attached image");
    assert.ok(JSON.stringify(warning.children).includes("Model One"), "the model that cannot see images is named");
    assert.ok(!JSON.stringify(warning.children).includes("Model Two"), "image-capable models are not listed");
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.FileReader;
  }

  // Detail view lists the attachments the meeting was started with.
  resetStore({
    view: "detail",
    detailId: "m-attach",
    detailState: "ready",
    meeting: {
      ...COMPLETED_MEETING,
      id: "m-attach",
      attachments: [
        { id: "u3", name: "数据表.csv", kind: "text", mime: "text/csv", bytes: 2048 },
        { id: "u4", name: "diagram.png", kind: "image", mime: "image/png", bytes: 4096 },
      ],
    },
  });
  const detailTree = page();
  assert.ok(findAll(detailTree, (n) => n.props && n.props["data-roundtable-meeting-attachments"])[0], "detail attachment card rendered");
  assert.ok(JSON.stringify(detailTree).includes("数据表.csv"), "text attachment listed");
  assert.ok(JSON.stringify(detailTree).includes("diagram.png"), "image attachment listed");
}

// ---------------------------------------------------------------------------
// Scrolling: the host main slot is a flex column with `overflow: hidden` and
// no scroller of its own (ui-layout `.centerCol`), so the workbench root has to
// be the scroll container. Without `height: 100%` + `minHeight: 0` +
// `overflowY: auto` a long record is clipped and the wheel does nothing.
// ---------------------------------------------------------------------------
{
  resetStore({
    boot: "ready",
    workspaces: [{ id: "C:\\demo\\workspace", title: "demo" }],
    workspaceId: "C:\\demo\\workspace",
    catalog: "ready",
    models: [],
    meetingsState: "ready",
    meetings: [],
    view: "detail",
    detailId: "m-long",
    detail: {
      id: "m-long",
      topic: "long record",
      status: "completed",
      stage: "completed",
      stageLabel: "已完成",
      rounds: 1,
      roundsRun: 1,
      workspace: "C:\\demo\\workspace",
      createdAt: "2026-10-30T04:11:12.000Z",
      updatedAt: "2026-10-30T04:16:08.000Z",
      roster: {
        answerers: [{ key: "a/one", label: "One", provider: "a", model: "one", status: "done", stage: "done" }],
        reviewers: [],
        arbiter: null,
      },
      progress: { stageIndex: 5, stageCount: 5, completed: 5, total: 5, percent: 100, members: [] },
      transcript: Array.from({ length: 40 }, (_, index) => ({
        seq: index + 1,
        stage: "answering",
        role: "answerer",
        title: `第 ${index + 1} 段`,
        text: `记录正文 ${index + 1}：`.repeat(20),
        at: "2026-10-30T04:12:00.000Z",
      })),
      answers: [],
      reviews: [],
      ranking: [],
      finalAnswer: { text: "# 终稿\n\n" + "结论正文。".repeat(200), fallback: false },
      failures: [],
      limitations: [],
      notes: [],
    },
  });
  const tree = page();
  const roots = findAll(tree, (n) => n.props && n.props["data-roundtable-page"] === "workbench");
  assert.equal(roots.length, 1, "exactly one workbench scroll root");
  const style = roots[0].props.style;
  assert.equal(style.height, "100%", "root is bounded to the host slot height");
  assert.equal(style.minHeight, 0, "flex-item automatic minimum size is defeated");
  assert.equal(style.overflowY, "auto", "root owns the vertical scrollbar");
  assert.equal(style.overflowX, "hidden", "no horizontal scrollbar");
  assert.equal(style.boxSizing, "border-box", "padding stays inside the slot height");

  // No descendant may take vertical scrolling away from the root: a nested
  // scroller (or a fixed max-height) would trap the long record again.
  const scrollers = findAll(roots[0], (n) => {
    const s = n.props && n.props.style;
    return s && (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflow === "auto");
  });
  assert.equal(scrollers.length, 1, "the root is the only vertical scroller");
  const capped = findAll(roots[0], (n) => {
    const s = n.props && n.props.style;
    return s && typeof s.maxHeight === "string" && /px|vh/.test(s.maxHeight);
  });
  assert.equal(capped.length, 0, "no fixed-height cap inside the record");

  // The detail view still renders inside that scroller, and its long text is
  // present (i.e. reachable by scrolling rather than truncated away).
  assert.ok(findView(tree, "detail"), "detail view rendered inside the scroll root");
  assert.ok(JSON.stringify(tree).includes("结论正文"), "the final answer text is in the DOM, not clipped out");
}

// ---------------------------------------------------------------------------
// Stage: name plates drop the provider suffix when seats get narrow
// ---------------------------------------------------------------------------
function stageMeeting(count) {
  const members = [];
  for (let i = 0; i < count; i += 1) {
    members.push({
      key: `prov${i}/model-${i}`,
      role: "answerer",
      label: `model-${i}-long · prov${i}`,
      status: "done",
    });
  }
  return {
    id: `stage-${count}`,
    topic: "舞台排座",
    status: "completed",
    stage: "completed",
    stageLabel: "已完成",
    rounds: 1,
    currentRound: 1,
    createdAt: "2026-01-01T08:00:00Z",
    progress: { stageIndex: 4, stageCount: 4, percent: 100, members },
    transcript: members.map((m, i) => ({
      seq: i + 1,
      stage: "answering",
      role: "answerer",
      actorKey: m.key,
      title: `${i + 1} 的回答`,
      text: `第 ${i + 1} 位的回答正文。`,
      at: "2026-01-01T08:01:00Z",
    })),
    reviews: [],
    finalAnswer: null,
    failures: [],
  };
}

const plateText = (node) => {
  const kids = node.props.children;
  const list = Array.isArray(kids) ? kids : [kids];
  const last = list[list.length - 1];
  return String(list.length && last && last.props ? last.props.children : "");
};

{
  // 8 seats → step ≈ 89.5 < 130, plates must show only the model name.
  resetStore({ view: "detail", detailId: "stage-8", detailState: "ready", meeting: stageMeeting(8) });
  const tree = page();
  const plates = findAll(tree, (n) => n.props && n.props["data-roundtable-seat"]);
  assert.equal(plates.length, 8, "eight seats are rendered at the table");
  for (const [i, plate] of plates.entries()) {
    const text = plateText(plate);
    assert.equal(text, `model-${i}-long`, `seat ${i} plate drops the provider suffix`);
    assert.equal(plate.props.title, `model-${i}-long · prov${i}`, "full label stays in the tooltip");
  }
  assert.ok(!JSON.stringify(plates.map((p) => p.props.children)).includes("· prov"), "no provider suffix in narrow plates");
}

{
  // 2 seats → step ≈ 358 ≥ 130, plates keep the full label.
  resetStore({ view: "detail", detailId: "stage-2", detailState: "ready", meeting: stageMeeting(2) });
  const tree = page();
  const plates = findAll(tree, (n) => n.props && n.props["data-roundtable-seat"]);
  assert.equal(plates.length, 2, "two seats rendered");
  assert.equal(plateText(plates[0]), "model-0-long · prov0", "wide plates keep the provider suffix");
  assert.equal(plateText(plates[1]), "model-1-long · prov1", "wide plates keep the provider suffix");
}

console.log("client.test.mjs: all assertions passed");
