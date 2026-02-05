import { CALLBACK_PREFIX_ACTION, CALLBACK_PREFIX_BACK, CALLBACK_PREFIX_COMMAND, CALLBACK_PREFIX_MENU, CALLBACK_PREFIX_WORKFLOW } from "../telegram/constants";
import type { TelegramEnv } from "./telegram";

export function normalizeParseMode(value: unknown): string {
  const lowered = String(value || "html").trim().toLowerCase();
  if (["", "none", "plain", "text", "plaintext"].includes(lowered)) {
    return "plain";
  }
  if (["markdown", "md"].includes(lowered)) {
    return "markdown";
  }
  if (["markdownv2", "mdv2"].includes(lowered)) {
    return "markdownv2";
  }
  return "html";
}

export function normalizeTelegramParseMode(value: unknown): string | undefined {
  const lowered = String(value || "").trim().toLowerCase();
  if (lowered === "" || lowered === "none" || lowered === "plain" || lowered === "text" || lowered === "plaintext") {
    return undefined;
  }
  if (lowered === "markdownv2" || lowered === "mdv2") {
    return "MarkdownV2";
  }
  if (lowered === "markdown" || lowered === "md") {
    return "Markdown";
  }
  return "HTML";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseCancelKeywords(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(value).replace(/\r/g, "\n");
  const parts: string[] = [];
  for (const chunk of text.split("\n")) {
    for (const section of chunk.split(",")) {
      const trimmed = section.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
    }
  }
  return parts;
}

const R2_PREFIX = "r2://";

export async function loadR2File(
  env: TelegramEnv,
  source: string
): Promise<{ blob: Blob; filename: string } | null> {
  if (!source || !source.startsWith(R2_PREFIX)) {
    return null;
  }
  const key = source.slice(R2_PREFIX.length);
  if (!key) {
    throw new Error("invalid r2 key");
  }
  const bucket = (env as any).FILE_BUCKET;
  if (!bucket) {
    throw new Error("FILE_BUCKET not configured");
  }
  const object = await bucket.get(key);
  if (!object) {
    throw new Error(`r2 object not found: ${key}`);
  }

  const buffer = object.arrayBuffer
    ? await object.arrayBuffer()
    : await new Response(object.body).arrayBuffer();
  const contentType = object.httpMetadata?.contentType as string | undefined;
  const filename = sanitizeFilename(key.split("/").pop() || "file");
  const blob = new Blob([buffer], {
    type: contentType || "application/octet-stream",
  });
  return { blob, filename };
}

export function deriveFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").pop() || "";
    return sanitizeFilename(last);
  } catch {
    return "";
  }
}

export function buildCacheKey(filename: string, contentType: string): string {
  let safeName = sanitizeFilename(filename);
  if (!safeName) {
    const ext = extensionFromContentType(contentType);
    if (ext) {
      safeName = `file${ext}`;
    }
  } else if (!safeName.includes(".") && contentType) {
    const ext = extensionFromContentType(contentType);
    if (ext) {
      safeName = `${safeName}${ext}`;
    }
  }
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return safeName ? `cache/${nonce}_${safeName}` : `cache/${nonce}`;
}

export function extensionFromContentType(contentType: string): string {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  switch (normalized) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "audio/ogg":
      return ".ogg";
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    case "audio/x-wav":
      return ".wav";
    case "audio/opus":
      return ".opus";
    case "video/mp4":
      return ".mp4";
    default:
      return "";
  }
}

export function sanitizeFilename(name: string): string {
  if (!name) {
    return "";
  }
  const base = name.replace(/\\/g, "/").split("/").pop() || "";
  const ascii = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return ascii.slice(0, 120);
}

export function normalizeButtonLabel(rawText: string, fallback: string): string {
  let base = String(rawText || "").trim();
  if (base) {
    base = base.replace(/<[^>]+>/g, "");
    base = base.replace(/[*_`~]/g, "");
    base = base.replace(/[\\[\\]()>\"]/g, "");
    base = base.trim();
  }
  if (!base) {
    base = String(fallback || "").trim();
  }
  if (base.length > 64) {
    base = `${base.slice(0, 61)}...`;
  }
  return base;
}

export function parseButtonIdFromCallback(data: string): string {
  if (!data) {
    return "";
  }
  const prefixes = [
    CALLBACK_PREFIX_WORKFLOW,
    CALLBACK_PREFIX_ACTION,
    CALLBACK_PREFIX_COMMAND,
    CALLBACK_PREFIX_MENU,
    CALLBACK_PREFIX_BACK,
  ];
  for (const prefix of prefixes) {
    if (data.startsWith(prefix)) {
      return data.slice(prefix.length);
    }
  }
  return "";
}

/**
 * Adds a cache-busting query parameter to a URL if it's a remote URL.
 */
export function addCacheBuster(url: string): string {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_t", Date.now().toString());
    return parsed.toString();
  } catch {
    return url;
  }
}

export function buildReplyParameters(value: unknown): { message_id: number } | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) {
    return undefined;
  }
  return { message_id: Math.trunc(num) };
}
