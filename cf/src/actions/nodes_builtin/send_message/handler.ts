import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { addCacheBuster, buildReplyParameters, loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

function parseKeyboardRows(value: unknown): unknown[][] {
  if (Array.isArray(value)) {
    return value.map((row) => {
      const entries = Array.isArray(row) ? row : [row];
      return entries
        .map((entry) => {
          if (entry && typeof entry === "object") {
            return entry;
          }
          const text = String(entry || "").trim();
          return text ? { text } : null;
        })
        .filter(Boolean) as unknown[];
    }).filter((row) => row.length > 0);
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      return parseKeyboardRows(parsed);
    } catch {
      // fall through to text parser
    }
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("|") ? "|" : ",").map((entry) => entry.trim()).filter(Boolean))
    .filter((row) => row.length > 0)
    .map((row) => row.map((entry) => ({ text: entry })));
}

function optionalBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return Boolean(value);
}

function buildReplyMarkup(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const rawJson = String(params.reply_markup_json || "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error("reply_markup_json must be valid JSON");
    }
  }

  const type = String(params.reply_markup_type || "none").trim().toLowerCase();
  if (!type || type === "none") {
    return undefined;
  }

  const selective = optionalBool(params.selective);
  const placeholder = String(params.input_field_placeholder || "").trim();
  if (type === "remove_keyboard") {
    const markup: Record<string, unknown> = { remove_keyboard: true };
    if (selective !== undefined) markup.selective = selective;
    return markup;
  }
  if (type === "force_reply") {
    const markup: Record<string, unknown> = { force_reply: true };
    if (selective !== undefined) markup.selective = selective;
    if (placeholder) markup.input_field_placeholder = placeholder;
    return markup;
  }
  if (type === "reply_keyboard") {
    const keyboard = parseKeyboardRows(params.reply_keyboard);
    if (!keyboard.length) {
      throw new Error("reply_keyboard is required when reply_markup_type=reply_keyboard");
    }
    const markup: Record<string, unknown> = { keyboard };
    const resizeKeyboard = optionalBool(params.resize_keyboard);
    const oneTimeKeyboard = optionalBool(params.one_time_keyboard);
    const isPersistent = optionalBool(params.is_persistent);
    if (resizeKeyboard !== undefined) markup.resize_keyboard = resizeKeyboard;
    if (oneTimeKeyboard !== undefined) markup.one_time_keyboard = oneTimeKeyboard;
    if (isPersistent !== undefined) markup.is_persistent = isPersistent;
    if (selective !== undefined) markup.selective = selective;
    if (placeholder) markup.input_field_placeholder = placeholder;
    return markup;
  }
  throw new Error(`unsupported reply_markup_type: ${type}`);
}

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  if (!chatId) {
    throw new Error("chat_id is required");
  }
  const text = params.text ? String(params.text) : "";
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const noCacheMedia = params.no_cache_media !== false; // Default to true
  const replyParameters = buildReplyParameters(params.reply_to_message_id);
  const replyMarkup = buildReplyMarkup(params);

  let imageSource = params.image_source ? String(params.image_source) : "";
  let voiceSource = params.voice_source ? String(params.voice_source) : "";

  if (noCacheMedia) {
    imageSource = addCacheBuster(imageSource);
    voiceSource = addCacheBuster(voiceSource);
  }

  if (context.preview) {
    if (!text && !imageSource && !voiceSource) {
      return {};
    }
    return { message_id: 0 };
  }

  if (imageSource) {
    const r2File = await loadR2File(context.env as any, imageSource);
    if (r2File) {
      const payload = new FormData();
      payload.append("chat_id", chatId);
      if (text) {
        payload.append("caption", text);
      }
      if (parseMode) {
        payload.append("parse_mode", parseMode);
      }
      if (replyParameters) {
        payload.append("reply_parameters", JSON.stringify(replyParameters));
      }
      if (replyMarkup) {
        payload.append("reply_markup", JSON.stringify(replyMarkup));
      }
      payload.append("photo", r2File.blob, r2File.filename);
      const result = await callTelegramForm(context.env as any, "sendPhoto", payload);
      return { message_id: (result.result as any)?.message_id };
    }
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      photo: imageSource,
    };
    if (text) {
      payload.caption = text;
    }
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (replyParameters) {
      payload.reply_parameters = replyParameters;
    }
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const result = await callTelegram(context.env as any, "sendPhoto", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  if (voiceSource) {
    const r2File = await loadR2File(context.env as any, voiceSource);
    if (r2File) {
      const payload = new FormData();
      payload.append("chat_id", chatId);
      if (text) {
        payload.append("caption", text);
      }
      if (parseMode) {
        payload.append("parse_mode", parseMode);
      }
      if (replyParameters) {
        payload.append("reply_parameters", JSON.stringify(replyParameters));
      }
      if (replyMarkup) {
        payload.append("reply_markup", JSON.stringify(replyMarkup));
      }
      payload.append("voice", r2File.blob, r2File.filename);
      const result = await callTelegramForm(context.env as any, "sendVoice", payload);
      return { message_id: (result.result as any)?.message_id };
    }
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      voice: voiceSource,
    };
    if (text) {
      payload.caption = text;
    }
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (replyParameters) {
      payload.reply_parameters = replyParameters;
    }
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const result = await callTelegram(context.env as any, "sendVoice", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  if (text) {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (replyParameters) {
      payload.reply_parameters = replyParameters;
    }
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const result = await callTelegram(context.env as any, "sendMessage", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  return {};
};
