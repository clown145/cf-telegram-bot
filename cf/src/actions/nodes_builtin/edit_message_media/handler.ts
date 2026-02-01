import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  const messageId = Number(params.message_id || 0);
  if (!chatId || !messageId) {
    throw new Error("chat_id and message_id are required");
  }
  const imageSource = params.image_source ? String(params.image_source) : "";
  const voiceSource = params.voice_source ? String(params.voice_source) : "";
  if (!imageSource && !voiceSource) {
    throw new Error("image_source or voice_source is required");
  }
  if (context.preview) {
    return { message_id: messageId };
  }
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const caption = params.text ? String(params.text) : undefined;
  const r2Source = imageSource || voiceSource;
  const r2File = r2Source ? await loadR2File(context.env as any, r2Source) : null;
  if (r2File) {
    const payload = new FormData();
    payload.append("chat_id", chatId);
    payload.append("message_id", String(messageId));
    const media: Record<string, unknown> = {
      type: imageSource ? "photo" : "voice",
      media: "attach://file",
    };
    if (caption) {
      media.caption = caption;
    }
    if (parseMode) {
      media.parse_mode = parseMode;
    }
    payload.append("media", JSON.stringify(media));
    payload.append("file", r2File.blob, r2File.filename);
    const result = await callTelegramForm(context.env as any, "editMessageMedia", payload);
    return { message_id: (result.result as any)?.message_id ?? messageId };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
  };
  const media: Record<string, unknown> = {
    type: imageSource ? "photo" : "voice",
    media: imageSource || voiceSource,
  };
  if (caption) {
    media.caption = caption;
  }
  if (parseMode) {
    media.parse_mode = parseMode;
  }
  payload.media = media;
  const result = await callTelegram(context.env as any, "editMessageMedia", payload);
  return { message_id: (result.result as any)?.message_id ?? messageId };
};
