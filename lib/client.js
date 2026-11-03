// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Client half of dsh-simroundtable.
 *
 * Two things are registered here:
 *
 * 1. The historical `conversation.chat.commandview` replacement for the
 *    `/roundtable` command result (full-width Markdown instead of the
 *    collapsed default card). Behavior is unchanged.
 *
 * 2. The standalone 「圆桌会议」 workbench: a `sidebar.panellist` entry and a
 *    keyed `main` panel (both use the id "roundtable") rendering a meeting
 *    workbench on top of the host-side `/api/roundtable` routes. The page
 *    talks to the host exclusively over that same-origin HTTP API; it never
 *    fabricates progress, stages or token costs — everything shown comes from
 *    real meeting records returned by the host.
 */
window.__ModuleLoader__.load({
  id: "dsh-simroundtable",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const P = require("@deepseek-ai/dsh-client-ui-primitives");
    const MarkdownText = P.MarkdownText;
    const IconUsers = P.IconUsersOutlineRegular;
    const IconChevronLeft = P.IconChevronLeftOutlineRegular;
    const IconChevronDown = P.IconChevronDownOutlineRegular;
    const IconRefresh = P.IconRefreshOutlineRegular;
    const IconDownload = P.IconDownloadOutlineRegular;
    const IconStop = P.IconStopFillRegular;
    const IconWarning = P.IconWarningTriangleOutlineRegular;
    const IconSend = P.IconSendOutlineRegular;

    const zh =
      typeof document !== "undefined" && /^zh(-|$)/i.test(String(document.documentElement.lang || ""))
        ? true
        : /^zh(-|$)/i.test(String((typeof navigator !== "undefined" && navigator.language) || ""));

    const T = {
      panel: zh ? "圆桌会议" : "Roundtable",
      panelSubtitle: zh ? "多模型独立回答 · 讨论 · 匿名评审 · 最终决策" : "Independent answers, discussion, review, decision",
      navNew: zh ? "新会议" : "New meeting",
      navHistory: zh ? "历史" : "History",
      back: zh ? "返回" : "Back",
      topicLabel: zh ? "议题" : "Topic",
      topicPlaceholder: zh ? "描述要讨论的议题，越具体越好…" : "Describe the question to discuss…",
      attachmentsLabel: zh ? "议题附件" : "Topic files",
      attachmentsHint: zh
        ? "支持图片的模型会看到图片；纯文本模型只收到文本类文件的内容"
        : "Models with image input see images; text-only models only receive the text files",
      attachmentsAdd: zh ? "添加文件" : "Add files",
      attachmentsUploading: zh ? "正在上传…" : "Uploading…",
      attachmentsEmpty: zh ? "可附加图片、代码、表格、文档等；图片只发给支持图片的模型。" : "Attach images, code, tables or documents; images go only to models that accept them.",
      attachmentRemove: zh ? "移除" : "Remove",
      attachmentKindImage: zh ? "图片" : "image",
      attachmentKindText: zh ? "文本" : "text",
      attachmentImageSkipped: (models) => (zh ? `这些模型看不到图片，只收到文本：${models}` : `These models cannot see images, so they only get the text: ${models}`),
      attachmentTooManyClient: (max) => (zh ? `最多添加 ${max} 个附件` : `At most ${max} attachments`),
      attachmentTooLargeClient: (name) => (zh ? `文件太大：${name}` : `File is too large: ${name}`),
      attachmentReadFailed: (name) => (zh ? `读取失败：${name}` : `Could not read ${name}`),
      attachmentsUnavailableClient: zh ? "当前宿主没有提供附件存储" : "This host does not provide attachment storage",
      attachmentNoWorkspace: zh ? "请先选择工作区" : "Pick a workspace first",
      rosterLabel: zh ? "回答阵容" : "Answerers",
      rosterHint: zh ? "选择 2–8 位参与独立回答的模型" : "Pick 2–8 models to answer independently",
      advanced: zh ? "评审、仲裁与轮次" : "Review, arbiter & rounds",
      reviewersPeers: zh ? "全体回答者互评（推荐）" : "All answerers review each other (recommended)",
      reviewersCustom: zh ? "自选评审模型" : "Pick reviewer models",
      reviewersHint: zh ? "选择 1–8 位评审（匿名评审）" : "Pick 1–8 anonymous reviewers",
      arbiterLabel: zh ? "仲裁模型" : "Arbiter",
      arbiterAuto: zh ? "自动（默认仲裁流程）" : "Automatic (default)",
      roundsLabel: zh ? "讨论/修订轮数" : "Discussion rounds",
      roundsNone: zh ? "0（不修订）" : "0 (no revision)",
      languageLabel: zh ? "回复语言" : "Language",
      languageAuto: zh ? "自动" : "Auto",
      start: zh ? "开始圆桌会议" : "Start roundtable",
      starting: zh ? "正在创建会议…" : "Creating meeting…",
      needTopic: zh ? "请先填写议题" : "Enter a topic first",
      needModels: zh ? "至少选择 2 个模型" : "Select at least 2 models",
      selectedCount: (n, max) => (zh ? `已选 ${n}/${max} 个模型` : `${n}/${max} models selected`),
      catalogLoading: zh ? "正在加载模型目录…" : "Loading model catalog…",
      catalogFailed: zh ? "模型目录加载失败" : "Failed to load model catalog",
      retry: zh ? "重试" : "Retry",
      catalogFailures: zh ? "部分目录来源失败" : "Some catalog sources failed",
      workspaceLabel: zh ? "工作区" : "Workspace",
      liveBanner: zh ? "有一场会议正在进行" : "A meeting is in progress",
      resume: zh ? "继续查看" : "Resume",
      recent: zh ? "最近的会议" : "Recent meetings",
      viewAll: zh ? "查看全部" : "View all",
      empty: zh ? "还没有会议记录" : "No meetings yet",
      emptyHint: zh ? "配置阵容后一键开始第一场圆桌会议。" : "Configure a roster and start your first roundtable.",
      loading: zh ? "加载中…" : "Loading…",
      meetingsFailed: zh ? "历史记录加载失败" : "Failed to load meetings",
      detailFailed: zh ? "会议详情加载失败" : "Failed to load meeting",
      cancel: zh ? "取消会议" : "Cancel meeting",
      cancelling: zh ? "正在取消…" : "Cancelling…",
      exportMd: zh ? "导出 Markdown" : "Export Markdown",
      exportWorking: zh ? "正在准备导出…" : "Preparing export…",
      exportSavedTo: (name) => (zh ? `已保存：${name}` : `Saved: ${name}`),
      exportSavedPath: (path) => (zh ? `已保存到 ${path}` : `Saved to ${path}`),
      exportBytes: (n) => (zh ? `（${n} 字节）` : ` (${n} bytes)`),
      exportCancelled: zh ? "已取消保存。" : "Save cancelled.",
      exportFailed: zh ? "导出失败" : "Export failed",
      exportEmpty: zh ? "导出内容为空，未写入文件。" : "The export came back empty, so nothing was written.",
      exportFallbackHint: zh
        ? "浏览器的保存对话框不可用，完整 Markdown 已显示在下方，可复制后自行保存。"
        : "The browser save dialog is unavailable; the full Markdown is shown below so you can copy it.",
      exportSaveFailedLabel: zh ? "写入文件失败" : "Writing the file failed",
      copyMd: zh ? "复制内容" : "Copy content",
      copyPath: zh ? "复制路径" : "Copy path",
      copied: zh ? "已复制" : "Copied",
      close: zh ? "关闭" : "Close",
      refresh: zh ? "刷新" : "Refresh",
      decision: zh ? "最终决策" : "Final decision",
      decisionMissing: zh ? "本场会议未产生最终决策。" : "No final decision was produced.",
      fallbackBadge: zh ? "仲裁不可用，已回退最高分回答" : "Arbiter unavailable, fell back to top-ranked answer",
      arbiterNote: zh ? "仲裁说明" : "Arbiter notes",
      ranking: zh ? "评分排名" : "Rankings",
      votes: zh ? "票" : "votes",
      reviewSummary: zh ? "匿名评审汇总" : "Review summary",
      reviewerN: (n) => (zh ? `匿名评审 ${n}` : `Reviewer ${n}`),
      failures: zh ? "失败记录" : "Failures",
      limitations: zh ? "限制说明" : "Limitations",
      notes: zh ? "备注" : "Notes",
      members: zh ? "成员状态" : "Members",
      pollError: zh ? "刷新遇到问题，正在重试" : "Refresh hiccup, retrying",
      duration: zh ? "耗时" : "Duration",
      round: (cur, total) => (zh ? `第 ${cur}/${total} 轮` : `round ${cur}/${total}`),
      roleAnswerer: zh ? "回答" : "answer",
      roleReviewer: zh ? "评审" : "review",
      roleArbiter: zh ? "仲裁" : "arbiter",
      roleSystem: zh ? "系统" : "system",
      runningBadge: zh ? "进行中" : "running",
      noTranscript: zh ? "暂无过程记录，等待成员响应…" : "No transcript yet, waiting for members…",
      httpError: (status) => (zh ? `请求失败（HTTP ${status}）` : `Request failed (HTTP ${status})`),
      stageTitle: zh ? "长桌舞台" : "Long-table stage",
      stageLoading: zh ? "正在载入舞台…" : "Loading the stage…",
      stageFailed: zh ? "舞台不可用：Live2D 资源没有载入" : "Stage unavailable: the Live2D runtime did not load",
      stageHint: zh ? "点名字可查看该成员的回答摘要" : "Click a name to read that member's answer",
      stageThinking: zh ? "思考中…" : "thinking…",
      stageNoAnswer: zh ? "暂无回答" : "No answer yet",
      stageUnavailable: zh ? "此环境不支持舞台渲染" : "This environment cannot render the stage",
    };

    const MD_LABELS = zh
      ? {
          code: {
            copyLabel: "复制",
            copiedLabel: "已复制",
            toolbarLabels: { codeLabel: "代码", wrapLabel: "自动换行", unwrapLabel: "取消换行" },
          },
          footnotes: "脚注",
        }
      : {
          code: {
            copyLabel: "Copy",
            copiedLabel: "Copied",
            toolbarLabels: { codeLabel: "Code", wrapLabel: "Wrap", unwrapLabel: "Unwrap" },
          },
          footnotes: "Footnotes",
        };

    const C = {
      text: "var(--dsw-alias-label-primary)",
      text2: "var(--dsw-alias-label-secondary)",
      text3: "var(--dsw-alias-label-tertiary)",
      bg: "var(--dsw-alias-bg-base)",
      layer1: "var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base))",
      layer2: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)))",
      border: "var(--dsw-alias-border-l1)",
      border2: "var(--dsw-alias-border-l2)",
      hover: "var(--dsw-alias-interactive-bg-hover)",
      active: "var(--dsw-alias-interactive-bg-active)",
      brand: "var(--dsw-alias-brand-primary)",
      error: "var(--dsw-alias-state-error-primary)",
      success: "var(--dsw-alias-state-success-primary)",
      warn: "var(--dsw-alias-state-warn-primary)",
      business: "var(--dsw-alias-state-business-primary)",
      idle: "var(--dsw-alias-state-idle-primary)",
      radius: "var(--dsw-radius-md, 8px)",
      radiusLg: "var(--dsw-radius-lg, 12px)",
      fontSize2: "var(--dsh-content-font-size-secondary, 13px)",
    };

    const STATUS_META = {
      queued: { label: zh ? "排队中" : "queued", tone: C.idle, live: true },
      running: { label: zh ? "进行中" : "running", tone: C.business, live: true },
      completed: { label: zh ? "已完成" : "completed", tone: C.success, live: false },
      failed: { label: zh ? "失败" : "failed", tone: C.error, live: false },
      cancelled: { label: zh ? "已取消" : "cancelled", tone: C.text3, live: false },
      interrupted: { label: zh ? "已中断" : "interrupted", tone: C.warn, live: false },
    };

    const STAGE_LABELS = {
      queued: zh ? "等待开始" : "queued",
      answering: zh ? "独立回答" : "Independent answers",
      discussing: zh ? "讨论" : "Discussion",
      reviewing: zh ? "匿名评审" : "Anonymous review",
      deciding: zh ? "最终决策" : "Decision",
      completed: zh ? "已完成" : "completed",
      failed: zh ? "失败" : "failed",
      cancelled: zh ? "已取消" : "cancelled",
      interrupted: zh ? "已中断" : "interrupted",
    };

    const MEMBER_STATUS = {
      pending: { label: zh ? "等待" : "pending", tone: C.idle },
      running: { label: zh ? "进行中" : "running", tone: C.business },
      done: { label: zh ? "完成" : "done", tone: C.success },
      failed: { label: zh ? "失败" : "failed", tone: C.error },
      skipped: { label: zh ? "跳过" : "skipped", tone: C.text3 },
    };

    const ROLE_LABELS = {
      answerer: T.roleAnswerer,
      reviewer: T.roleReviewer,
      arbiter: T.roleArbiter,
      system: T.roleSystem,
    };

    function statusLabel(status) {
      const meta = STATUS_META[status];
      return meta ? meta.label : String(status || "");
    }
    function isLiveStatus(status) {
      const meta = STATUS_META[status];
      return meta ? meta.live : true;
    }
    function statusTone(status) {
      const meta = STATUS_META[status];
      return meta ? meta.tone : C.business;
    }
    function stageText(stage, fallback) {
      return STAGE_LABELS[stage] || fallback || String(stage || "");
    }
    function memberStatusMeta(status) {
      return MEMBER_STATUS[status] || { label: String(status || ""), tone: C.idle };
    }
    function roleLabel(role) {
      return ROLE_LABELS[role] || "";
    }

    function formatTime(value) {
      if (!value) return "";
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    function formatDuration(a, b) {
      if (!a || !b) return "";
      const start = new Date(a).getTime();
      const end = new Date(b).getTime();
      if (isNaN(start) || isNaN(end)) return "";
      const total = Math.max(0, Math.round((end - start) / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return minutes > 0 ? `${minutes} ${zh ? "分" : "min"} ${seconds} ${zh ? "秒" : "s"}` : `${seconds} ${zh ? "秒" : "s"}`;
    }
    function qs(params) {
      const parts = [];
      for (const key of Object.keys(params)) {
        const value = params[key];
        if (value === undefined || value === null || value === "") continue;
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
      }
      return parts.length ? "?" + parts.join("&") : "";
    }

    const API_BASE = "/api/roundtable";
    async function api(path, options) {
      const res = await fetch(API_BASE + path, options);
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        body = null;
      }
      if (!res.ok || !body || body.ok !== true) {
        const code = (body && body.error && body.error.code) || "http_" + res.status;
        const message = (body && body.error && body.error.message) || T.httpError(res.status);
        const error = new Error(message);
        error.code = code;
        throw error;
      }
      return body.data;
    }

    /**
     * Fetch the Markdown export and turn every failure into a message the user
     * can read: the previous implementation clicked a bare anchor and swallowed
     * exceptions, so a broken export looked like a dead button.
     */
    async function fetchExport(id, workspace) {
      const url = API_BASE + "/meeting/export" + qs({ id, workspace });
      let res;
      try {
        res = await fetch(url, { headers: { accept: "text/markdown" }, credentials: "same-origin" });
      } catch (error) {
        throw new Error(`${T.exportFailed}：${(error && error.message) || T.exportEmpty}`);
      }
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = (body && body.error && body.error.message) || "";
        } catch (error) {
          detail = "";
        }
        throw new Error(`${T.httpError(res.status)}${detail ? "：" + detail : ""}`);
      }
      let text = "";
      try {
        text = await res.text();
      } catch (error) {
        throw new Error(`${T.exportFailed}：${(error && error.message) || T.exportEmpty}`);
      }
      if (typeof text !== "string" || text.trim() === "") throw new Error(T.exportEmpty);
      return text;
    }

    /* The Electron desktop shell does not implement the File System Access save
     * dialog: `showSaveFilePicker` neither shows a window nor settles, so an
     * export would wait forever. Treat a picker that does not answer within this
     * budget as unavailable, fall back to the workspace save, and remember it for
     * the rest of the page session so every later click answers immediately.
     * `window.__roundtablePickerTimeoutMs` only exists so tests need not wait. */
    const PICKER_TIMEOUT_MS = 5_000;
    let pickerUnavailable = false;

    function pickerTimeoutMs() {
      const override = Number(typeof window !== "undefined" ? window.__roundtablePickerTimeoutMs : NaN);
      return Number.isFinite(override) && override > 0 ? override : PICKER_TIMEOUT_MS;
    }

    /**
     * Write through the browser's own save dialog when the shell offers one.
     * Returns `{ name }` on success, `"cancelled"` when the user dismissed the
     * dialog, and `null` when the picker is unavailable or unusable so the
     * caller can fall back to the workspace save.
     */
    async function saveWithPicker(text, filename) {
      const picker = typeof window !== "undefined" ? window.showSaveFilePicker : undefined;
      if (pickerUnavailable || typeof picker !== "function") return null;
      let outcome;
      let timer;
      try {
        outcome = await Promise.race([
          Promise.resolve(
            picker.call(window, {
              suggestedName: filename,
              types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
            }),
          ).then(
            (value) => ({ handle: value }),
            (error) => ({ error }),
          ),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve({ timedOut: true }), pickerTimeoutMs());
          }),
        ]);
      } catch (error) {
        pickerUnavailable = true;
        return null;
      } finally {
        // The picker answered (or threw) first: drop the pending deadline so it
        // neither holds the page's timer nor the test process open.
        clearTimeout(timer);
      }
      if (outcome.timedOut) {
        // A picker that never settles is dead for this shell; a late handle (if
        // the shell ever answers) is ignored on purpose — the caller already
        // wrote the file elsewhere.
        pickerUnavailable = true;
        return null;
      }
      if (outcome.error) {
        // A dismissal is not a failure: report it, do not fall through to a
        // silent workspace write the user did not ask for.
        if (outcome.error.name === "AbortError") return "cancelled";
        pickerUnavailable = true;
        return null;
      }
      const handle = outcome.handle;
      try {
        const writable = await handle.createWritable();
        try {
          await writable.write(text);
        } finally {
          await writable.close();
        }
      } catch (error) {
        // The handle exists but the write failed: let the workspace save try,
        // so the user still gets a file.
        try {
          await handle.remove?.();
        } catch (cleanupError) {
          // Removing a partially written file is best effort.
        }
        return null;
      }
      return { name: handle.name || filename };
    }

    const WORKSPACE_PREF_KEY = "dsh-simroundtable.workspace";
    function loadWorkspacePref() {
      try {
        const value = window.localStorage.getItem(WORKSPACE_PREF_KEY);
        return typeof value === "string" && value ? value : null;
      } catch (e) {
        return null;
      }
    }
    function saveWorkspacePref(id) {
      try {
        window.localStorage.setItem(WORKSPACE_PREF_KEY, id);
      } catch (e) {}
    }

    function initialState() {
      return {
        view: "setup",
        detailId: null,
        boot: "loading",
        bootError: null,
        workspaces: [],
        workspaceId: null,
        catalog: "loading",
        catalogError: null,
        models: [],
        catalogFailures: [],
        catalogDefaults: {},
        catalogLimits: {},
        topic: "",
        attachments: [],
        uploading: false,
        uploadError: null,
        capabilities: {},
        selected: [],
        reviewersMode: "peers",
        reviewerSelected: [],
        arbiterKey: "",
        rounds: null,
        language: "",
        starting: false,
        actionError: null,
        meetings: [],
        meetingsState: "loading",
        meetingsError: null,
        meeting: null,
        detailState: "loading",
        detailError: null,
        pollError: null,
        cancelling: false,
        exportState: "idle",
        exportError: null,
        exportInfo: null,
        exportText: null,
        exportCopied: false,
        expanded: {},
        showRanking: false,
        showReviews: false,
        showArbiterNote: false,
        showSettings: false,
      };
    }

    function createStore(create) {
      let state = create();
      const subscribers = new Set();
      return {
        get() {
          return state;
        },
        set(patch) {
          state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
          subscribers.forEach((fn) => {
            try {
              fn();
            } catch (e) {}
          });
        },
        reset() {
          state = create();
          subscribers.forEach((fn) => {
            try {
              fn();
            } catch (e) {}
          });
        },
        subscribe(fn) {
          subscribers.add(fn);
          return () => subscribers.delete(fn);
        },
      };
    }

    const store = createStore(initialState);

    function useStore() {
      const [snapshot, setSnapshot] = React.useState(store.get);
      React.useEffect(() => store.subscribe(() => setSnapshot(store.get())), []);
      return snapshot;
    }

    let pollToken = 0;
    const POLL_INTERVAL_MS = 1200;
    const MAX_POLL_FAILURES = 10;

    function delay(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    function formatSize(bytes) {
      const n = Number(bytes);
      if (!Number.isFinite(n) || n < 0) return "";
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    function readFileBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error(T.attachmentReadFailed(file.name)));
        reader.readAsDataURL(file);
      });
    }

    function attachmentMaxFiles(s) {
      const limits = (s.catalogLimits && s.catalogLimits.attachments) || {};
      const max = Number(limits.maxFiles);
      return Number.isFinite(max) && max >= 0 ? max : 8;
    }

    function attachmentMaxBytes(s) {
      const limits = (s.catalogLimits && s.catalogLimits.attachments) || {};
      const max = Number(limits.maxFileBytes);
      return Number.isFinite(max) && max > 0 ? max : 8 * 1024 * 1024;
    }

    function modelByKey(key) {
      const models = store.get().models;
      for (const model of models) if (model.key === key) return model;
      return null;
    }
    function rosterFromBody(keys) {
      const roster = [];
      for (const key of keys) {
        const model = modelByKey(key);
        if (model) roster.push({ provider: model.provider, model: model.model });
      }
      return roster;
    }
    function effectiveRounds(s) {
      const max = Number(s.catalogLimits && s.catalogLimits.maxRounds);
      if (s.rounds !== null && s.rounds !== undefined) return s.rounds;
      const fallback = s.catalogDefaults && typeof s.catalogDefaults.rounds === "number" ? s.catalogDefaults.rounds : 1;
      return Number.isFinite(max) && max >= 0 ? Math.min(fallback, max) : fallback;
    }

    async function fetchMeeting(id) {
      const ws = store.get().workspaceId;
      return api("/meeting" + qs({ id, workspace: ws, include: "full" }));
    }

    async function pollLoop(id, token) {
      let failures = 0;
      while (pollToken === token) {
        await delay(POLL_INTERVAL_MS);
        if (pollToken !== token) return;
        const s = store.get();
        if (s.view !== "detail" || s.detailId !== id) return;
        if (s.meeting && !isLiveStatus(s.meeting.status)) return;
        try {
          const data = await fetchMeeting(id);
          if (pollToken !== token) return;
          const current = store.get();
          if (current.view !== "detail" || current.detailId !== id) return;
          const meeting = data && data.meeting;
          store.set({ meeting, detailState: "ready", pollError: null });
          failures = 0;
          if (!meeting || !isLiveStatus(meeting.status)) return;
        } catch (e) {
          if (pollToken !== token) return;
          failures += 1;
          store.set({ pollError: e.message });
          if (failures >= MAX_POLL_FAILURES) {
            store.set({ detailState: "error", detailError: e.message });
            return;
          }
        }
      }
    }

    const actions = {
      async initPage() {
        store.set({ boot: "loading", bootError: null });
        try {
          const data = await api("/workspaces");
          const list = Array.isArray(data && data.workspaces) ? data.workspaces : [];
          const pref = loadWorkspacePref();
          const preferred = list.some((w) => w && w.id === pref)
            ? pref
            : (data && data.defaultWorkspace) || (list[0] && list[0].id) || null;
          store.set({
            boot: "ready",
            workspaces: list,
            workspaceId: preferred,
          });
          actions.loadCatalog();
          actions.loadMeetings();
        } catch (e) {
          store.set({ boot: "error", bootError: e.message });
        }
      },
      async loadCatalog() {
        const ws = store.get().workspaceId;
        store.set({ catalog: "loading", catalogError: null });
        try {
          const data = await api("/catalog" + qs({ workspace: ws }));
          const models = Array.isArray(data && data.models) ? data.models : [];
          const limits = (data && data.limits) || {};
          const defaults = (data && data.defaults) || {};
          const previous = store.get().selected.filter((key) => models.some((m) => m.key === key));
          const previousReviewers = store.get().reviewerSelected.filter((key) => models.some((m) => m.key === key));
          const selected = previous.length >= 2 ? previous : models.slice(0, Math.min(2, models.length)).map((m) => m.key);
          const maxRounds = typeof limits.maxRounds === "number" ? limits.maxRounds : 5;
          const rounds = store.get().rounds === null || store.get().rounds === undefined || store.get().rounds > maxRounds
            ? null
            : store.get().rounds;
          store.set({
            catalog: "ready",
            models,
            catalogFailures: Array.isArray(data && data.failures) ? data.failures : [],
            catalogDefaults: defaults,
            catalogLimits: limits,
            selected,
            reviewerSelected: previousReviewers,
            rounds,
          });
        } catch (e) {
          store.set({ catalog: "error", catalogError: e.message });
        }
      },
      async loadMeetings() {
        const ws = store.get().workspaceId;
        store.set({ meetingsState: "loading", meetingsError: null });
        try {
          const data = await api("/meetings" + qs({ workspace: ws, limit: 50 }));
          store.set({
            meetingsState: "ready",
            meetings: Array.isArray(data && data.meetings) ? data.meetings : [],
          });
        } catch (e) {
          store.set({ meetingsState: "error", meetingsError: e.message });
        }
      },
      selectWorkspace(id) {
        if (!id || id === store.get().workspaceId) return;
        saveWorkspacePref(id);
        pollToken += 1;
        store.set({ workspaceId: id, view: "setup", detailId: null, meeting: null, attachments: [], uploadError: null, capabilities: {} });
        actions.loadCatalog();
        actions.loadMeetings();
      },
      async addAttachments(fileList) {
        const s = store.get();
        if (s.uploading) return;
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        if (!s.workspaceId) return store.set({ uploadError: T.attachmentNoWorkspace });
        const max = attachmentMaxFiles(s);
        const room = max - s.attachments.length;
        if (room <= 0) return store.set({ uploadError: T.attachmentTooManyClient(max) });
        const accepted = files.slice(0, room);
        const perFile = attachmentMaxBytes(s);
        const tooLarge = accepted.find((file) => file.size > perFile);
        if (tooLarge) return store.set({ uploadError: T.attachmentTooLargeClient(tooLarge.name) });
        store.set({ uploading: true, uploadError: null });
        try {
          const payload = [];
          for (const file of accepted) {
            payload.push({ name: file.name, mime: file.type || "", data: await readFileBase64(file) });
          }
          const data = await api("/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace: s.workspaceId, files: payload }),
          });
          const stored = Array.isArray(data && data.attachments) ? data.attachments : [];
          store.set({ uploading: false, attachments: store.get().attachments.concat(stored) });
          actions.probeCapabilities();
        } catch (e) {
          store.set({ uploading: false, uploadError: e.message });
        }
      },
      removeAttachment(id) {
        const s = store.get();
        store.set({ attachments: s.attachments.filter((item) => item.id !== id), uploadError: null });
        // Best effort: a stale upload left on disk costs bytes, never correctness.
        api("/upload/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: s.workspaceId, ids: [id] }),
        }).catch(() => {});
      },
      /** Learn which selected routes accept images, so the page can say who will not see them. */
      async probeCapabilities() {
        const s = store.get();
        if (!s.attachments.some((item) => item.kind === "image")) return;
        const known = s.capabilities || {};
        const pending = s.selected.filter((key) => !(key in known));
        if (pending.length === 0) return;
        const learned = {};
        await Promise.all(pending.map(async (key) => {
          const model = modelByKey(key);
          if (!model) return;
          try {
            const data = await api("/capabilities" + qs({ provider: model.provider, model: model.model }));
            learned[key] = data && data.image === undefined ? null : Boolean(data.image);
          } catch (e) {
            learned[key] = null;
          }
        }));
        store.set({ capabilities: { ...store.get().capabilities, ...learned } });
      },
      setTopic(topic) {
        store.set({ topic });
      },
      toggleModel(key) {
        const s = store.get();
        const has = s.selected.indexOf(key) >= 0;
        let next = has ? s.selected.filter((k) => k !== key) : s.selected.concat([key]);
        const max = (s.catalogLimits && s.catalogLimits.maxAnswerers) || 8;
        if (!has && next.length > max) next = next.slice(0, max);
        store.set({ selected: next });
        actions.probeCapabilities();
      },
      toggleReviewer(key) {
        const s = store.get();
        const has = s.reviewerSelected.indexOf(key) >= 0;
        let next = has ? s.reviewerSelected.filter((k) => k !== key) : s.reviewerSelected.concat([key]);
        const max = (s.catalogLimits && s.catalogLimits.maxReviewers) || 8;
        if (!has && next.length > max) next = next.slice(0, max);
        store.set({ reviewerSelected: next });
      },
      setReviewersMode(mode) {
        store.set({ reviewersMode: mode === "custom" ? "custom" : "peers" });
      },
      setArbiterKey(key) {
        store.set({ arbiterKey: key || "" });
      },
      setRounds(rounds) {
        const max = Number(store.get().catalogLimits && store.get().catalogLimits.maxRounds);
        const value = Number(rounds);
        if (!Number.isFinite(value) || value < 0) return store.set({ rounds: null });
        store.set({ rounds: Number.isFinite(max) && max >= 0 ? Math.min(value, max) : value });
      },
      setLanguage(language) {
        store.set({ language: language || "" });
      },
      toggleSettings() {
        store.set({ showSettings: !store.get().showSettings });
      },
      toggleExpanded(seq) {
        const s = store.get();
        store.set({ expanded: { ...s.expanded, [seq]: !s.expanded[seq] } });
      },
      toggleRanking() {
        store.set({ showRanking: !store.get().showRanking });
      },
      toggleReviews() {
        store.set({ showReviews: !store.get().showReviews });
      },
      toggleArbiterNote() {
        store.set({ showArbiterNote: !store.get().showArbiterNote });
      },
      async startMeeting() {
        const s = store.get();
        if (s.starting) return;
        const topic = String(s.topic || "").trim();
        const answerers = rosterFromBody(s.selected);
        if (!topic || answerers.length < 2) return;
        const body = { topic, answerers, rounds: effectiveRounds(s) };
        if (s.reviewersMode === "custom") {
          const reviewers = rosterFromBody(s.reviewerSelected);
          if (reviewers.length > 0) body.reviewers = reviewers;
        }
        if (s.arbiterKey) {
          const model = modelByKey(s.arbiterKey);
          if (model) body.arbiter = { provider: model.provider, model: model.model };
        }
        if (s.language) body.language = s.language;
        if (s.workspaceId) body.workspace = s.workspaceId;
        if (s.attachments.length > 0) body.attachments = s.attachments.map((item) => item.id);
        store.set({ starting: true, actionError: null });
        try {
          const data = await api("/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const meeting = data && data.meeting;
          const id = meeting && meeting.id;
          store.set({ starting: false, attachments: [], capabilities: {} });
          if (id) {
            await actions.openDetail(id);
          } else {
            store.set({ actionError: T.httpError(200) });
          }
          actions.loadMeetings();
        } catch (e) {
          store.set({ starting: false, actionError: e.message });
        }
      },
      async openDetail(id) {
        pollToken += 1;
        const token = pollToken;
        store.set({
          view: "detail",
          detailId: id,
          detailState: "loading",
          detailError: null,
          pollError: null,
          meeting: null,
          expanded: {},
          showRanking: false,
          showReviews: false,
          showArbiterNote: false,
          cancelling: false,
          actionError: null,
        });
        try {
          const data = await fetchMeeting(id);
          if (pollToken !== token) return;
          const meeting = data && data.meeting;
          store.set({ meeting, detailState: "ready" });
          if (meeting && isLiveStatus(meeting.status)) pollLoop(id, token);
        } catch (e) {
          if (pollToken !== token) return;
          store.set({ detailState: "error", detailError: e.message });
        }
      },
      refreshMeeting() {
        const id = store.get().detailId;
        if (id) actions.openDetail(id);
      },
      backToSetup() {
        pollToken += 1;
        store.set({ view: "setup", detailId: null, meeting: null, actionError: null, pollError: null });
        actions.loadMeetings();
      },
      openHistory() {
        pollToken += 1;
        store.set({ view: "history", detailId: null, meeting: null, actionError: null, pollError: null });
        actions.loadMeetings();
      },
      async cancelMeeting() {
        const s = store.get();
        const meeting = s.meeting;
        if (!meeting || !isLiveStatus(meeting.status) || s.cancelling) return;
        store.set({ cancelling: true, actionError: null });
        try {
          const data = await api("/meeting/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: meeting.id, workspace: s.workspaceId }),
          });
          store.set({ cancelling: false, meeting: (data && data.meeting) || meeting });
        } catch (e) {
          store.set({ cancelling: false, actionError: e.message });
        }
      },
      async exportMeeting() {
        const s = store.get();
        const id = s.detailId;
        if (!id || s.exportState === "working") return;
        const filename = `roundtable-${id}.md`;
        store.set({
          exportState: "working",
          exportError: null,
          exportInfo: null,
          exportText: null,
          exportCopied: false,
        });
        let markdown;
        try {
          markdown = await fetchExport(id, s.workspaceId);
        } catch (e) {
          store.set({ exportState: "error", exportError: e.message });
          return;
        }
        // 1) The browser's own save dialog: a real file at a place the user
        //    picked, with no part played by the desktop download manager.
        const picked = await saveWithPicker(markdown, filename);
        if (picked === "cancelled") {
          store.set({ exportState: "cancelled", exportInfo: { filename, method: "cancelled" } });
          return;
        }
        if (picked) {
          store.set({
            exportState: "saved",
            exportInfo: { filename: picked.name, method: "picker" },
          });
          return;
        }
        // 2) Save inside the meeting's own workspace. This always produces a
        //    file, so the export cannot end in a dead button even when the
        //    shell routes page downloads nowhere.
        try {
          const data = await api("/meeting/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, workspace: s.workspaceId }),
          });
          store.set({
            exportState: "saved",
            exportInfo: {
              filename: (data && data.filename) || filename,
              path: data && data.path,
              bytes: data && data.bytes,
              method: "workspace",
            },
          });
          return;
        } catch (workspaceError) {
          // 3) Never lose the content: show it and keep the reason visible.
          store.set({
            exportState: "fallback",
            exportError: workspaceError.message,
            exportText: markdown,
            exportInfo: { filename },
          });
        }
      },
      closeExport() {
        store.set({
          exportState: "idle",
          exportError: null,
          exportInfo: null,
          exportText: null,
          exportCopied: false,
        });
      },
      async copyExport() {
        const s = store.get();
        const text = s.exportText;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          store.set({ exportCopied: true, exportError: null });
        } catch (e) {
          store.set({ exportError: `${T.exportFailed}：${(e && e.message) || ""}` });
        }
      },
      async copyExportPath() {
        const s = store.get();
        const path = s.exportInfo && s.exportInfo.path;
        if (!path) return;
        try {
          await navigator.clipboard.writeText(path);
          store.set({ exportCopied: true, exportError: null });
        } catch (e) {
          store.set({ exportError: `${T.exportFailed}：${(e && e.message) || ""}` });
        }
      },
    };

    // Debug/testing handle: lets tests (and curious developers) inspect or
    // drive the page store without touching the React tree.
    window.__dshRoundtable = { store, actions };

    const styles = {
      page: {
        // The host gives the main slot a flex column whose own box is
        // `overflow: hidden` and has no scroller (see ui-layout's
        // `.centerCol`), so the page itself must be the scroll container.
        // `height: 100%` bounds it to the slot; `minHeight: 0` defeats the
        // flex item's automatic minimum size (without it the box grows to
        // its content, the parent clips the excess and nothing scrolls);
        // `overflowY: auto` turns wheel/trackpad input into scrollTop.
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        overflowY: "auto",
        overflowX: "hidden",
        overscrollBehavior: "contain",
        boxSizing: "border-box",
        padding: "20px 16px 64px",
        color: C.text,
        fontSize: "14px",
        lineHeight: 1.6,
      },
      inner: { maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" },
      header: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" },
      title: { fontSize: "20px", fontWeight: "600", margin: 0, color: C.text },
      subtitle: { color: C.text3, fontSize: C.fontSize2 },
      spacer: { flex: "1 1 auto" },
      card: {
        background: C.layer1,
        border: `1px solid ${C.border}`,
        borderRadius: C.radiusLg,
        padding: "16px",
      },
      cardTitle: { fontSize: "14px", fontWeight: "600", margin: "0 0 8px", color: C.text },
      caption: { color: C.text3, fontSize: C.fontSize2 },
      exportText: {
        width: "100%",
        boxSizing: "border-box",
        minHeight: "180px",
        resize: "vertical",
        padding: "10px 12px",
        borderRadius: "8px",
        border: `1px solid ${C.border}`,
        background: C.surface2,
        color: C.text,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: C.fontSize2,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
      },
      errorText: { color: C.error, fontSize: C.fontSize2 },
      button: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        borderRadius: C.radius,
        border: `1px solid ${C.border}`,
        background: C.layer1,
        color: C.text,
        padding: "6px 12px",
        fontSize: "13px",
        cursor: "pointer",
      },
      primaryButton: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        borderRadius: C.radius,
        border: "1px solid transparent",
        background: C.brand,
        color: "#fff",
        padding: "8px 16px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
      },
      disabledOverlay: { opacity: 0.5, cursor: "default" },
      textarea: {
        width: "100%",
        boxSizing: "border-box",
        minHeight: "72px",
        resize: "vertical",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: C.radius,
        padding: "10px 12px",
        color: C.text,
        fontSize: "14px",
        lineHeight: 1.6,
      },
      select: {
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: C.radius,
        color: C.text,
        padding: "5px 8px",
        fontSize: "13px",
        maxWidth: "100%",
      },
      modelRow: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 8px",
        borderRadius: C.radius,
        cursor: "pointer",
      },
      checkbox: {
        width: "16px",
        height: "16px",
        minWidth: "16px",
        borderRadius: "4px",
        border: `1px solid ${C.border2}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        lineHeight: 1,
      },
      providerGroup: { marginTop: "8px" },
      providerHeader: { color: C.text2, fontSize: C.fontSize2, fontWeight: "600", margin: "10px 0 2px" },
      chip: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        borderRadius: "999px",
        border: `1px solid ${C.border2}`,
        padding: "2px 9px",
        fontSize: "12px",
        whiteSpace: "nowrap",
      },
      dot: { width: "8px", height: "8px", minWidth: "8px", borderRadius: "999px", display: "inline-block" },
      banner: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
        border: `1px solid ${C.business}`,
        borderRadius: C.radiusLg,
        padding: "10px 14px",
        color: C.text,
        background: C.layer1,
      },
      collapseHeader: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        background: "transparent",
        border: "none",
        padding: "6px 2px",
        cursor: "pointer",
        color: C.text2,
        fontSize: "13px",
        fontWeight: "600",
        textAlign: "left",
      },
      entryRow: {
        border: `1px solid ${C.border}`,
        borderRadius: C.radius,
        marginBottom: "8px",
        background: C.bg,
        overflow: "hidden",
      },
      entryHeader: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "9px 12px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: C.text,
        fontSize: "13px",
        textAlign: "left",
      },
      entryBody: { padding: "4px 12px 12px", borderTop: `1px solid ${C.border}` },
      stageHeader: { display: "flex", alignItems: "baseline", gap: "8px", margin: "18px 0 8px" },
      stageTitle: { fontSize: "13px", fontWeight: "700", color: C.text2, letterSpacing: "0.02em" },
      historyRow: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${C.border}`,
        padding: "12px 4px",
        cursor: "pointer",
        color: C.text,
      },
      rowMain: { flex: "1 1 260px", minWidth: 0 },
      ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      memberStrip: { display: "flex", flexWrap: "wrap", gap: "8px" },
      attachmentRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 0",
        borderBottom: `1px solid ${C.border2}`,
      },
    };

    function Chip({ tone, children }) {
      return h(
        "span",
        { style: { ...styles.chip, color: tone, borderColor: tone } },
        h("span", { style: { ...styles.dot, background: tone } }),
        children,
      );
    }

    function Btn({ onClick, disabled, kind, children, testid, title }) {
      const base = kind === "primary" ? styles.primaryButton : styles.button;
      const style = disabled ? { ...base, ...styles.disabledOverlay } : base;
      return h(
        "button",
        { style, onClick: disabled ? undefined : onClick, disabled: !!disabled, "data-roundtable-button": testid || "", title: title || "" },
        children,
      );
    }

    function Icon({ component, size }) {
      if (!component) return null;
      return h(component, { size: size || 16 });
    }

    function ErrorNote({ title, message, onRetry }) {
      return h(
        "div",
        {
          style: {
            border: `1px solid ${C.error}`,
            borderRadius: C.radiusLg,
            padding: "12px 14px",
            background: C.layer1,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          },
        },
        h(Icon, { component: IconWarning }),
        h("span", { style: styles.errorText }, title),
        message ? h("span", { style: styles.caption }, message) : null,
        onRetry ? h(Btn, { onClick: onRetry, testid: "retry" }, T.retry) : null,
      );
    }

    function LoadingRow({ text }) {
      return h("div", { style: { ...styles.caption, padding: "10px 2px" } }, text || T.loading);
    }

    function Collapse({ label, open, onToggle, children, testid }) {
      return h(
        "div",
        null,
        h(
          "button",
          { style: styles.collapseHeader, onClick: onToggle, "data-roundtable-collapse": testid || "" },
          h(Icon, { component: IconChevronDown }),
          h("span", null, label),
          h("span", { style: { color: C.text3, fontWeight: 400 } }, open ? "" : "…"),
        ),
        open ? children : null,
      );
    }

    function CheckboxRow({ checked, label, caption, onToggle, testid }) {
      return h(
        "div",
        { style: styles.modelRow, onClick: onToggle, "data-roundtable-model": testid || "" },
        h(
          "span",
          {
            style: {
              ...styles.checkbox,
              background: checked ? C.brand : "transparent",
              borderColor: checked ? C.brand : C.border2,
              color: "#fff",
            },
          },
          checked ? "✓" : "",
        ),
        h("span", { style: { flex: "1 1 auto", minWidth: 0 } },
          h("div", { style: { ...styles.ellipsis } }, label),
          caption ? h("div", { style: styles.caption }, caption) : null,
        ),
      );
    }

    function WorkspacePicker({ s }) {
      if (!s.workspaces || s.workspaces.length < 2) {
        const current = s.workspaces[0];
        return h(
          "div",
          { style: styles.caption, "data-roundtable-workspace": current ? current.id : "" },
          `${T.workspaceLabel}：${current ? current.title || current.id : "—"}`,
        );
      }
      return h(
        "label",
        { style: { display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
        h("span", { style: styles.caption }, T.workspaceLabel),
        h(
          "select",
          { style: styles.select, value: s.workspaceId || "", onChange: (e) => actions.selectWorkspace(e.target.value), "data-roundtable-workspace": s.workspaceId || "" },
          s.workspaces.map((w) => h("option", { key: w.id, value: w.id }, w.title || w.id)),
        ),
      );
    }

    function groupedModels(models) {
      const groups = [];
      const index = new Map();
      for (const model of models) {
        const provider = String(model.provider || "");
        if (!index.has(provider)) {
          const group = { provider, providerName: provider, models: [] };
          index.set(provider, group);
          groups.push(group);
        }
        const group = index.get(provider);
        if (group.models.length === 0 && model.providerName) group.providerName = model.providerName;
        group.models.push(model);
      }
      return groups;
    }

    function modelLabel(model) {
      return model.label || model.model || model.key;
    }

    function ModelPicker({ models, selected, onToggle, testPrefix }) {
      if (!models.length) return h("div", { style: styles.caption }, zh ? "目录为空" : "Catalog is empty");
      return h(
        "div",
        null,
        groupedModels(models).map((group) =>
          h(
            "div",
            { key: group.provider, style: styles.providerGroup },
            h("div", { style: styles.providerHeader }, group.providerName),
            group.models.map((model) =>
              h(CheckboxRow, {
                key: model.key,
                checked: selected.indexOf(model.key) >= 0,
                label: modelLabel(model),
                caption: model.key,
                onToggle: () => onToggle(model.key),
                testid: `${testPrefix}:${model.key}`,
              }),
            ),
          ),
        ),
      );
    }

    function StartValidity({ s }) {
      const answerers = s.selected.length;
      const topicOk = String(s.topic || "").trim().length > 0;
      const modelsOk = answerers >= 2;
      return { topicOk, modelsOk, ready: topicOk && modelsOk };
    }

    function SetupView({ s }) {
      const validity = StartValidity({ s });
      const live = s.meetings.filter((m) => isLiveStatus(m.status));
      const hasImages = s.attachments.some((item) => item.kind === "image");
      const textOnlySelected = hasImages
        ? s.selected
            .filter((key) => s.capabilities && s.capabilities[key] === false)
            .map((key) => {
              const model = modelByKey(key);
              return model ? modelLabel(model) : key;
            })
        : [];
      const recent = s.meetings.slice(0, 5);
      return h(
        "div",
        { "data-roundtable-view": "setup", style: { display: "flex", flexDirection: "column", gap: "16px" } },
        h(WorkspacePicker, { s }),
        live.length > 0
          ? h(
              "div",
              { style: styles.banner, "data-roundtable-live-banner": "1" },
              h("span", { style: { color: C.business, fontWeight: 600 } }, T.liveBanner),
              h("span", { style: styles.caption }, live[0].topic),
              h("span", { style: styles.spacer }),
              h(Btn, { onClick: () => actions.openDetail(live[0].id), testid: "resume" }, T.resume),
            )
          : null,
        h(
          "div",
          { style: styles.card },
          h("div", { style: styles.cardTitle }, T.topicLabel),
          h("textarea", {
            style: styles.textarea,
            value: s.topic,
            placeholder: T.topicPlaceholder,
            onChange: (e) => actions.setTopic(e.target.value),
            "data-roundtable-topic": "1",
          }),
        ),
        h(
          "div",
          { style: styles.card, "data-roundtable-attachments": "1" },
          h(
            "div",
            { style: { display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" } },
            h("div", { style: styles.cardTitle }, T.attachmentsLabel),
            h("span", { style: styles.caption }, T.attachmentsHint),
          ),
          s.attachments.length === 0
            ? h("div", { style: { ...styles.caption, marginTop: "6px" } }, T.attachmentsEmpty)
            : h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" } },
                s.attachments.map((item) =>
                  h(
                    "div",
                    { key: item.id, style: styles.attachmentRow, "data-roundtable-attachment": item.id },
                    h(Chip, { tone: item.kind === "image" ? C.business : C.text3 }, item.kind === "image" ? T.attachmentKindImage : T.attachmentKindText),
                    h("span", { style: { ...styles.caption, ...styles.ellipsis, flex: 1 } }, item.name),
                    h("span", { style: styles.caption }, formatSize(item.bytes)),
                    h(Btn, { onClick: () => actions.removeAttachment(item.id), testid: `remove-attachment:${item.id}` }, T.attachmentRemove),
                  ),
                ),
              ),
          textOnlySelected.length > 0
            ? h(
                "div",
                { style: { ...styles.caption, color: C.warn, marginTop: "8px" }, "data-roundtable-capability-warning": "1" },
                T.attachmentImageSkipped(textOnlySelected.join("、")),
              )
            : null,
          s.uploadError ? h("div", { style: { ...styles.errorText, marginTop: "8px" }, "data-roundtable-upload-error": "1" }, s.uploadError) : null,
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" } },
            h(
              "label",
              {
                style: { ...styles.button, cursor: s.uploading ? "default" : "pointer", opacity: s.uploading ? 0.6 : 1 },
                "data-roundtable-add-file": "1",
              },
              s.uploading ? T.attachmentsUploading : T.attachmentsAdd,
              h("input", {
                type: "file",
                multiple: true,
                style: { display: "none" },
                disabled: s.uploading,
                onChange: (e) => {
                  const picked = e.target.files;
                  e.target.value = "";
                  if (picked && picked.length > 0) actions.addAttachments(picked);
                },
              }),
            ),
          ),
        ),
        h(
          "div",
          { style: styles.card },
          h(
            "div",
            { style: { display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" } },
            h("div", { style: styles.cardTitle }, T.rosterLabel),
            h("span", { style: styles.caption }, validity.modelsOk ? T.selectedCount(s.selected.length, (s.catalogLimits && s.catalogLimits.maxAnswerers) || 8) : T.needModels),
          ),
          s.catalog === "loading"
            ? h(LoadingRow, { text: T.catalogLoading })
            : s.catalog === "error"
              ? h(ErrorNote, { title: T.catalogFailed, message: s.catalogError, onRetry: () => actions.loadCatalog() })
              : h(ModelPicker, { models: s.models, selected: s.selected, onToggle: (key) => actions.toggleModel(key), testPrefix: "answerer" }),
          s.catalogFailures.length > 0
            ? h(
                "div",
                { style: { ...styles.caption, color: C.warn, marginTop: "10px" } },
                `${T.catalogFailures}：` +
                  s.catalogFailures.map((f) => `${f.label || f.provider || "?"} — ${f.message || ""}`).join("；"),
              )
            : null,
        ),
        h(
          "div",
          { style: styles.card },
          h(Collapse, { label: T.advanced, open: s.showSettings, onToggle: () => actions.toggleSettings(), testid: "settings" },
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "14px", paddingTop: "6px" } },
              h(
                "div",
                null,
                h("div", { style: { ...styles.caption, marginBottom: "6px" } }, zh ? "评审方式" : "Review mode"),
                h(
                  "div",
                  { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
                  h(Btn, { onClick: () => actions.setReviewersMode("peers"), testid: "reviewers-peers", kind: s.reviewersMode === "peers" ? "default" : "default", title: "" }, (s.reviewersMode === "peers" ? "● " : "○ ") + T.reviewersPeers),
                  h(Btn, { onClick: () => actions.setReviewersMode("custom"), testid: "reviewers-custom" }, (s.reviewersMode === "custom" ? "● " : "○ ") + T.reviewersCustom),
                ),
                s.reviewersMode === "custom"
                  ? h(
                      "div",
                      { style: { marginTop: "8px" } },
                      h("div", { style: { ...styles.caption, margin: "4px 0" } }, T.reviewersHint),
                      h(ModelPicker, { models: s.models, selected: s.reviewerSelected, onToggle: (key) => actions.toggleReviewer(key), testPrefix: "reviewer" }),
                    )
                  : null,
              ),
              h(
                "div",
                { style: { display: "flex", gap: "14px", flexWrap: "wrap" } },
                h(
                  "label",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("span", { style: styles.caption }, T.arbiterLabel),
                  h(
                    "select",
                    { style: styles.select, value: s.arbiterKey, onChange: (e) => actions.setArbiterKey(e.target.value), "data-roundtable-arbiter": "1" },
                    h("option", { value: "" }, T.arbiterAuto),
                    s.models.map((model) => h("option", { key: model.key, value: model.key }, modelLabel(model))),
                  ),
                ),
                h(
                  "label",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("span", { style: styles.caption }, T.roundsLabel),
                  h(
                    "select",
                    { style: styles.select, value: String(effectiveRounds(s)), onChange: (e) => actions.setRounds(e.target.value), "data-roundtable-rounds": "1" },
                    Array.from({ length: ((s.catalogLimits && s.catalogLimits.maxRounds) || 5) + 1 }, (_, i) =>
                      h("option", { key: i, value: String(i) }, i === 0 ? T.roundsNone : String(i)),
                    ),
                  ),
                ),
                h(
                  "label",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("span", { style: styles.caption }, T.languageLabel),
                  h(
                    "select",
                    { style: styles.select, value: s.language, onChange: (e) => actions.setLanguage(e.target.value), "data-roundtable-language": "1" },
                    h("option", { value: "" }, T.languageAuto),
                    h("option", { value: "zh" }, "中文"),
                    h("option", { value: "en" }, "English"),
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
          h(
            Btn,
            {
              onClick: () => actions.startMeeting(),
              disabled: !validity.ready || s.starting,
              kind: "primary",
              testid: "start",
            },
            h(Icon, { component: IconSend }),
            s.starting ? T.starting : T.start,
          ),
          !validity.topicOk ? h("span", { style: styles.caption }, T.needTopic) : null,
          validity.topicOk && !validity.modelsOk ? h("span", { style: styles.caption }, T.needModels) : null,
          s.actionError ? h("span", { style: styles.errorText, "data-roundtable-action-error": "1" }, s.actionError) : null,
        ),
        s.meetingsState === "ready" && recent.length > 0
          ? h(
              "div",
              { style: styles.card },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "10px" } },
                h("div", { style: styles.cardTitle }, T.recent),
                h("span", { style: styles.spacer }),
                h(Btn, { onClick: () => actions.openHistory(), testid: "view-all" }, T.viewAll),
              ),
              recent.map((meeting) =>
                h(
                  "button",
                  { key: meeting.id, style: styles.historyRow, onClick: () => actions.openDetail(meeting.id), "data-roundtable-history-item": meeting.id },
                  h("span", { style: { ...styles.rowMain, ...styles.ellipsis } }, meeting.topic),
                  h(Chip, { tone: statusTone(meeting.status) }, statusLabel(meeting.status)),
                  h("span", { style: styles.caption }, formatTime(meeting.updatedAt || meeting.createdAt)),
                ),
              ),
            )
          : null,
      );
    }

    function TranscriptGroups(meeting) {
      const transcript = Array.isArray(meeting.transcript) ? meeting.transcript : [];
      const groups = [];
      for (const entry of transcript) {
        if (!entry || typeof entry !== "object") continue;
        const round = entry.round === undefined || entry.round === null ? null : entry.round;
        const key = `${entry.stage || ""}|${round === null ? "" : round}`;
        const last = groups[groups.length - 1];
        if (!last || last.key !== key) {
          groups.push({ key, stage: entry.stage, round, label: stageText(entry.stage, entry.stageLabel), entries: [] });
        }
        groups[groups.length - 1].entries.push(entry);
      }
      return groups;
    }

    function entryState(entry) {
      if (entry.error) return { tone: C.error, label: zh ? "失败" : "failed" };
      if (typeof entry.text === "string" && entry.text.length > 0) return { tone: C.success, label: zh ? "完成" : "done" };
      return { tone: C.business, label: zh ? "进行中" : "running" };
    }

    function TranscriptEntry({ entry }) {
      const s = store.get();
      const open = !!s.expanded[entry.seq];
      const state = entryState(entry);
      const hasBody = (typeof entry.text === "string" && entry.text.length > 0) || !!entry.error;
      return h(
        "div",
        { style: styles.entryRow, "data-roundtable-entry": String(entry.seq) },
        h(
          "button",
          {
            style: styles.entryHeader,
            onClick: () => hasBody && actions.toggleExpanded(entry.seq),
            "data-roundtable-entry-toggle": String(entry.seq),
          },
          h("span", { style: { ...styles.dot, background: state.tone } }),
          h("span", { style: { flex: "1 1 auto", minWidth: 0, ...styles.ellipsis } }, entry.title || entry.actorKey || roleLabel(entry.role) || "—"),
          h("span", { style: styles.caption }, roleLabel(entry.role)),
          roundText(entry.round) ? h("span", { style: styles.caption }, roundText(entry.round)) : null,
          h("span", { style: styles.caption }, formatTime(entry.at)),
          h("span", { style: { color: state.tone, fontSize: "12px", minWidth: "34px", textAlign: "right" } }, state.label),
          hasBody ? h(Icon, { component: IconChevronDown }) : null,
        ),
        open
          ? h(
              "div",
              { style: styles.entryBody },
              entry.error
                ? h("div", { style: { color: C.error, fontSize: C.fontSize2, whiteSpace: "pre-wrap", padding: "8px 0" } }, String(entry.error))
                : null,
              typeof entry.text === "string" && entry.text.length > 0
                ? h("div", { style: { padding: "8px 0" } }, h(MarkdownText, { text: entry.text, labels: MD_LABELS }))
                : null,
            )
          : null,
      );
    }

    function roundText(round) {
      return round === undefined || round === null || round === "" ? "" : `${zh ? "第" : "R"}${round}${zh ? "轮" : ""}`;
    }

    function formatRank(value, index) {
      return typeof value === "number" && isFinite(value) ? String(Math.round(value * 10) / 10) : String(index + 1);
    }

    function FinalDecisionCard({ meeting }) {
      const s = store.get();
      const final = meeting.finalAnswer;
      if (!final || typeof final !== "object") return null;
      const text = typeof final.text === "string" ? final.text : "";
      const ranking = Array.isArray(final.ranking) ? final.ranking : [];
      const arbiter = final.arbiter && typeof final.arbiter.text === "string" ? final.arbiter : null;
      if (!text && !arbiter && ranking.length === 0) return null;
      return h(
        "div",
        {
          style: {
            border: `1px solid ${C.brand}`,
            borderRadius: C.radiusLg,
            padding: "16px",
            background: C.layer1,
          },
          "data-roundtable-final": "1",
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" } },
          h("span", { style: { fontWeight: "700", color: C.brand } }, T.decision),
          final.authorLabel || final.authorKey
            ? h("span", { style: styles.caption }, final.authorLabel || final.authorKey)
            : null,
          final.fallback ? h("span", { style: { ...styles.caption, color: C.warn }, "data-roundtable-fallback": "1" }, T.fallbackBadge) : null,
        ),
        text
          ? h("div", null, h(MarkdownText, { text, labels: MD_LABELS }))
          : h("div", { style: styles.caption }, T.decisionMissing),
        arbiter
          ? h(
              "div",
              { style: { marginTop: "10px" } },
              h(Collapse, { label: T.arbiterNote, open: s.showArbiterNote, onToggle: () => actions.toggleArbiterNote(), testid: "arbiter-note" },
                h("div", { style: { padding: "6px 0" } }, h(MarkdownText, { text: arbiter.text, labels: MD_LABELS })),
              ),
            )
          : null,
        ranking.length > 0
          ? h(
              "div",
              { style: { marginTop: "10px" } },
              h(Collapse, { label: T.ranking, open: s.showRanking, onToggle: () => actions.toggleRanking(), testid: "ranking" },
                h(
                  "div",
                  { style: { padding: "6px 0", display: "flex", flexDirection: "column", gap: "4px" } },
                  ranking.map((row, index) =>
                    h(
                      "div",
                      { key: row.answerId || index, style: { display: "flex", gap: "8px", alignItems: "baseline" } },
                      h("span", { style: { color: C.text2, fontWeight: "600", minWidth: "28px" } }, `#${formatRank(row.averageRank, index)}`),
                      h("span", null, row.answerId || "—"),
                      row.votes !== undefined && row.votes !== null ? h("span", { style: styles.caption }, `${row.votes} ${T.votes}`) : null,
                    ),
                  ),
                ),
              ),
            )
          : null,
      );
    }

    function MemberStrip({ meeting }) {
      const progress = meeting.progress;
      const members = progress && Array.isArray(progress.members) ? progress.members : [];
      if (members.length === 0) return null;
      return h(
        "div",
        { style: styles.card },
        h("div", { style: styles.cardTitle }, T.members),
        h(
          "div",
          { style: styles.memberStrip },
          members.map((member, index) => {
            const meta = memberStatusMeta(member.status);
            return h(
              "span",
              { key: member.key || index, style: styles.chip, "data-roundtable-member": member.key || String(index) },
              h("span", { style: { ...styles.dot, background: meta.tone } }),
              h("span", null, member.label || member.key || "—"),
              h("span", { style: styles.caption }, `${roleLabel(member.role)} · ${meta.label}`),
            );
          }),
        ),
      );
    }

    function ReviewSummary({ meeting }) {
      const reviews = Array.isArray(meeting.reviews) ? meeting.reviews : [];
      if (reviews.length === 0) return null;
      const s = store.get();
      return h(
        "div",
        { style: styles.card, "data-roundtable-reviews": "1" },
        h(Collapse, { label: T.reviewSummary, open: s.showReviews, onToggle: () => actions.toggleReviews(), testid: "review-summary" },
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "10px", paddingTop: "4px" } },
            reviews.map((review, index) =>
              h(
                "div",
                { key: review.reviewerKey || index },
                h("div", { style: { ...styles.caption, fontWeight: "600" } }, review.reviewerLabel || T.reviewerN(index + 1)),
                review.selfReview ? h("div", { style: styles.caption }, zh ? "含自评" : "includes self-review") : null,
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                  (Array.isArray(review.ranking) ? review.ranking : []).map((row, rowIndex) =>
                    h(
                      "div",
                      { key: row.answerId || rowIndex, style: { display: "flex", gap: "8px", alignItems: "baseline" } },
                      h("span", { style: { color: C.text2, minWidth: "28px" } }, `#${formatRank(row.averageRank, rowIndex)}`),
                      h("span", null, row.answerId || "—"),
                      row.votes !== undefined && row.votes !== null ? h("span", { style: styles.caption }, `${row.votes} ${T.votes}`) : null,
                    ),
                  ),
                ),
                review.note ? h("div", { style: { ...styles.caption, whiteSpace: "pre-wrap" } }, String(review.note)) : null,
                review.error ? h("div", { style: { color: C.error, fontSize: C.fontSize2 } }, String(review.error)) : null,
              ),
            ),
          ),
        ),
      );
    }

    function FailureList({ meeting }) {
      const failures = Array.isArray(meeting.failures) ? meeting.failures : [];
      if (failures.length === 0) return null;
      return h(
        "div",
        { style: styles.card, "data-roundtable-failures": "1" },
        h("div", { style: { ...styles.cardTitle, color: C.error } }, T.failures),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px" } },
          failures.map((failure, index) =>
            h(
              "div",
              { key: index, style: { fontSize: C.fontSize2, color: C.error, whiteSpace: "pre-wrap" } },
              [
                failure.stage ? `[${stageText(failure.stage)}] ` : "",
                failure.entry && failure.entry.label ? failure.entry.label + " " : "",
                failure.entry && failure.entry.provider ? `(${failure.entry.provider}/${failure.entry.model || ""}) ` : "",
                failure.message || "",
              ].join(""),
            ),
          ),
        ),
      );
    }

    /**
     * Export feedback: the button used to be a fire-and-forget anchor, so a
     * failed export looked identical to a working one. Every outcome is now
     * visible, and the Markdown itself is shown when no file could be written.
     */
    function ExportStatus({ s }) {
      const state = s.exportState;
      if (!state || state === "idle") return null;
      const info = s.exportInfo || {};
      const rows = [];
      if (state === "working") {
        rows.push(h("div", { style: styles.caption, "data-roundtable-export-state": "working" }, T.exportWorking));
      } else if (state === "cancelled") {
        rows.push(h("div", { style: styles.caption, "data-roundtable-export-state": "cancelled" }, T.exportCancelled));
      } else if (state === "saved") {
        const text = info.method === "workspace" && info.path
          ? T.exportSavedPath(info.path)
          : T.exportSavedTo(info.filename || "");
        const suffix = typeof info.bytes === "number" ? T.exportBytes(info.bytes) : "";
        rows.push(
          h(
            "div",
            {
              style: { ...styles.caption, color: C.success, wordBreak: "break-all" },
              "data-roundtable-export-state": "saved",
              "data-roundtable-export-method": info.method || "",
              "data-roundtable-export-path": info.path || info.filename || "",
            },
            `${text}${suffix}`,
          ),
        );
        const buttons = [];
        if (info.method === "workspace" && info.path) {
          buttons.push(h(Btn, { onClick: () => actions.copyExportPath(), testid: "export-copy-path" }, s.exportCopied ? T.copied : T.copyPath));
        }
        buttons.push(h(Btn, { onClick: () => actions.closeExport(), testid: "export-close" }, T.close));
        rows.push(h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, buttons));
      }
      if (state === "error" || state === "fallback") {
        rows.push(
          h(
            "div",
            { style: styles.errorText, "data-roundtable-export-error": "1" },
            `${T.exportFailed}：${s.exportError || ""}`,
          ),
        );
      }
      if (state === "fallback" && s.exportText) {
        rows.push(h("div", { style: styles.caption }, T.exportFallbackHint));
        rows.push(
          h("textarea", {
            readOnly: true,
            value: s.exportText,
            rows: 12,
            style: styles.exportText,
            "data-roundtable-export-text": "1",
          }),
        );
        rows.push(
          h(
            "div",
            { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
            h(Btn, { onClick: () => actions.copyExport(), testid: "export-copy" }, s.exportCopied ? T.copied : T.copyMd),
            h(Btn, { onClick: () => actions.closeExport(), testid: "export-close" }, T.close),
          ),
        );
      }
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" } },
        ...rows,
      );
    }

    // ------------------------------------------------------------------
    // Long-table stage
    //
    // The meeting page renders the discussion as a long-table Live2D stage:
    // one chair per answerer, the speaker leaning in, and a bubble holding
    // that member's answer. Two constraints shape the code below.
    //
    // 1. The page column is 760px wide, so the stage is authored in those
    //    same 760×430 design units and scaled as a whole when the window is
    //    narrower. Everything inside can then use plain pixel sizes and stay
    //    readable instead of shrinking the name plates into noise.
    // 2. A browser has no static URL for plugin assets, so the runtime and
    //    the model arrive through the exact routes in `lib/stage.js`. They are
    //    injected once per session and reused by every later render.
    // ------------------------------------------------------------------

    const STAGE_W = 760;
    // The frame is not a fixed 760x430: the character height is bound by the
    // width of one seat, so an eight-seat table used to leave half the card
    // empty above the heads. Height now follows the seat count instead.
    const STAGE_H_MAX = 440;
    const STAGE_H_MIN = 280;
    const STAGE_TOP_PAD_RATIO = 0.66; // headroom above the heads, for bubbles
    const STAGE_TOP_PAD_MIN = 122; // enough for a four-line bubble plus its tail
    const STAGE_PLATE_GAP = 39; // foot line -> table edge (name plates sit here)
    const STAGE_TABLE_RATIO = 0.88; // table band height / character height
    const STAGE_CHAR_ASPECT = 0.85; // measured: visible silhouette width / character height
    const STAGE_MARGIN = 22;
    const STAGE_BUBBLE_CHARS = 80;
    const STAGE_BUBBLE_MAX = 5; // lines of bubble text before the ellipsis
    const STAGE_BUBBLE_COMPACT = 4; // the short frame cannot hold five lines
    const STAGE_PLATE_WIDE_STEP = 130; // below this, plates drop the "· provider" suffix
    const STAGE_HUES = ["#4da3ff", "#7d6bff", "#ff9d4d", "#3ddc97", "#ff6b8a", "#5ad2e6", "#c084fc", "#f5c542"];
    const STAGE_BASE = `${API_BASE}/stage`;
    const STAGE_MODEL_URL = `${STAGE_BASE}/model/model3.json`;
    const STAGE_ART = { table: `${STAGE_BASE}/art/table.png`, chair: `${STAGE_BASE}/art/chair.png` };
    const STAGE_SCRIPTS = [
      `${STAGE_BASE}/vendor/live2dcubismcore.min.js`,
      `${STAGE_BASE}/vendor/pixi.min.js`,
      `${STAGE_BASE}/vendor/cubism4.min.js`,
    ];
    // The shipped idle motion is "take out a phone"; the roundtable does not
    // want it, so its parts stay hidden and its parameters stay at zero.
    const STAGE_PHONE_PARTS = ["Part106", "Part6", "Part107"];
    const STAGE_PHONE_PARAMS = ["phone", "phone2", "phone3", "phone4", "phone5", "phone6", "phone7", "phone8"];
    // A member with its own rig gets its own descriptor; every other seat keeps
    // the whale-girl. The client cannot know which rigs the plugin registered
    // (the artefacts are local build output, not shipped), so a character URL
    // that fails to load simply falls back to the whale-girl for that seat.
    // The tuning numbers are the ones the art preview settled on: 1.72 brings her
    // head up to the half-body models' size, the 138 px drop lands her crown on
    // their crown, and `cut` clips the full-body rig at the seat baseline so her
    // legs do not hang out under the table (see stageClipUnderTable).
    const STAGE_CHARACTERS = {
      claude: {
        url: `${STAGE_BASE}/char/claude/model3.json`,
        // 1.70 with dy 120 puts her waist exactly on the table's far edge
        // (tableTop = baseY - 39): the table hides the skirt, so the seat reads
        // as "seated at the table" rather than "standing in front of it", and
        // the visible head and chest end up the same size as the half-body rigs.
        scale: 1.7,
        dx: 0,
        dy: 120,
        mouth: true,
        cut: true,
        // The same character with a codex in her arms. A seat that has been
        // listening for a while swaps to it and puts it down to speak, so she
        // reads along instead of standing with her hands at her sides.
        book: `${STAGE_BASE}/char/claude-book/model3.json`,
      },
      // GPT's rig is a half-body sheet whose face sits left of the body centre
      // line, hence the horizontal nudge; `scale 0.85` is its preview value.
      gpt: { url: `${STAGE_BASE}/char/gpt/model3.json`, scale: 0.85, dx: 111, dy: -25, mouth: true },
    };
    const STAGE_DEFAULT_CHARACTER = { key: "whale-girl", url: STAGE_MODEL_URL, scale: 1, dx: 0, dy: 0, mouth: false };

    function stageCharacterFor(seat) {
      const hint = `${(seat && seat.key) || ""} ${(seat && seat.label) || ""}`.toLowerCase();
      for (const key of Object.keys(STAGE_CHARACTERS)) {
        if (hint.includes(key)) return { key, ...STAGE_CHARACTERS[key] };
      }
      return STAGE_DEFAULT_CHARACTER;
    }

    let stageRuntime = null;

    function stageLoadScript(src) {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-roundtable-stage-script="${src}"]`);
        if (existing) {
          if (existing.dataset.roundtableStageLoaded === "1") resolve();
          else {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error(src)), { once: true });
          }
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.dataset.roundtableStageScript = src;
        script.addEventListener("load", () => {
          script.dataset.roundtableStageLoaded = "1";
          resolve();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error(`stage script failed: ${src}`)), { once: true });
        document.head.appendChild(script);
      });
    }

    /** Load PIXI + Cubism once; concurrent callers share one promise. */
    function ensureStageRuntime() {
      if (stageRuntime) return stageRuntime;
      stageRuntime = (async () => {
        for (const src of STAGE_SCRIPTS) await stageLoadScript(src);
        const runtime = window.PIXI;
        if (!runtime || !runtime.live2d || typeof runtime.live2d.Live2DModel !== "function") {
          throw new Error("Live2D runtime unavailable");
        }
        return runtime;
      })().catch((error) => {
        stageRuntime = null;
        throw error;
      });
      return stageRuntime;
    }

    /**
     * Seat geometry for `count` answerers.
     *
     * Chairs are laid out on a fixed pitch and then shrunk by a gap budget, so
     * eight seats read as eight chairs instead of one dark plank — the same
     * rule the standalone preview page learned the hard way.
     *
     * Past four seats the row is width-bound, so neighbours are allowed to
     * touch hair and shoulders (never faces) and the frame shrinks to whatever
     * those chairs actually need. That keeps people ~1.1x the table band tall
     * at any seat count, which is what stops one big desk from dwarfing them.
     */
    function stageLayout(count) {
      const seats = Math.max(1, count);
      const usable = STAGE_W - STAGE_MARGIN * 2;
      const step = usable / seats;
      const gapChair = Math.round(Math.max(4, Math.min(26, step * 0.13)));
      const gapChar = Math.round(Math.max(2, Math.min(14, step * 0.06)));
      const overlap = seats >= 6 ? 0.24 : seats >= 5 ? 0.12 : 0;
      const widthBudget = step - gapChar + step * overlap;
      const heightCap = 200 - seats * 6;
      const charH = Math.round(Math.max(96, Math.min(widthBudget / STAGE_CHAR_ASPECT, heightCap)));
      const topPad = Math.max(Math.round(charH * STAGE_TOP_PAD_RATIO), STAGE_TOP_PAD_MIN);
      const baseY = topPad + charH;
      const tableTop = baseY - STAGE_PLATE_GAP;
      const tableH = Math.round(charH * STAGE_TABLE_RATIO);
      const stageH = Math.round(Math.max(STAGE_H_MIN, Math.min(STAGE_H_MAX, tableTop + tableH)));
      const xs = [];
      for (let index = 0; index < seats; index += 1) xs.push(STAGE_MARGIN + step * (index + 0.5));
      const chairW = Math.round(Math.min((charH * 1.15 * 2) / 3, step - gapChair));
      const chairH = Math.round(chairW * 1.5);
      return {
        count: seats,
        step,
        xs,
        charH,
        chairW,
        chairH,
        topPad,
        baseY,
        tableTop,
        tableH,
        stageH,
        bubbleLines: seats >= 6 ? STAGE_BUBBLE_COMPACT : STAGE_BUBBLE_MAX,
        wideBubble: seats >= 6,
      };
    }

    /** First plain-text sentence of a Markdown answer, cut to the bubble budget. */
    function stageSummary(text, limit) {
      if (typeof text !== "string") return "";
      const flat = text
        .replace(/\r/g, "")
        .replace(/```[\s\S]*?```/g, " ")
        .split("\n")
        .map((line) => line.trim().replace(/^[#>\-*+\d.\s]+/, "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/[*_`~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (flat.length <= limit) return flat;
      return `${flat.slice(0, limit).replace(/[\s，、,;；:：]+$/, "")}…`;
    }

    /**
     * Map a meeting onto seats.
     *
     * Seats are the answerers (reviewers and the arbiter sit at the table but
     * do not speak here). Each seat takes the newest answer text it produced
     * and is marked `speaking` while its latest transcript entry is still
     * empty — the same "no text and no error means in flight" rule the
     * transcript list uses.
     */
    /**
     * Name plates are as narrow as one seat (`step - 12`), so at 7–8 seats
     * "model · provider" would be chopped mid-word. Drop the provider suffix
     * once there is not enough room; the full label stays in the tooltip.
     */
    function stagePlateText(label, step) {
      const full = String(label == null ? "" : label);
      if (step >= STAGE_PLATE_WIDE_STEP) return full;
      const head = full.split("·")[0].trim();
      return head || full;
    }

    function stageSeats(meeting) {
      const progress = meeting && meeting.progress;
      const members = progress && Array.isArray(progress.members) ? progress.members : [];
      const answerers = members.filter((member) => !member || !member.role || member.role === "answerer").slice(0, 8);
      const seats = answerers.map((member, index) => ({
        key: String((member && member.key) != null ? member.key : index),
        label: String((member && (member.label || member.key)) || `#${index + 1}`),
        hue: STAGE_HUES[index % STAGE_HUES.length],
        status: member && member.status,
        text: "",
        speaking: false,
      }));
      const byKey = new Map(seats.map((seat) => [seat.key, seat]));
      const transcript = meeting && Array.isArray(meeting.transcript) ? meeting.transcript : [];
      for (const entry of transcript) {
        if (!entry || entry.role !== "answerer") continue;
        const seat = byKey.get(String(entry.actorKey));
        if (!seat) continue;
        if (typeof entry.text === "string" && entry.text.trim()) {
          seat.text = entry.text;
          seat.speaking = false;
        } else if (!entry.error) {
          seat.speaking = true;
        }
      }
      for (const seat of seats) seat.text = stageSummary(seat.text, STAGE_BUBBLE_CHARS);
      return seats;
    }

    /** Hide the phone pose and stop the bundled motions before we drive parameters. */
    function stageDropPhonePose(model) {
      try {
        model.internalModel.motionManager.stopAllMotions();
      } catch (error) {
        // A model without motions is fine.
      }
      try {
        const core = model.internalModel.coreModel;
        for (const id of STAGE_PHONE_PARTS) {
          try {
            core.setPartOpacityById(id, 0);
          } catch (error) {
            // Part names differ across models; missing ones are ignored.
          }
        }
        for (const id of STAGE_PHONE_PARAMS) {
          try {
            core.setParameterValueById(id, 0);
          } catch (error) {
            // Same here.
          }
        }
        core.update();
      } catch (error) {
        // Nothing to hide.
      }
    }

    function stageWobble() {
      return {
        bobPeriod: 3000 + Math.random() * 2200,
        bobAmp: 1.1 + Math.random() * 1.3,
        swayPeriod: 4200 + Math.random() * 3200,
        swayAmp: 0.7 + Math.random() * 1.1,
        turnPeriod: 5200 + Math.random() * 4800,
        turnAmp: 2.2 + Math.random() * 4.0,
        phase: Math.random() * Math.PI * 2,
        // One-shot idle acting, scheduled per seat (see `stageGesture`).
        gesture: null,
        nextGesture: 2500 + Math.random() * 5500,
      };
    }

    /**
     * Idle acting: short one-shot offsets layered on top of the wobble.
     *
     * Only turn/nod/lean are animated, because those are the three parameters a
     * whale-girl rig and a member rig both expose. Every curve is multiplied by
     * the same sin(pi*u) envelope, so a gesture starts and ends at zero and the
     * seat never snaps back to its idle pose.
     */
    const STAGE_GESTURES = [
      { id: "nod", dur: 1250, f: (u) => ({ nod: -17 * Math.sin(Math.PI * u), lean: 1.5 * Math.sin(Math.PI * u) }) },
      { id: "tilt", dur: 1400, f: (u) => ({ turn: 12 * Math.sin(Math.PI * u), nod: 3 * Math.sin(Math.PI * u) }) },
      { id: "think", dur: 1900, f: (u) => ({ turn: 8 * Math.sin(Math.PI * u), nod: -6 * Math.sin(Math.PI * u), hair: 0.3 * Math.sin(Math.PI * u), mform: Math.sin(Math.PI * u) }) },
      { id: "lean", dur: 1600, f: (u) => ({ lean: 10 * Math.sin(Math.PI * u) }) },
      {
        id: "shake",
        dur: 1000,
        // Two swings over 1 s (~2 Hz) instead of four over 0.9 s (4.4 Hz), and a
        // little less amplitude: at 4.4 Hz the side locks crossed the face between
        // frames and read as two misaligned layers. The hair term trails the turn
        // by a quarter cycle so the mass follows through rather than swapping
        // sides -- this rig has no hair physics to do it for us.
        f: (u) => {
          const env = Math.sin(Math.PI * u);
          const swing = Math.sin(Math.PI * 2 * u);
          const lag = Math.cos(Math.PI * 2 * u);
          return { turn: 8 * swing * env, hair: -0.10 * lag * env };
        },
      },
    ];

    function stageGesture(wobble, elapsed) {
      if (!wobble.gesture || elapsed - wobble.gesture.start > wobble.gesture.dur) {
        wobble.gesture = null;
        if (elapsed >= wobble.nextGesture) {
          const pick = STAGE_GESTURES[Math.floor(Math.random() * STAGE_GESTURES.length)];
          wobble.gesture = { gesture: pick, start: elapsed, dur: pick.dur };
          wobble.nextGesture = elapsed + pick.dur + 7000 + Math.random() * 9000;
        }
      }
      if (!wobble.gesture) return null;
      return wobble.gesture.gesture.f((elapsed - wobble.gesture.start) / wobble.gesture.dur);
    }

    /**
     * One animation frame for every seat.
     *
     * Idle uses per-seat random periods so the table breathes out of sync; the
     * speaker gets one shared motion driven by global time, which is what makes
     * a roundtable read as a single conversation instead of eight loops.
     */
    function stageFrame(models, wobbles, elapsed, activeIndex, baseY) {
      for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        if (!model) continue;
        const wobble = wobbles[index];
        const speaking = index === activeIndex;
        // Rigs that came with their own dropped-in baseline (see
        // `STAGE_CHARACTERS`) carry their own vertical offset and may have a
        // real lip-sync parameter; the whale-girl has neither.
        const character = model.__stageCharacter || STAGE_DEFAULT_CHARACTER;
        const seatY = baseY + (character.dy || 0);
        // Book variant: a seat that keeps listening quietly for a few seconds
        // swaps to the rig that has a codex in her arms, and puts it down as
        // soon as it starts speaking. Both rigs are the same character at the
        // same canvas scale, so the swap only needs the parameter values and
        // the transform copied across.
        const book = model.__stageBook;
        let bookReady = 0;
        if (book) {
          if (speaking) {
            book.idleSince = null;
          } else if (book.idleSince === null || book.idleSince === undefined) {
            book.idleSince = elapsed;
          }
          const idleFor = book.idleSince === null ? 0 : elapsed - book.idleSince;
          if (idleFor > 9000 && !book.started) {
            book.started = true;
            if (model.__stageLoadBook) model.__stageLoadBook();
          }
          const want = idleFor > 9000 && book.model ? 1 : 0;
          book.blend += (want - book.blend) * 0.06;
          bookReady = Math.max(0, Math.min(1, (book.blend - 0.35) / 0.3));
        }
        let nod;
        let lean;
        let turn;
        let breath;
        let mouth = 0;
        // Front hair is driven by hand: the rig's PhysicsHairFront is disabled
        // because its single mesh holds both bangs and side locks, and the soft
        // threshold dragged the bangs over the eyes (see tune_physics.PHYSICS).
        // Two incommensurate sines, phase-shifted per seat, so the row never
        // swings in unison.
        let hair = 0.085 * Math.sin(elapsed / 1500 + index * 1.7)
          + 0.035 * Math.sin(elapsed / 620 + index * 2.3);
        if (speaking) {
          const seconds = elapsed / 1000;
          // The syllable envelope is what the preview stage settled on: it is
          // the same curve that drives the mouth, so head and jaw agree.
          const sy = character.mouth
            ? Math.abs(Math.sin(seconds * 5.5) * 0.72 + Math.sin(seconds * 8.9) * 0.28)
            : 0;
          nod = 2.6 * Math.sin(seconds * 3.1) + 5.2 * (sy - 0.5);
          lean = 3.2 * Math.sin(seconds * 1.55) + 1.1 * (sy - 0.5);
          turn = 1.5 * Math.sin(seconds * 1.1);
          breath = 0.5 + 0.5 * Math.sin(seconds * 1.7);
          if (character.mouth) mouth = 0.1 + 0.9 * sy;
          model.y = seatY - 3;
          model.rotation = 0;
        } else {
          nod = 1.4 * Math.sin(elapsed / wobble.bobPeriod + wobble.phase * 0.7);
          lean = wobble.swayAmp * Math.sin(elapsed / wobble.swayPeriod + wobble.phase);
          turn = wobble.turnAmp * Math.sin(elapsed / wobble.turnPeriod + wobble.phase * 1.7);
          breath = 0.5 + 0.5 * Math.sin(elapsed / wobble.bobPeriod + wobble.phase);
          // Idle acting only runs here: the speaker's head belongs to the
          // syllable envelope, and a gesture on top of it would fight the mouth.
          const gesture = stageGesture(wobble, elapsed);
          let mouthForm = 0;
          if (gesture) {
            turn += gesture.turn || 0;
            nod += gesture.nod || 0;
            lean += gesture.lean || 0;
            // Hair follow-through: the rig has no hair physics (its physics
            // output parameter is bound to nothing), so a gesture that swings
            // the head fast would otherwise drag a rigid hair mass across the
            // face. `hair` lags the swing a quarter cycle to read as inertia.
            hair += gesture.hair || 0;
            // The smile is drawn into the closed-mouth part, so a thinking seat
            // would grin through the whole gesture; the rig carries a flat-mouth
            // overlay toggled by ParamMouthForm for exactly this.
            mouthForm = gesture.mform || 0;
          }
          // Turn toward whoever is speaking. The target is a direction, not an
          // angle: dividing by 0.32 of the stage width gives the furthest seat
          // the full 6 degrees, and per-frame smoothing keeps the head from
          // snapping when the speaker changes mid-sentence.
          let lookTarget = 0;
          if (activeIndex >= 0 && activeIndex !== index && models[activeIndex]) {
            lookTarget = Math.max(-1, Math.min(1, (models[activeIndex].x - model.x) / (STAGE_W * 0.32)));
          }
          wobble.look = (wobble.look || 0) * 0.93 + lookTarget * 0.07;
          turn += wobble.look * 6;
          model.y = seatY + Math.sin(elapsed / wobble.bobPeriod + wobble.phase) * wobble.bobAmp;
          model.rotation = Math.sin(elapsed / (wobble.swayPeriod * 0.8) + wobble.phase) * 0.003;
        }
        // Push the frame's pose into a rig. The whale-girl model only binds
        // head/body angles; the mouth parameter exists but drives nothing
        // visible, so it stays closed there.
        const applyPose = (target) => {
          try {
            const core = target.internalModel.coreModel;
            core.setParameterValueById("ParamAngleX", turn);
            core.setParameterValueById("ParamAngleY", nod);
            core.setParameterValueById("ParamBodyAngleZ", lean);
            try {
              core.setParameterValueById("ParamMouthOpenY", mouth);
            } catch (error) {
              // Not every model has it.
            }
            try {
              core.setParameterValueById("ParamMouthForm", Math.max(-1, Math.min(1, mouthForm)));
            } catch (error) {
              // Only the Claude rigs carry the flat-mouth overlay.
            }
            for (const id of STAGE_PHONE_PARAMS) {
              try {
                core.setParameterValueById(id, 0);
              } catch (error) {
                // Missing parameters are fine.
              }
            }
            try {
              core.setParameterValueById("ParamHairFront", Math.max(-1, Math.min(1, hair)));
            } catch (error) {
              // The whale-girl rig has no front-hair parameter.
            }
            try {
              core.setParameterValueById("ParamBreath", breath);
            } catch (error) {
              // Optional.
            }
            core.update();
          } catch (error) {
            // A single broken model must not stop the other seats.
          }
        };
        applyPose(model);
        // Fade-in multiplies whatever the book cross-fade wants, so a rig that is
        // still easing in does not jump to full opacity when it starts loading.
        model.alpha = model.__fade == null ? 1 - bookReady : model.__fade * (1 - bookReady);
        if (book && book.model) {
          book.model.position.set(model.x, model.y);
          book.model.scale.copyFrom(model.scale);
          book.model.rotation = model.rotation;
          book.model.alpha = bookReady;
          book.model.visible = bookReady > 0.002;
          applyPose(book.model);
        }
      }
    }

    /** The canvas layer: PIXI owns the canvas, React owns everything drawn on top. */
    function StageCanvas({ seats, activeIndex, selectedIndex, topic, onSelect }) {
      const hostRef = React.useRef(null);
      const stageRef = React.useRef(null);
      const engineRef = React.useRef(null);
      const liveRef = React.useRef({ activeIndex });
      liveRef.current = { activeIndex };
      const [scale, setScale] = React.useState(1);
      const [status, setStatus] = React.useState("loading");
      const layout = stageLayout(seats.length);
      const seatKeys = seats.map((seat) => seat.key).join("|");

      React.useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        const measure = () => {
          const width = host.clientWidth || STAGE_W;
          const next = Math.max(0.4, Math.min(1, width / STAGE_W));
          setScale((previous) => (Math.abs(previous - next) < 0.01 ? previous : next));
        };
        measure();
        if (typeof ResizeObserver === "undefined") {
          window.addEventListener("resize", measure);
          return () => window.removeEventListener("resize", measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(host);
        return () => observer.disconnect();
      }, []);

      React.useEffect(() => {
        let cancelled = false;
        const current = stageLayout(seats.length);
        const wobbles = seats.map(() => stageWobble());
        const models = [];
        let app = null;
        let ticker = null;
        setStatus("loading");
        (async () => {
          try {
            const PIXI = await ensureStageRuntime();
            if (cancelled) return;
            app = new PIXI.Application({
              width: STAGE_W,
              height: current.stageH,
              backgroundAlpha: 0,
              antialias: true,
              resolution: Math.min(2, window.devicePixelRatio || 1),
              autoDensity: true,
            });
            app.view.style.display = "block";
            app.view.style.width = `${STAGE_W}px`;
            app.view.style.height = `${current.stageH}px`;
            if (stageRef.current) {
              stageRef.current.innerHTML = "";
              stageRef.current.appendChild(app.view);
            }
            engineRef.current = { app, models };
            // Start ticking straight away: a member rig is a few megabytes of
            // texture, and waiting for the slowest seat to decode would leave the
            // stage empty. `stageFrame` already skips seats whose model is still
            // missing, so seats simply pop in as they arrive.
            const t0 = performance.now();
            ticker = () => stageFrame(models, wobbles, performance.now() - t0, liveRef.current.activeIndex, current.baseY);
            ticker();
            app.ticker.add(ticker);
            await Promise.all(
              seats.map(async (seat, index) => {
                const character = stageCharacterFor(seat);
                let model = null;
                try {
                  model = await PIXI.live2d.Live2DModel.from(character.url, { autoInteract: false, autoUpdate: true });
                } catch (error) {
                  // A rig that is not on disk (or whose textures failed) must not
                  // cost the seat its character: fall back to the whale-girl.
                  if (character.key !== STAGE_DEFAULT_CHARACTER.key) {
                    try {
                      model = await PIXI.live2d.Live2DModel.from(STAGE_MODEL_URL, { autoInteract: false, autoUpdate: true });
                    } catch (fallbackError) {
                      model = null;
                    }
                  }
                  if (!model) return;
                }
                if (cancelled) {
                  try {
                    model.destroy();
                  } catch (error) {
                    // Already gone.
                  }
                  return;
                }
                model.scale.set((current.charH * character.scale) / model.height);
                model.anchor.set(0.5, 1);
                // dx is a canvas-pixel offset of the face from the model centre
                // line, so it has to be scaled and negated; adding the raw value
                // drags the whole rig into the neighbouring seat.
                const faceDx = character.dx ? -character.dx * model.scale.x : 0;
                model.position.set(current.xs[index] + faceDx, current.baseY + (character.dy || 0));
                model.zIndex = index;
                model.__stageCharacter = character;
                app.stage.addChild(model);
                stageDropPhonePose(model);
                if (character.cut) {
                  // Full-body rigs stand behind a table that only occludes from
                  // the seat baseline down, so their legs would hang out under
                  // the table top. Clip at the baseline: just the upper body
                  // shows, the way the half-body rigs are drawn.
                  try {
                    const clip = new PIXI.Graphics();
                    clip.beginFill(0x000000);
                    clip.drawRect(-4000, -4000, 8000, 4000 + current.baseY);
                    clip.endFill();
                    app.stage.addChild(clip);
                    model.mask = clip;
                  } catch (error) {
                    // A mask failure must not cost the seat its character.
                  }
                }
                models[index] = model;
                if (character.book) {
                  const bookState = { url: character.book, model: null, blend: 0, started: false, idleSince: null };
                  model.__stageBook = bookState;
                  // Loaded only once a seat actually settles into listening:
                  // most seats talk before that, and the variant is another
                  // texture page nobody needs on first paint.
                  model.__stageLoadBook = async () => {
                    try {
                      const alt = await PIXI.live2d.Live2DModel.from(bookState.url, {
                        autoInteract: false,
                        autoUpdate: true,
                      });
                      if (cancelled) {
                        try {
                          alt.destroy();
                        } catch (error) {
                          // Already gone.
                        }
                        return;
                      }
                      alt.anchor.set(0.5, 1);
                      alt.zIndex = index;
                      alt.alpha = 0;
                      alt.visible = false;
                      if (character.cut) {
                        // Its own stencil: a mask object should not be shared
                        // between two display objects.
                        try {
                          const bookClip = new PIXI.Graphics();
                          bookClip.beginFill(0x000000);
                          bookClip.drawRect(-4000, -4000, 8000, 4000 + current.baseY);
                          bookClip.endFill();
                          app.stage.addChild(bookClip);
                          alt.mask = bookClip;
                        } catch (error) {
                          // A mask failure must not cost the seat its variant.
                        }
                      }
                      stageDropPhonePose(alt);
                      app.stage.addChild(alt);
                      bookState.model = alt;
                    } catch (error) {
                      // No book rig on disk: she keeps her hands free.
                    }
                  };
                }
              }),
            );
            if (cancelled) return;
            setStatus("ready");
          } catch (error) {
            if (cancelled) return;
            setStatus("failed");
          }
        })();
        return () => {
          cancelled = true;
          engineRef.current = null;
          try {
            if (app && ticker) app.ticker.remove(ticker);
          } catch (error) {
            // Ticker already stopped.
          }
          for (const model of models) {
            try {
              model.destroy();
            } catch (error) {
              // Already gone.
            }
          }
          try {
            if (app) app.destroy(true, { children: true, texture: true, baseTexture: true });
          } catch (error) {
            // Nothing left to release.
          }
          if (stageRef.current) stageRef.current.innerHTML = "";
        };
      }, [seatKeys, seats.length]);

      // Narrow seats get a wider bubble instead of a shorter one: it floats
      // above the row where horizontal room is free, and keeps four lines.
      const bubbleWidth = layout.wideBubble
        ? Math.round(Math.max(184, Math.min(236, layout.step * 2.2)))
        : Math.round(Math.min(206, Math.max(150, layout.step * 1.5)));
      const bubbleText = (seat) => {
        if (seat.text) return seat.text;
        return seat.speaking ? T.stageThinking : T.stageNoAnswer;
      };
      const visible = (seat, index) => index === selectedIndex || index === activeIndex;

      return h(
        "div",
        {
          ref: hostRef,
          style: {
            position: "relative",
            width: "100%",
            height: `${Math.round(layout.stageH * scale)}px`,
            overflow: "hidden",
            background: "#0a0d14",
            display: "flex",
            justifyContent: "center",
          },
          "data-roundtable-stage-frame": "1",
        },
        h(
          "div",
          {
            style: {
              position: "relative",
              flex: "0 0 auto",
              width: `${STAGE_W}px`,
              height: `${layout.stageH}px`,
              transformOrigin: "50% 0",
              transform: `scale(${scale})`,
              background: "radial-gradient(120% 90% at 50% 0%, #1a2333 0%, #121826 45%, #0a0d14 100%)",
              overflow: "hidden",
            },
          },
          seats.map((seat, index) =>
            h("img", {
              key: `chair-${seat.key}`,
              src: STAGE_ART.chair,
              alt: "",
              draggable: false,
              style: {
                position: "absolute",
                left: `${Math.round(layout.xs[index] - layout.chairW / 2)}px`,
                top: `${layout.baseY - Math.round(layout.chairH * 0.78)}px`,
                width: `${layout.chairW}px`,
                opacity: 0.92,
                filter: "brightness(0.58) saturate(0.75)",
                pointerEvents: "none",
              },
            }),
          ),
          h("div", { ref: stageRef, style: { position: "absolute", left: 0, top: 0, width: `${STAGE_W}px`, height: `${layout.stageH}px`, pointerEvents: "none" } }),
          h("div", {
            style: {
              position: "absolute",
              left: 0,
              top: `${layout.tableTop}px`,
              width: `${STAGE_W}px`,
              height: `${layout.tableH}px`,
              backgroundImage: `url("${STAGE_ART.table}")`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.5))",
              pointerEvents: "none",
            },
          }),
          h(
            "div",
            {
              style: {
                position: "absolute",
                left: "220px",
                top: `${layout.tableTop + Math.round(layout.tableH * 0.41)}px`,
                width: "320px",
                textAlign: "center",
                color: "#f3ead8",
                textShadow: "0 2px 10px rgba(0,0,0,0.65)",
                pointerEvents: "none",
              },
            },
            h("div", { style: { fontSize: "9px", letterSpacing: "0.32em", color: "#c9a86a", fontWeight: 600, marginBottom: "3px" } }, "TOPIC"),
            h(
              "div",
              {
                style: {
                  fontSize: "12.5px",
                  lineHeight: 1.55,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                },
              },
              String(topic || ""),
            ),
          ),
          seats.map((seat, index) =>
            h(
              "button",
              {
                key: `plate-${seat.key}`,
                type: "button",
                onClick: () => onSelect(seat.key),
                title: seat.label,
                "data-roundtable-seat": seat.key,
                style: {
                  position: "absolute",
                  left: `${Math.round(layout.xs[index])}px`,
                  top: `${layout.baseY - 35}px`,
                  transform: "translate(-50%, 0)",
                  maxWidth: `${Math.round(layout.step - 12)}px`,
                  boxSizing: "border-box",
                  padding: layout.step < STAGE_PLATE_WIDE_STEP ? "2px 6px" : "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(10,15,24,0.74)",
                  border: `1px solid ${index === activeIndex ? STAGE_HUES[index % 8] : "rgba(140,170,220,0.28)"}`,
                  color: index === activeIndex ? "#ffffff" : "#cfe0ff",
                  fontSize: layout.step < STAGE_PLATE_WIDE_STEP ? "9px" : "10.5px",
                  lineHeight: 1.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  zIndex: 7,
                },
              },
              layout.step < STAGE_PLATE_WIDE_STEP
                ? null
                : h("span", {
                    style: {
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: seat.hue,
                      flex: "0 0 auto",
                    },
                  }),
              h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, stagePlateText(seat.label, layout.step)),
            ),
          ),
          seats.map((seat, index) => {
            if (!visible(seat, index)) return null;
            const left = Math.max(bubbleWidth / 2 + 6, Math.min(STAGE_W - bubbleWidth / 2 - 6, layout.xs[index]));
            return h(
              "div",
              {
                key: `bubble-${seat.key}`,
                "data-roundtable-bubble": seat.key,
                style: {
                  position: "absolute",
                  left: `${Math.round(left)}px`,
                  top: `${Math.max(4, layout.topPad - 22)}px`,
                  transform: "translate(-50%, -100%)",
                  width: `${bubbleWidth}px`,
                  padding: "7px 9px",
                  borderRadius: "12px",
                  background: "linear-gradient(180deg, rgba(247,250,255,0.97), rgba(227,236,250,0.97))",
                  color: "#182233",
                  fontSize: layout.wideBubble ? "10.5px" : "11.5px",
                  lineHeight: layout.wideBubble ? 1.45 : 1.5,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
                  zIndex: 8,
                  pointerEvents: "none",
                },
              },
              h("div", { style: { fontSize: "9.5px", letterSpacing: "0.05em", color: "#5b6f92", marginBottom: "2px" } }, seat.label),
              h(
                "div",
                {
                  style: {
                    display: "-webkit-box",
                    WebkitLineClamp: layout.bubbleLines,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  },
                },
                bubbleText(seat),
              ),
              h("div", {
                style: {
                  position: "absolute",
                  left: "50%",
                  bottom: "-6px",
                  marginLeft: "-6px",
                  width: "12px",
                  height: "12px",
                  background: "rgba(232,239,251,0.97)",
                  transform: "rotate(45deg)",
                  borderRadius: "2px",
                },
              }),
            );
          }),
          status === "loading"
            ? h(
                "div",
                {
                  style: {
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8fa3c4",
                    fontSize: "12px",
                    letterSpacing: "0.05em",
                  },
                },
                T.stageLoading,
              )
            : null,
          status === "failed"
            ? h(
                "div",
                {
                  style: {
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8fa3c4",
                    fontSize: "12px",
                    textAlign: "center",
                    padding: "0 24px",
                  },
                  "data-roundtable-stage-error": "1",
                },
                T.stageFailed,
              )
            : null,
        ),
      );
    }

    /** Card wrapper: the stage plus its one-line legend. */
    function StageCard({ meeting }) {
      const live = isLiveStatus(meeting.status);
      const seats = stageSeats(meeting);
      const [selected, setSelected] = React.useState(null);
      if (seats.length === 0) return null;
      const activeIndex = live ? seats.findIndex((seat) => seat.speaking) : -1;
      const selectedIndex = selected === null ? -1 : seats.findIndex((seat) => seat.key === selected);
      return h(
        "div",
        { style: { ...styles.card, padding: 0, overflow: "hidden" }, "data-roundtable-stage-card": "1" },
        h(StageCanvas, {
          seats,
          activeIndex,
          selectedIndex,
          topic: meeting.topic,
          onSelect: (key) => setSelected((previous) => (previous === key ? null : key)),
        }),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderTop: `1px solid ${C.border}`, background: C.layer1 } },
          h("span", { style: { ...styles.caption, flex: "1 1 auto", ...styles.ellipsis } }, T.stageHint),
          h(Chip, { tone: live ? C.success : C.text3 }, live ? T.runningBadge : statusLabel(meeting.status)),
        ),
      );
    }

    function DetailView({ s }) {
      if (s.detailState === "loading" && !s.meeting) {
        return h("div", { "data-roundtable-view": "detail" }, h(LoadingRow, null));
      }
      if (s.detailState === "error" && !s.meeting) {
        return h(
          "div",
          { "data-roundtable-view": "detail" },
          h(ErrorNote, { title: T.detailFailed, message: s.detailError, onRetry: () => actions.refreshMeeting() }),
        );
      }
      const meeting = s.meeting;
      if (!meeting) return h("div", { "data-roundtable-view": "detail" }, h(LoadingRow, null));
      const live = isLiveStatus(meeting.status);
      const groups = TranscriptGroups(meeting);
      const duration = formatDuration(meeting.startedAt || meeting.createdAt, meeting.endedAt);
      return h(
        "div",
        { "data-roundtable-view": "detail", style: { display: "flex", flexDirection: "column", gap: "16px" } },
        h(
          "div",
          { style: styles.card },
          h("h2", { style: { ...styles.title, fontSize: "17px", margin: "0 0 8px" } }, meeting.topic),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
            h("span", { "data-roundtable-status": meeting.status }, h(Chip, { tone: statusTone(meeting.status) }, statusLabel(meeting.status))),
            meeting.stage ? h("span", { style: styles.chip, "data-roundtable-stage": meeting.stage }, stageText(meeting.stage, meeting.stageLabel)) : null,
            meeting.currentRound && meeting.rounds ? h("span", { style: styles.caption }, T.round(meeting.currentRound, meeting.rounds)) : null,
            meeting.createdAt ? h("span", { style: styles.caption }, formatTime(meeting.createdAt)) : null,
            duration ? h("span", { style: styles.caption }, `${T.duration} ${duration}`) : null,
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" } },
            live ? h(Btn, { onClick: () => actions.cancelMeeting(), disabled: s.cancelling, testid: "cancel" }, h(Icon, { component: IconStop }), s.cancelling ? T.cancelling : T.cancel) : null,
            h(Btn, { onClick: () => actions.exportMeeting(), testid: "export" }, h(Icon, { component: IconDownload }), T.exportMd),
            h(Btn, { onClick: () => actions.refreshMeeting(), testid: "refresh" }, h(Icon, { component: IconRefresh }), T.refresh),
          ),
          s.pollError ? h("div", { style: { ...styles.caption, color: C.warn, marginTop: "8px" }, "data-roundtable-poll-error": "1" }, `${T.pollError}：${s.pollError}`) : null,
          s.actionError ? h("div", { style: { ...styles.errorText, marginTop: "8px" }, "data-roundtable-action-error": "1" }, s.actionError) : null,
          h(ExportStatus, { s }),
        ),
        h(StageCard, { meeting }),
        Array.isArray(meeting.attachments) && meeting.attachments.length > 0
          ? h(
              "div",
              { style: styles.card, "data-roundtable-meeting-attachments": "1" },
              h("div", { style: styles.cardTitle }, T.attachmentsLabel),
              meeting.attachments.map((item) =>
                h(
                  "div",
                  { key: item.id, style: styles.attachmentRow },
                  h(Chip, { tone: item.kind === "image" ? C.business : C.text3 }, item.kind === "image" ? T.attachmentKindImage : T.attachmentKindText),
                  h("span", { style: { ...styles.caption, ...styles.ellipsis, flex: 1 } }, item.name),
                  h("span", { style: styles.caption }, formatSize(item.bytes)),
                ),
              ),
            )
          : null,
        h(FinalDecisionCard, { meeting }),
        h(MemberStrip, { meeting }),
        groups.length === 0
          ? h("div", { style: { ...styles.caption, padding: "8px 2px" } }, T.noTranscript)
          : groups.map((group) =>
              h(
                "div",
                { key: group.key },
                h(
                  "div",
                  { style: styles.stageHeader },
                  h("span", { style: styles.stageTitle, "data-roundtable-stage-title": group.stage }, group.label),
                  group.round !== null ? h("span", { style: styles.caption }, roundText(group.round)) : null,
                  h("span", { style: styles.caption }, `${group.entries.length}`),
                ),
                group.entries.map((entry) => h(TranscriptEntry, { key: entry.seq, entry })),
              ),
            ),
        h(ReviewSummary, { meeting }),
        h(FailureList, { meeting }),
        Array.isArray(meeting.limitations) && meeting.limitations.length > 0
          ? h("div", { style: styles.card }, h("div", { style: styles.cardTitle }, T.limitations), meeting.limitations.map((line, index) => h("div", { key: index, style: styles.caption }, String(line))))
          : null,
        Array.isArray(meeting.notes) && meeting.notes.length > 0
          ? h("div", { style: styles.card }, h("div", { style: styles.cardTitle }, T.notes), meeting.notes.map((line, index) => h("div", { key: index, style: styles.caption }, String(line))))
          : null,
      );
    }

    function HistoryView({ s }) {
      return h(
        "div",
        { "data-roundtable-view": "history", style: { display: "flex", flexDirection: "column", gap: "16px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px" } },
          h("div", { style: styles.cardTitle }, T.navHistory),
          h("span", { style: styles.spacer }),
          h(Btn, { onClick: () => actions.loadMeetings(), testid: "history-refresh" }, h(Icon, { component: IconRefresh }), T.refresh),
        ),
        s.meetingsState === "loading"
          ? h(LoadingRow, null)
          : s.meetingsState === "error"
            ? h(ErrorNote, { title: T.meetingsFailed, message: s.meetingsError, onRetry: () => actions.loadMeetings() })
            : s.meetings.length === 0
              ? h(
                  "div",
                  { style: { ...styles.card, textAlign: "center", padding: "40px 16px" }, "data-roundtable-empty": "1" },
                  h("div", { style: { fontWeight: "600", marginBottom: "6px" } }, T.empty),
                  h("div", { style: styles.caption, marginBottom: "14px" }, T.emptyHint),
                  h(Btn, { onClick: () => actions.backToSetup(), kind: "primary", testid: "empty-start" }, T.navNew),
                )
              : h(
                  "div",
                  { style: { ...styles.card, padding: "4px 16px" } },
                  s.meetings.map((meeting) =>
                    h(
                      "button",
                      { key: meeting.id, style: styles.historyRow, onClick: () => actions.openDetail(meeting.id), "data-roundtable-history-item": meeting.id },
                      h(
                        "span",
                        { style: styles.rowMain },
                        h("div", { style: styles.ellipsis }, meeting.topic),
                        h("div", { style: styles.caption }, [stageText(meeting.stage), meeting.rounds != null ? roundText(meeting.rounds) : "", formatTime(meeting.updatedAt || meeting.createdAt)].filter(Boolean).join(" · ")),
                        meeting.finalPreview ? h("div", { style: { ...styles.caption, ...styles.ellipsis } }, meeting.finalPreview) : null,
                      ),
                      h(Chip, { tone: statusTone(meeting.status) }, statusLabel(meeting.status)),
                    ),
                  ),
                ),
      );
    }

    function PageHeader({ s }) {
      const isDetail = s.view === "detail";
      return h(
        "div",
        { style: styles.header },
        isDetail
          ? h(Btn, { onClick: () => actions.backToSetup(), testid: "back" }, h(Icon, { component: IconChevronLeft }), T.back)
          : null,
        h(
          "div",
          null,
          h("h1", { style: styles.title }, T.panel),
          h("div", { style: styles.subtitle }, T.panelSubtitle),
        ),
        h("span", { style: styles.spacer }),
        isDetail
          ? null
          : h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(Btn, { onClick: () => actions.backToSetup(), testid: "nav-new", kind: s.view === "setup" ? "default" : "default" }, T.navNew),
              h(Btn, { onClick: () => actions.openHistory(), testid: "nav-history" }, T.navHistory),
            ),
      );
    }

    function WorkbenchPage() {
      const s = useStore();
      React.useEffect(() => {
        actions.initPage();
      }, []);
      let body;
      if (s.boot === "loading") {
        body = h(LoadingRow, null);
      } else if (s.boot === "error") {
        body = h(ErrorNote, { title: zh ? "工作区信息加载失败" : "Failed to load workspace", message: s.bootError, onRetry: () => actions.initPage() });
      } else if (s.view === "detail") {
        body = h(DetailView, { s });
      } else if (s.view === "history") {
        body = h(HistoryView, { s });
      } else {
        body = h(SetupView, { s });
      }
      return h(
        "div",
        { style: styles.page, "data-roundtable-page": "workbench" },
        h("div", { style: styles.inner }, h(PageHeader, { s }), body),
      );
    }

    function PanelIcon(props) {
      const size = props && typeof props.size === "number" ? props.size : 20;
      if (IconUsers) return h(IconUsers, { size });
      return h("span", { style: { width: size, height: size, display: "inline-block" } });
    }

    const subtle = {
      color: "var(--dsw-alias-label-tertiary)",
      fontSize: "var(--dsh-content-font-size-secondary, 13px)",
      lineHeight: "calc(18px + var(--dsh-content-font-delta-secondary, 0px))",
      padding: "2px 0",
      whiteSpace: "pre-wrap",
    };

    function RoundtableView({ node }) {
      const outcome = node && node.outcome;
      if (outcome === null || outcome === undefined) {
        return h("div", { style: subtle, "data-roundtable-state": "running" }, zh ? "圆桌讨论进行中…" : "Roundtable in progress…");
      }
      const text = typeof outcome.text === "string" ? outcome.text : "";
      if (outcome.kind === "error") {
        return h(
          "div",
          {
            style: { ...subtle, color: "var(--dsw-alias-state-error-primary)" },
            "data-roundtable-state": "error",
          },
          text.trim() === "" ? (zh ? "圆桌讨论失败" : "Roundtable failed") : text,
        );
      }
      if (text.trim() === "") {
        return h("div", { style: subtle, "data-roundtable-state": "empty" }, zh ? "圆桌讨论已完成。" : "Roundtable finished.");
      }
      return h(
        "div",
        { style: { margin: "2px 0" }, "data-roundtable-state": "done" },
        h(MarkdownText, { text, labels: MD_LABELS }),
      );
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("conversation.chat.commandview", () =>
          ctx.slots.register(
            {
              name: "conversation.chat.commandview",
              key: "roundtable",
              id: "dsh-simroundtable",
            },
            RoundtableView,
          ),
        );
        ctx.slots.inject("sidebar.panellist", () =>
          ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: "roundtable",
              order: 20,
              label: () => T.panel,
            },
            PanelIcon,
          ),
        );
        ctx.slots.inject("main", () =>
          ctx.slots.register(
            {
              name: "main",
              key: "roundtable",
            },
            WorkbenchPage,
          ),
        );
      },
    };
  },
});
