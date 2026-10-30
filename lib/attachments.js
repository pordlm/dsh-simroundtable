/**
 * Topic attachments: images for models that accept image input, and text-like
 * files (code, tables, documents) that are inlined into the prompt.
 *
 * Why this module exists
 * ----------------------
 * The roundtable children are spawned with a web-only tool allow-list, so a
 * child cannot open a file handle the way a normal agent would. A `file` content
 * part would therefore be dead weight. Instead:
 *
 *   - text-like uploads are decoded, bounded, and spliced into the prompt text;
 *   - images are stored through the host `attachments` service and travel as
 *     `image` content parts, and only to participants whose route advertises
 *     image input.
 *
 * Everything a meeting needs is kept under `<workspace>/.roundtable`:
 *
 *   uploads/<uploadId>/{manifest.json,payload}   before the meeting starts
 *   attachments/<meetingId>/<uploadId>/…          after it is adopted
 *
 * Admitting an upload never trusts the browser: names are reduced to a leaf,
 * media types are sniffed from bytes, and every length is re-checked here.
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { ROUNDTABLE_DIR, render } from "./core.js";

/** Allowed image media types, mirroring the host attachment service. */
export const IMAGE_MEDIA_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Extensions accepted as text-like documents when the browser sends no MIME. */
export const TEXT_EXTENSIONS = Object.freeze([
  "txt", "text", "md", "markdown", "mdx", "rst", "adoc", "org",
  "json", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "csv", "tsv", "xml", "html", "htm", "css", "scss", "less",
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "vue", "svelte", "astro",
  "py", "rb", "go", "rs", "java", "kt", "kts", "swift", "scala", "clj",
  "c", "h", "cc", "cpp", "cxx", "hpp", "cs", "php", "lua", "r", "m",
  "sql", "graphql", "gql", "sh", "bash", "zsh", "ps1", "bat", "cmd",
  "tex", "bib", "log", "diff", "patch", "properties", "gradle", "env",
  "pl", "pm", "ex", "exs", "erl", "hs", "ml", "fsx", "dart",
]);

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MAX_NAME_CHARS = 120;

/** A rejected upload/adoption. The page API maps it like a meeting error. */
export class AttachmentError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "AttachmentError";
    this.code = code;
    this.status = status;
  }
}

