import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { buildReplyParameters, loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

interface MediaEntry {
  type?: string;
  media?: string;
  caption?: string;
  parse_mode?: string;
}

const MAX_MEDIA_ITEMS = 10;

function normalizeMedia(raw: unknown): MediaEntry[] {
  if (Array.isArray(raw)) {
    return raw as MediaEntry[];
  }
  if (raw === null || raw === undefined) {
    return [];
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as MediaEntry[];
      }
    } catch {
      return [];
    }
  }
  return [];
}

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  if (!chatId) {
    throw new Error("chat_id is required");
  }

  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const replyParameters = buildReplyParameters(params.reply_to_message_id);
  const rawMediaList = normalizeMedia(params.media);
  if (rawMediaList.length > MAX_MEDIA_ITEMS) {
    throw new Error(`media exceeds max items (${MAX_MEDIA_ITEMS})`);
  }
  const mediaList = rawMediaList;
  if (!mediaList.length) {
    throw new Error("media is required");
  }

  if (context.preview) {
    return { message_id: 0 };
  }

  const attachments: { name: string; blob: Blob; filename: string }[] = [];
  const normalized: Record<string, unknown>[] = [];
  let attachIndex = 0;

  for (const entry of mediaList) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const type = String(entry.type || "photo").toLowerCase();
    const media = entry.media ? String(entry.media) : "";
    if (!media) {
      continue;
    }

    let mediaValue = media;
    const r2File = await loadR2File(context.env as any, media);
    if (r2File) {
      attachIndex += 1;
      const attachName = `file${attachIndex}`;
      attachments.push({ name: attachName, blob: r2File.blob, filename: r2File.filename });
      mediaValue = `attach://${attachName}`;
    }

    const normalizedType =
      type === "video" || type === "photo" || type === "audio" || type === "document" ? type : "photo";
    const item: Record<string, unknown> = { type: normalizedType, media: mediaValue };
    if (entry.caption) {
      item.caption = String(entry.caption);
      const entryMode = entry.parse_mode ? normalizeTelegramParseMode(entry.parse_mode) : undefined;
      const finalParseMode = entryMode ?? parseMode;
      if (finalParseMode) {
        item.parse_mode = finalParseMode;
      }
    }
    normalized.push(item);
  }

  if (!normalized.length) {
    throw new Error("media list is empty");
  }

  if (attachments.length) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("media", JSON.stringify(normalized));
    if (replyParameters) {
      form.append("reply_parameters", JSON.stringify(replyParameters));
    }
    for (const file of attachments) {
      form.append(file.name, file.blob, file.filename);
    }
    const result = await callTelegramForm(context.env as any, "sendMediaGroup", form);
    const firstMessageId = Array.isArray(result.result) ? (result.result[0] as any)?.message_id : undefined;
    return { message_id: firstMessageId };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    media: normalized,
  };
  if (replyParameters) {
    payload.reply_parameters = replyParameters;
  }
  const result = await callTelegram(context.env as any, "sendMediaGroup", payload);
  const firstMessageId = Array.isArray(result.result) ? (result.result[0] as any)?.message_id : undefined;
  return { message_id: firstMessageId };
};
