import type { ActionHandler } from "../../handlers";
import { callTelegram } from "../../telegram";

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "").trim();
  if (!chatId) {
    throw new Error("chat_id is required");
  }

  if (context.preview) {
    return {
      chat: {
        id: chatId,
        type: "private",
        title: "",
        username: "",
        is_forum: false,
      },
      chat_id: chatId,
      chat_type: "private",
      title: "",
      username: "",
      is_forum: false,
    };
  }

  const response = await callTelegram(context.env as any, "getChat", {
    chat_id: chatId,
  });
  const chat = ((response as any).result || {}) as Record<string, unknown>;

  return {
    chat,
    chat_id: chat.id !== undefined ? String(chat.id) : chatId,
    chat_type: String(chat.type || ""),
    title: String(chat.title || ""),
    username: String(chat.username || ""),
    is_forum: Boolean(chat.is_forum),
  };
};