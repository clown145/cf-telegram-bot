import type { ActionHandler } from "../../handlers";
import { callTelegram, callTelegramForm } from "../../telegram";
import { buildReplyParameters, loadR2File, normalizeTelegramParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  if (!chatId) {
    throw new Error("chat_id is required");
  }

  const animationSource = String(params.animation_source || params.file_source || "");
  if (!animationSource) {
    throw new Error("animation_source is required");
  }

  const caption = params.caption ? String(params.caption) : "";
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const replyParameters = buildReplyParameters(params.reply_to_message_id);

  if (context.preview) {
    return { message_id: 0 };
  }

  const r2File = await loadR2File(context.env as any, animationSource);
  if (r2File) {
    const payload = new FormData();
    payload.append("chat_id", chatId);
    if (caption) {
      payload.append("caption", caption);
    }
    if (parseMode) {
      payload.append("parse_mode", parseMode);
    }
    if (replyParameters) {
      payload.append("reply_parameters", JSON.stringify(replyParameters));
    }
    payload.append("animation", r2File.blob, r2File.filename);
    const result = await callTelegramForm(context.env as any, "sendAnimation", payload);
    return { message_id: (result.result as any)?.message_id };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    animation: animationSource,
  };
  if (caption) {
    payload.caption = caption;
  }
  if (parseMode) {
    payload.parse_mode = parseMode;
  }
  if (replyParameters) {
    payload.reply_parameters = replyParameters;
  }
  const result = await callTelegram(context.env as any, "sendAnimation", payload);
  return { message_id: (result.result as any)?.message_id };
};
