import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { addCacheBuster, loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  if (!chatId) {
    throw new Error("chat_id is required");
  }
  const text = params.text ? String(params.text) : "";
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const noCacheMedia = params.no_cache_media !== false; // Default to true

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
    const result = await callTelegram(context.env as any, "sendMessage", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  return {};
};
