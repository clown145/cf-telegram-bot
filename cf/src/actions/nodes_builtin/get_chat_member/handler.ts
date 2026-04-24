import type { ActionHandler } from "../../handlers";
import { callTelegram } from "../../telegram";

function normalizeStatus(value: unknown): string {
  const status = String(value || "").trim().toLowerCase();
  if (status === "creator") {
    return "owner";
  }
  return status;
}

function buildRoleFlags(status: string): Record<string, unknown> {
  const normalized = normalizeStatus(status);
  const isOwner = normalized === "owner";
  const isAdmin = normalized === "administrator" || isOwner;
  const isRestricted = normalized === "restricted";
  const isLeft = normalized === "left";
  const isBanned = normalized === "kicked";
  const isMember = !isLeft && !isBanned;
  return {
    status: normalized,
    is_admin: isAdmin,
    is_owner: isOwner,
    is_member: isMember,
    is_restricted: isRestricted,
    is_left: isLeft,
    is_banned: isBanned,
  };
}

export const handler: ActionHandler = async (params, context) => {
  const chatId = String(params.chat_id || "").trim();
  const userIdRaw = String(params.user_id || "").trim();
  if (!chatId) {
    throw new Error("chat_id is required");
  }
  if (!userIdRaw) {
    throw new Error("user_id is required");
  }

  if (context.preview) {
    return {
      chat_member: {
        user: { id: userIdRaw },
        status: "member",
      },
      ...buildRoleFlags("member"),
    };
  }

  const userIdNum = Number(userIdRaw);
  const userId: number | string = Number.isFinite(userIdNum) ? Math.trunc(userIdNum) : userIdRaw;
  const response = await callTelegram(context.env as any, "getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
  const chatMember = ((response as any).result || {}) as Record<string, unknown>;
  const flags = buildRoleFlags(chatMember.status);

  return {
    chat_member: chatMember,
    ...flags,
  };
};