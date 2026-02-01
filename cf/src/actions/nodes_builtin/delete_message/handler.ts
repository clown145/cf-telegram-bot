import type { ActionHandler } from "../../handlers";
import { callTelegram } from "../../telegram";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "");
  const messageId = Number(params.message_id || 0);
  if (!chatId || !messageId) {
    throw new Error("chat_id and message_id are required");
  }
  if (context.preview) {
    return {};
  }
  await callTelegram(context.env as any, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
  return {};
};
