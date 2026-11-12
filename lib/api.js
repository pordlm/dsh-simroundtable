// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The page API: authenticated exact Fetch routes under `/api/roundtable`.
 *
 * The Web client owns the roundtable page; this module is the only host
 * surface it talks to. It deliberately uses Connection's exact Fetch routes
 * (cookie-authenticated, owner-only) instead of dynamic path segments, so the
 * meeting id and workspace travel as query parameters or JSON fields.
 *
 * Every response uses one envelope:
 *   success → `{ ok: true, data: ... }`
 *   failure → `{ ok: false, error: { code, message } }`
 */

import {
  buildDirectory,
  meetingSummary,
  render,
} from "./core.js";
import {
  AttachmentError,
  attachmentLimits,
  pruneUploadsThrottled,
  removeUploads,
  resolveImageSupport,
  storeUploads,
  uploadBodyLimit,
} from "./attachments.js";
import { MeetingError, resolveWorkspace } from "./meetings.js";
import { personaBindingOf } from "./personas/schema.js";
import { registerStageRoutes } from "./stage.js";

/** Base path of the page API. */
export const API_BASE = "/api/roundtable";
const MAX_BODY = 1_000_000;

/** One persona as the page may see it: frozen cards, no internal fields. */
function publicPersona(persona) {
  return {
    id: persona.id,
    version: persona.version,
    name: persona.name,
    summary: persona.summary,
    lens: persona.lens,
    mission: persona.mission,
    domain: persona.domain,
    priorities: persona.priorities,
    builtin: persona.builtin === true,
  };
}

/**
 * Derive a persona id from a display name.
 *
 * Names are free text (and often Chinese), so the slug is an id-only concern:
 * non-ASCII characters simply drop out, and a name that produces nothing usable
 * falls back to a `persona` prefix. Collisions get a short suffix so saving two
 * cards with the same name never silently overwrites the first.
 */