function bad(copy, key, values) {
  const template = copy?.[key] ?? copy?.invalidRequest ?? key;
  return new AttachmentError(String(key).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`), render(template, values ?? {}));
}

/** Effective attachment limits for one plugin config. */
export function attachmentLimits(config) {
  return {
    maxFiles: config.attachmentMaxFiles,
    maxFileBytes: config.attachmentMaxFileBytes,
    maxTotalBytes: config.attachmentMaxTotalBytes,
    textCharsPerFile: config.attachmentTextCharsPerFile,
    textCharsTotal: config.attachmentTextCharsTotal,
  };
}

/** Max request body for the upload route: base64 growth plus JSON framing. */
export function uploadBodyLimit(config) {
  return Math.ceil((config.attachmentMaxTotalBytes * 4) / 3) + 256 * 1024;
}

/** Reduce any user-supplied name to one safe leaf name. */
export function sanitizeName(raw) {
  const flat = String(raw ?? "").replace(/\\/gu, "/");
  const leaf = basename(flat);
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .replace(/[<>:"|?*]/gu, "_")
    .trim();
  const cut = [...cleaned].slice(0, MAX_NAME_CHARS).join("");
  return cut === "" || cut === "." || cut === ".." ? "attachment" : cut;
}

/** Lower-case extension without the dot, or "" when there is none. */
export function extensionOf(name) {
  const leaf = basename(String(name ?? "").replace(/\\/gu, "/"));
  const dot = leaf.lastIndexOf(".");
  return dot > 0 && dot < leaf.length - 1 ? leaf.slice(dot + 1).toLowerCase() : "";
}

/** Sniff one image media type from its magic bytes. */
export function sniffImageMediaType(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38
    && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return "image/gif";
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return undefined;
}

/** True when the bytes decode as strict UTF-8 and contain no NUL. */
export function isTextBytes(bytes) {
  if (bytes.length === 0) return true;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  return !text.includes("\u0000");
}

/** Decide whether one upload is an image or an inlinable text file. */
export function classifyUpload({ name, mime, bytes }, copy) {
  const imageType = sniffImageMediaType(bytes);
  if (imageType !== undefined) return { kind: "image", mime: imageType };
  const ext = extensionOf(name);
  const declared = typeof mime === "string" ? mime.toLowerCase() : "";
  const looksText = TEXT_EXTENSIONS.includes(ext) || declared.startsWith("text/") || declared === "application/json"
    || declared === "application/xml" || declared === "application/x-yaml";
  if (!looksText || !isTextBytes(bytes)) {
    throw bad(copy, "attachmentUnsupportedType", { name: sanitizeName(name) });
  }
  return { kind: "text", mime: declared.startsWith("text/") ? declared : "text/plain" };
}

/** Decode a canonical base64 payload, refusing malformed or oversized input. */
export function decodeBase64(data, copy) {
  if (typeof data !== "string" || data === "") {
    throw bad(copy, "attachmentInvalidData");
  }
  const payload = data.replace(/^data:[^,]*;base64,/u, "").replace(/[\r\n\t ]/gu, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(payload) || payload.length % 4 !== 0) {
    throw bad(copy, "attachmentInvalidData");
  }
  const bytes = Buffer.from(payload, "base64");
  // Re-encoding catches non-canonical trailing bits that Buffer silently drops.
  if (bytes.toString("base64").replace(/=+$/u, "") !== payload.replace(/=+$/u, "")) {
    throw bad(copy, "attachmentInvalidData");
  }
  return bytes;
}

function uploadDir(workspace, id) {
  return join(workspace, ROUNDTABLE_DIR, "uploads", id);
}

function manifestOf(workspace, id) {
  return join(uploadDir(workspace, id), "manifest.json");
}

/**
 * Admit one upload batch: validate every file, store every file, and write one
 * manifest per file. Either the whole batch lands or nothing does.
 */
export async function storeUploads({ ctx, workspace, files, copy, config }) {
  const limits = attachmentLimits(config);
  if (!Array.isArray(files) || files.length === 0) throw bad(copy, "attachmentMissing");
  if (files.length > limits.maxFiles) {
    throw bad(copy, "attachmentTooMany", { max: limits.maxFiles });
  }
  const prepared = [];
  let total = 0;
  for (const item of files) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw bad(copy, "attachmentInvalidData");
    }
    const name = sanitizeName(item.name);
    const bytes = decodeBase64(item.data, copy);
    if (bytes.length === 0) throw bad(copy, "attachmentEmpty", { name });
    if (bytes.length > limits.maxFileBytes) {
      throw bad(copy, "attachmentTooLarge", { name, max: formatBytes(limits.maxFileBytes) });
    }
    total += bytes.length;
    if (total > limits.maxTotalBytes) {
      throw bad(copy, "attachmentTotalTooLarge", { max: formatBytes(limits.maxTotalBytes) });
    }
    const kind = classifyUpload({ name, mime: item.mime, bytes }, copy);
    prepared.push({ name, bytes, ...kind });
  }

  const created = [];
  const stored = [];
  try {
    for (const [index, file] of prepared.entries()) {
      const id = randomUUID();
      const directory = uploadDir(workspace, id);
      mkdirSync(directory, { recursive: true });
      created.push(directory);
      let ref;
      if (file.kind === "image") {
        const attachments = ctx?.attachments;
        if (attachments?.saveImage === undefined) throw bad(copy, "attachmentsUnavailable");
        ref = await attachments.saveImage({
          data: new Uint8Array(file.bytes),
          mediaType: file.mime,
          name: file.name,
        });
      }
      const payloadName = "payload";
      writeFileSync(join(directory, payloadName), file.bytes);
      const manifest = {
        version: 1,
        id,
        index,
        workspace,
        name: file.name,
        kind: file.kind,
        mime: file.mime,
        bytes: file.bytes.length,
        createdAt: new Date().toISOString(),
        payload: payloadName,
        ...(ref === undefined ? {} : { ref }),
      };
      writeFileSync(manifestOf(workspace, id), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      stored.push({
        id,
        name: manifest.name,
        kind: manifest.kind,
        mime: manifest.mime,
        bytes: manifest.bytes,
      });
    }
  } catch (error) {
    for (const directory of created) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; a leftover upload directory is inert.
      }
    }
    throw error;
  }
  return { attachments: stored, limits };
}

/** Read and validate one uploaded manifest. */
export function readUpload(workspace, id, copy) {
  if (typeof id !== "string" || !UPLOAD_ID.test(id)) {
    throw new AttachmentError("attachment-not-found", render(copy.attachmentNotFound, { id: String(id) }), 404);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestOf(workspace, id), "utf8"));
  } catch {
    throw new AttachmentError("attachment-not-found", render(copy.attachmentNotFound, { id }), 404);
  }
  if (manifest?.id !== id || manifest?.kind === undefined) {
    throw new AttachmentError("attachment-not-found", render(copy.attachmentNotFound, { id }), 404);
  }
  if (resolvePathOf(manifest.workspace) !== resolvePathOf(workspace)) {
    throw new AttachmentError("attachment-not-found", render(copy.attachmentNotFound, { id }), 404);
  }
  return manifest;
}

function resolvePathOf(value) {
  const text = String(value ?? "");
  return process.platform === "win32" ? text.toLowerCase() : text;
}

/**
 * Drop uploads the user took back before starting the meeting.
 *
 * Only the pending upload area is touched, never an adopted meeting directory,
 * and unknown ids are ignored so a stale page cannot fail the whole action.
 */
export function removeUploads({ workspace, ids }) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const removed = [];
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw : raw?.id;
    if (typeof id !== "string" || !UPLOAD_ID.test(id)) continue;
    const dir = uploadDir(workspace, id);
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(id);
  }
  return removed;
}

/**
 * Move admitted uploads into the meeting's own directory.
 *
 * The meeting record only carries the relative path, so a workspace moved as a
 * whole keeps its attachments with it.
 */
export function adoptUploads({ workspace, ids, meetingId, copy }) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const unique = [];
  for (const id of ids) {
    const text = typeof id === "string" ? id : id?.id;
    if (typeof text !== "string" || !UPLOAD_ID.test(text)) {
      throw new AttachmentError("attachment-not-found", render(copy.attachmentNotFound, { id: String(text) }), 404);
    }
    if (!unique.includes(text)) unique.push(text);
  }
  const targetRoot = join(workspace, ROUNDTABLE_DIR, "attachments", meetingId);
  mkdirSync(targetRoot, { recursive: true });
  const adopted = [];
  for (const id of unique) {
    const manifest = readUpload(workspace, id, copy);
    const source = uploadDir(workspace, id);
    const target = join(targetRoot, id);
    try {
      renameSync(source, target);
    } catch {
      throw new AttachmentError("attachment-adopt-failed", render(copy.attachmentAdoptFailed, { name: manifest.name }), 500);
    }
    adopted.push({
      id,
      name: manifest.name,
      kind: manifest.kind,
      mime: manifest.mime,
      bytes: manifest.bytes,
      // POSIX separators so a record stays readable across hosts.
      path: ["attachments", meetingId, id, manifest.payload ?? "payload"].join("/"),
      ...(manifest.ref === undefined ? {} : { ref: manifest.ref }),
    });
  }
  return adopted;
}

/** Absolute path of one adopted attachment inside the workspace. */
export function attachmentPath(workspace, attachment) {
  return join(workspace, ROUNDTABLE_DIR, ...String(attachment.path ?? "").split("/"));
}

/** Load the bytes of one adopted attachment. */
export function readAttachment(workspace, attachment) {
  return readFileSync(attachmentPath(workspace, attachment));
}

/**
 * Fold text-like attachments into one prompt section.
 *
 * Each file is fenced so the model can tell code from prose; an oversized file
 * is cut with a visible marker instead of silently losing its tail, and the
 * total budget is shared in upload order.
 */
export function attachmentTextBlock(workspace, attachments, copy, config) {
  const limits = attachmentLimits(config);
  const textFiles = (Array.isArray(attachments) ? attachments : []).filter((item) => item?.kind === "text");
  if (textFiles.length === 0) return { text: "", truncated: [], omitted: [] };
  const sections = [];
  const truncated = [];
  const omitted = [];
  let budget = limits.textCharsTotal;
  for (const file of textFiles) {
    if (budget <= 0) {
      omitted.push(file.name);
      continue;
    }
    let raw = "";
    try {
      raw = readFileSync(attachmentPath(workspace, file), "utf8");
    } catch {
      omitted.push(file.name);
      continue;
    }
    const perFile = Math.min(limits.textCharsPerFile, budget);
    let body = [...raw].slice(0, perFile).join("");
    const cut = [...raw].length > perFile;
    if (cut) {
      truncated.push(file.name);
      body += "\n… (truncated)";
    }
    budget -= Math.min([...raw].length, perFile);
    const language = languageOf(file.name);
    sections.push(`### Attached file: ${file.name}`, "", `\`\`\`${language}`, body, "```");
  }
  const header = [
    "The user attached these files to the topic. Treat them as primary source material.",
    "Do not repeat the whole file back; refer to it only when it matters.",
    "",
  ];
  return {
    text: sections.length === 0 ? "" : header.concat(sections).join("\n"),
    truncated,
    omitted,
  };
}

function languageOf(name) {
  const ext = extensionOf(name);
  const map = {
    js: "js", mjs: "js", cjs: "js", jsx: "jsx", ts: "ts", tsx: "tsx", py: "python",
    rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", cs: "csharp",
    c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", php: "php",
    sh: "bash", bash: "bash", ps1: "powershell", sql: "sql", md: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml", csv: "csv", html: "html",
    css: "css", xml: "xml", tex: "latex", diff: "diff",
  };
  return map[ext] ?? "";
}

/**
 * Authoritative per-route image capability.
 *
 * `null` means the adapter did not declare input modalities: the host will not
 * reject an image, so the caller may try and record an honest failure if the
 * provider still refuses.
 */
export async function resolveImageSupport(llm, entry, signal) {
  try {
    const info = await llm.resolveModelInfo(entry.provider, entry.model, signal);
    const modalities = info?.inputModalities;
    if (modalities === undefined || modalities === null) return null;
    return Array.isArray(modalities) && modalities.includes("image");
  } catch {
    return null;
  }
}

/** Human-readable byte count used in error copy. */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "?";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}