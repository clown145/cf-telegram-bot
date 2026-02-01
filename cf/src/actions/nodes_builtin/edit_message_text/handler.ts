import type { ActionHandler } from "../../handlers";
import { callTelegram } from "../../telegram";
import { normalizeTelegramParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  const messageId = Number(params.message_id || 0);
  if (!chatId || !messageId) {
    throw new Error("chat_id and message_id are required");
  }
  if (context.preview) {
    return { message_id: messageId };
  }
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: String(params.text || ""),
  };
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  if (parseMode) {
    payload.parse_mode = parseMode;
  }
  const result = await callTelegram(context.env as any, "editMessageText", payload);
  return { message_id: (result.result as any)?.message_id ?? messageId };
};
