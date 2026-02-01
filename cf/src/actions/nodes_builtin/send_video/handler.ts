import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  if (!chatId) {
    throw new Error("chat_id is required");
  }

  const videoSource = String(params.video_source || params.file_source || "");
  if (!videoSource) {
    throw new Error("video_source is required");
  }

  const caption = params.caption ? String(params.caption) : "";
  const parseMode = normalizeTelegramParseMode(params.parse_mode);

  if (context.preview) {
    return { message_id: 0 };
  }

  const r2File = await loadR2File(context.env as any, videoSource);
  if (r2File) {
    const payload = new FormData();
    payload.append("chat_id", chatId);
    if (caption) {
      payload.append("caption", caption);
    }
    if (parseMode) {
      payload.append("parse_mode", parseMode);
    }
    payload.append("video", r2File.blob, r2File.filename);
    const result = await callTelegramForm(context.env as any, "sendVideo", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    video: videoSource,
  };
  if (caption) {
    payload.caption = caption;
  }
  if (parseMode) {
    payload.parse_mode = parseMode;
  }
  const result = await callTelegram(context.env as any, "sendVideo", payload);
  return { message_id: (result.result as any)?.message_id };
};
