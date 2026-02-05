import type { ActionHandler } from "../../handlers";
import { callTelegram } from "../../telegram";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "").trim();
  if (!chatId) {
    throw new Error("chat_id is required");
  }

  const fromChatId = String(params.from_chat_id || "").trim();
  if (!fromChatId) {
    throw new Error("from_chat_id is required");
  }

  const messageId = typeof params.message_id === "number" ? params.message_id : Number(String(params.message_id || "").trim());
  if (!Number.isFinite(messageId) || messageId <= 0) {
    throw new Error("message_id is required");
  }

  if (context.preview) {
    return { message_id: 0 };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: Math.trunc(messageId),
  };

  const result = await callTelegram(context.env as any, "copyMessage", payload);
  const messageIdResult = (result.result as any)?.message_id;
  return { message_id: messageIdResult };
};