function derivePersonaId(name, store) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32);
  const base = slug.length >= 2 ? slug : "persona";
  const taken = new Set(store.list().map((persona) => persona.id));
  if (!taken.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function ok(data) {
  return json({ ok: true, data });
}

function fail(status, code, message) {
  return json({ ok: false, error: { code, message } }, status);
}

function queryOf(request) {
  try {
    return new URL(request.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function stringParam(params, name) {
  const value = params.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Read a JSON body while refusing oversized or malformed payloads. */
async function readJson(request, copy, limit = MAX_BODY) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    throw new MeetingError("body-too-large", copy.bodyTooLarge, 413);
  }
  let text;
  try {
    text = await request.text();
  } catch {
    throw new MeetingError("invalid-body", copy.invalidJsonBody, 400);
  }
  if (text.length > limit) throw new MeetingError("body-too-large", copy.bodyTooLarge, 413);
  if (text.trim() === "") return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new MeetingError("invalid-body", copy.invalidJsonBody, 400);
  }
}

function errorResponse(error, copy) {
  if (error instanceof MeetingError) return fail(error.status, error.code, error.message);
  if (error instanceof AttachmentError) return fail(error.status, error.code, error.message);
  return fail(500, "internal-error", render(copy.apiUnavailable, { message: String(error?.message ?? error) }));
}

/** Build every handler once; each closes over the plugin context and manager. */
function handlers({ ctx, config, manager, copyFor, resolveLocale }) {
  const copy = () => copyFor(resolveLocale());

  return {
    async workspaces() {
      const current = copy();
      let workspaces = [];
      try {
        const registry = ctx.get?.("workspaceRegistry");
        const list = registry?.list?.();
        if (Array.isArray(list)) {
          workspaces = list.map((workspace) => ({
            id: String(workspace.id),
            path: workspace.path,
            title: workspace.title,
          }));
        }
      } catch (error) {
        return fail(503, "workspace-list-failed", render(current.workspaceListFailed, { message: String(error?.message ?? error) }));
      }
      const data = { workspaces };
      // The page selects workspaces by id (its `<option value>` is `w.id`), so
      // the default has to be an id too; `resolveWorkspace` maps it back to the
      // directory whenever the id comes back in a request.
      if (workspaces.length > 0) data.defaultWorkspace = workspaces[0].id;
      return ok(data);
    },

    async catalog(request) {
      const current = copy();
      const signal = request.signal;
      const directory = await buildDirectory(ctx.llm, {
        signal,
        timeoutMs: config.catalogTimeoutMs,
        copy: current,
      });
      return ok({
        models: directory.models.map((entry) => ({
          key: entry.key,
          provider: entry.provider,
          providerName: entry.providerName,
          model: entry.model,
          modelName: entry.modelName,
          label: entry.label,
        })),
        failures: directory.failures.map((failure) => ({
          label: failure.label,
          provider: failure.provider,
          message: failure.message,
        })),
        defaults: {
          rounds: 1,
          maxAnswerChars: config.maxAnswerChars,
          language: config.language,
        },
        limits: {
          maxAnswerers: 8,
          maxReviewers: 8,
          maxRounds: config.maxRounds,
          maxConcurrentMeetings: config.maxConcurrentMeetings,
        },
        attachments: attachmentLimits(config),
      });
    },

    async listMeetings(request) {
      const current = copy();
      const params = queryOf(request);
      const workspace = resolveWorkspace(ctx, stringParam(params, "workspace"), current).path;
      // The page loads this list on open: a cheap, throttled moment to drop
      // uploads an abandoned tab left behind.
      pruneUploadsThrottled({ workspace, config });
      const rawLimit = Number(stringParam(params, "limit") ?? "");
      const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
      return ok(manager.list(workspace, limit));
    },

    async createMeeting(request) {
      const current = copy();
      const body = await readJson(request, current);
      const meeting = await manager.create(body);
      return json({ ok: true, data: { meeting } }, 202);
    },

    /**
     * Admit a batch of topic files. The create call adopts the returned ids, so
     * a failed start never leaves attachment directories inside a meeting.
     */
    async uploadAttachments(request) {
      const current = copy();
      const body = await readJson(request, current, uploadBodyLimit(config));
      const workspace = resolveWorkspace(ctx, typeof body.workspace === "string" ? body.workspace : undefined, current).path;
      const files = Array.isArray(body.files) ? body.files : undefined;
      if (files === undefined) {
        throw new MeetingError("attachment-missing", current.attachmentMissing, 400);
      }
      const stored = await storeUploads({ ctx, workspace, files, copy: current, config });
      return json({ ok: true, data: stored }, 201);
    },

    /** Take back a pending upload before the meeting is started. */
    async removeUploadedAttachments(request) {
      const current = copy();
      const body = await readJson(request, current);
      const workspace = resolveWorkspace(ctx, typeof body.workspace === "string" ? body.workspace : undefined, current).path;
      const ids = Array.isArray(body.ids) ? body.ids : [];
      return ok({ removed: removeUploads({ workspace, ids }) });
    },

    /** Image-input capability for one route, resolved against the live route. */
    async modelCapabilities(request) {
      const current = copy();
      const params = queryOf(request);
      const provider = stringParam(params, "provider");
      const model = stringParam(params, "model");
      if (provider === undefined || model === undefined) {
        throw new MeetingError("invalid-request", current.invalidRequest, 400);
      }
      const image = await resolveImageSupport(ctx.llm, { provider, model }, request.signal);
      return ok({ provider, model, image });
    },

    async getMeeting(request) {
      const current = copy();
      const params = queryOf(request);
      const id = stringParam(params, "id");
      if (id === undefined) throw new MeetingError("invalid-request", current.invalidRequest, 400);
      const workspace = resolveWorkspace(ctx, stringParam(params, "workspace"), current).path;
      const include = stringParam(params, "include");
      if (include === "summary") {
        return ok({ meeting: meetingSummary(manager.read(workspace, id, current)) });
      }
      return ok({ meeting: manager.detail(workspace, id) });
    },

    async cancelMeeting(request) {
      const current = copy();
      let body;
      try {
        body = await readJson(request, current);
      } catch (error) {
        if (!(error instanceof MeetingError) || error.code !== "invalid-body") throw error;
        body = {};
      }
      const params = queryOf(request);
      const id = (typeof body.id === "string" ? body.id.trim() : "") || stringParam(params, "id");
      if (id === undefined) throw new MeetingError("invalid-request", current.invalidRequest, 400);
      const wanted = (typeof body.workspace === "string" ? body.workspace : undefined)
        ?? stringParam(params, "workspace");
      const workspace = resolveWorkspace(ctx, wanted, current).path;
      return ok({ meeting: manager.cancel(workspace, id) });
    },

    async listPersonas(request) {
      const current = copy();
      const params = queryOf(request);
      const workspace = resolveWorkspace(ctx, stringParam(params, "workspace"), current).path;
      const store = manager.personasFor(workspace);
      return ok({
        binding: personaBindingOf(config),
        personas: store.list().map(publicPersona),
        limits: { maxCustom: 50, maxTotal: 64 },
      });
    },

    async savePersona(request) {
      const current = copy();
      const body = await readJson(request, current);
      const workspace = resolveWorkspace(ctx, typeof body.workspace === "string" ? body.workspace : undefined, current).path;
      if (personaBindingOf(config) !== "opt-in") {
        throw new MeetingError("persona-not-supported", current.personaNotSupported, 400);
      }
      const store = manager.personasFor(workspace);
      // A card created from the page only carries a name: derive a stable
      // lowercase slug here rather than making the browser invent ids.
      const input = body.persona ?? body;
      if (input !== null && typeof input === "object" && (typeof input.id !== "string" || input.id.trim() === "")) {
        input.id = derivePersonaId(input.name, store);
      }
      try {
        const persona = store.save(input);
        return json({ ok: true, data: { persona: publicPersona(persona) } }, 201);
      } catch (error) {
        if (typeof error?.code === "string" && error.code.startsWith("persona")) {
          throw new MeetingError(error.code, error.message ?? String(error), 400);
        }
        throw error;
      }
    },

    async exportMeeting(request) {
      const current = copy();
      const params = queryOf(request);
      let body = {};
      if (request.method === "POST") {
        try {
          body = await readJson(request, current);
        } catch (error) {
          if (!(error instanceof MeetingError) || error.code !== "invalid-body") throw error;
          body = {};
        }
      }
      const id = (typeof body.id === "string" ? body.id.trim() : "") || stringParam(params, "id");
      if (id === undefined) throw new MeetingError("invalid-request", current.invalidRequest, 400);
      const wanted = (typeof body.workspace === "string" ? body.workspace : undefined)
        ?? stringParam(params, "workspace");
      const workspace = resolveWorkspace(ctx, wanted, current).path;
      // POST saves the Markdown inside the workspace and reports the real path:
      // the desktop shell cannot be relied on to turn a page download into a
      // saved file, so the page falls back to this when its own save dialog is
      // unavailable.
      if (request.method === "POST") {
        return ok(manager.saveMarkdown(workspace, id));
      }
      const format = (stringParam(params, "format") ?? "md").toLowerCase();
      const markdown = manager.markdown(workspace, id);
      if (format === "json") {
        return ok({ markdown, meeting: manager.detail(workspace, id) });
      }
      return new Response(markdown, {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="roundtable-${id}.md"`,
          "cache-control": "no-store",
        },
      });
    },
  };
}

/**
 * Register every route on the Connection service.
 *
 * Returns an async disposer. When the connection service is absent (headless
 * composition, unit tests) registration is a no-op: the slash command and the
 * model tool keep working without the page.
 */
export function registerRoundtableApi(ctx, options) {
  // The service may be declared but not yet active in an odd composition; a
  // missing page API must never break the command or the model tool.
  let connection;
  try {
    connection = ctx.get?.("connection") ?? ctx.connection;
  } catch {
    connection = undefined;
  }
  if (connection?.fetch?.register === undefined) return () => {};
  const impl = handlers(options);
  // Connection keeps exactly one route per path and checks the method set, so
  // `GET` and `POST /meetings` share one registration with an internal split.
  const routes = [
    { path: `${API_BASE}/workspaces`, methods: ["GET"], handle: impl.workspaces },
    { path: `${API_BASE}/catalog`, methods: ["GET"], handle: impl.catalog },
    {
      path: `${API_BASE}/meetings`,
      methods: ["GET", "POST"],
      handle: (request) => (request.method === "POST" ? impl.createMeeting(request) : impl.listMeetings(request)),
    },
    { path: `${API_BASE}/meeting`, methods: ["GET"], handle: impl.getMeeting },
    { path: `${API_BASE}/upload`, methods: ["POST"], handle: impl.uploadAttachments },
    { path: `${API_BASE}/upload/remove`, methods: ["POST"], handle: impl.removeUploadedAttachments },
    { path: `${API_BASE}/capabilities`, methods: ["GET"], handle: impl.modelCapabilities },
    { path: `${API_BASE}/meeting/cancel`, methods: ["POST"], handle: impl.cancelMeeting },
    { path: `${API_BASE}/meeting/export`, methods: ["GET", "POST"], handle: impl.exportMeeting },
    {
      path: `${API_BASE}/personas`,
      methods: ["GET", "POST"],
      handle: (request) => (request.method === "POST" ? impl.savePersona(request) : impl.listPersonas(request)),
    },
  ];
  const disposers = [];
  for (const route of routes) {
    disposers.push(connection.fetch.register({
      path: route.path,
      methods: route.methods,
      requestBody: "buffered",
      fetch: async (request) => {
        const copy = options.copyFor(options.resolveLocale());
        try {
          return await route.handle(request);
        } catch (error) {
          return errorResponse(error, copy);
        }
      },
    }));
  }
  // The long-table stage needs its runtime and its model over the same
  // authenticated channel; `stage.js` owns those exact routes.
  try {
    disposers.push(registerStageRoutes(connection));
  } catch (error) {
    ctx.logger?.warn?.(`dsh-simroundtable: stage assets unavailable: ${error && error.message ? error.message : error}`);
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
