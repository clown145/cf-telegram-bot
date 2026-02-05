import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  if (!chatId) {
    throw new Error("chat_id is required");
  }

  const audioSource = String(params.audio_source || params.file_source || "");
  if (!audioSource) {
    throw new Error("audio_source is required");
  }

  const caption = params.caption ? String(params.caption) : "";
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const filenameOverride = params.filename ? String(params.filename) : "";

  if (context.preview) {
    return { message_id: 0 };
  }

  const r2File = await loadR2File(context.env as any, audioSource);
  if (r2File) {
    const payload = new FormData();
    payload.append("chat_id", chatId);
    if (caption) {
      payload.append("caption", caption);
    }
    if (parseMode) {
      payload.append("parse_mode", parseMode);
    }
    const filename = filenameOverride || r2File.filename;
    payload.append("audio", r2File.blob, filename);
    const result = await callTelegramForm(context.env as any, "sendAudio", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    audio: audioSource,
  };
  if (caption) {
    payload.caption = caption;
  }
  if (parseMode) {
    payload.parse_mode = parseMode;
  }
  const result = await callTelegram(context.env as any, "sendAudio", payload);
  return { message_id: (result.result as any)?.message_id };
};

