import type { ActionHandler } from "../handlers";
import { callTelegram } from "../telegram";
import type { ModularActionDefinition } from "../modularActions";

type NodePackage = {
  definition: ModularActionDefinition;
  handler: ActionHandler;
};

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function requiredText(params: Record<string, unknown>, name: string): string {
  const value = text(params[name]).trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredInt(params: Record<string, unknown>, name: string): number {
  const value = Number(params[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} is required`);
  }
  return Math.trunc(value);
}

function optionalInt(params: Record<string, unknown>, name: string): number | undefined {
  if (params[name] === null || params[name] === undefined || params[name] === "") {
    return undefined;
  }
  const value = Number(params[name]);
  return Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function optionalBoolean(params: Record<string, unknown>, name: string): boolean | undefined {
  if (params[name] === null || params[name] === undefined || params[name] === "") {
    return undefined;
  }
  return Boolean(params[name]);
}

function addOptionalBooleans(payload: Record<string, unknown>, params: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    const value = optionalBoolean(params, name);
    if (value !== undefined) {
      payload[name] = value;
    }
  }
}

function makeChatUserPayload(params: Record<string, unknown>): Record<string, unknown> {
  return {
    chat_id: requiredText(params, "chat_id"),
    user_id: requiredInt(params, "user_id"),
  };
}

function telegramOkHandler(
  method: string,
  buildPayload: (params: Record<string, unknown>) => Record<string, unknown>
): ActionHandler {
  return async (params, context) => {
    const payload = buildPayload(params);
    if (context.preview) {
      return { ok: true };
    }
    const response = await callTelegram(context.env as any, method, payload);
    return {
      ok: Boolean((response as any).ok ?? true),
      result: (response as any).result ?? true,
    };
  };
}

const banChatMemberHandler = telegramOkHandler("banChatMember", (params) => {
  const payload = makeChatUserPayload(params);
  const untilDate = optionalInt(params, "until_date");
  if (untilDate !== undefined) payload.until_date = untilDate;
  addOptionalBooleans(payload, params, ["revoke_messages"]);
  return payload;
});

const unbanChatMemberHandler = telegramOkHandler("unbanChatMember", (params) => {
  const payload = makeChatUserPayload(params);
  addOptionalBooleans(payload, params, ["only_if_banned"]);
  return payload;
});

const restrictChatMemberHandler = telegramOkHandler("restrictChatMember", (params) => {
  const payload = makeChatUserPayload(params);
  const permissions: Record<string, unknown> = {};
  addOptionalBooleans(permissions, params, [
    "can_send_messages",
    "can_send_audios",
    "can_send_documents",
    "can_send_photos",
    "can_send_videos",
    "can_send_video_notes",
    "can_send_voice_notes",
    "can_send_polls",
    "can_send_other_messages",
    "can_add_web_page_previews",
    "can_change_info",
    "can_invite_users",
    "can_pin_messages",
    "can_manage_topics",
  ]);
  payload.permissions = permissions;
  const untilDate = optionalInt(params, "until_date");
  if (untilDate !== undefined) payload.until_date = untilDate;
  addOptionalBooleans(payload, params, ["use_independent_chat_permissions"]);
  return payload;
});

const promoteChatMemberHandler = telegramOkHandler("promoteChatMember", (params) => {
  const payload = makeChatUserPayload(params);
  addOptionalBooleans(payload, params, [
    "is_anonymous",
    "can_manage_chat",
    "can_delete_messages",
    "can_manage_video_chats",
    "can_restrict_members",
    "can_promote_members",
    "can_change_info",
    "can_invite_users",
    "can_post_stories",
    "can_edit_stories",
    "can_delete_stories",
    "can_post_messages",
    "can_edit_messages",
    "can_pin_messages",
    "can_manage_topics",
  ]);
  return payload;
});

const pinChatMessageHandler = telegramOkHandler("pinChatMessage", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    message_id: requiredInt(params, "message_id"),
  };
  addOptionalBooleans(payload, params, ["disable_notification"]);
  return payload;
});

const unpinChatMessageHandler = telegramOkHandler("unpinChatMessage", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
  };
  const messageId = optionalInt(params, "message_id");
  if (messageId !== undefined) payload.message_id = messageId;
  return payload;
});

const baseOutputs = [
  { name: "ok", type: "boolean", description: "Whether Telegram accepted the operation." },
  { name: "result", type: "any", description: "Raw Telegram result." },
];

const telegramRuntime = {
  execution: "local" as const,
  sideEffects: true,
  allowNetwork: true,
};

const chatUserInputs: ModularActionDefinition["inputs"] = [
  { name: "chat_id", type: "string", required: true, description: "Target group/channel chat ID." },
  { name: "user_id", type: "integer", required: true, description: "Target user ID." },
];

const restrictPermissionInputs: ModularActionDefinition["inputs"] = [
  { name: "can_send_messages", type: "boolean", default: false, description: "Allow text messages." },
  { name: "can_send_audios", type: "boolean", default: false, description: "Allow audios." },
  { name: "can_send_documents", type: "boolean", default: false, description: "Allow documents." },
  { name: "can_send_photos", type: "boolean", default: false, description: "Allow photos." },
  { name: "can_send_videos", type: "boolean", default: false, description: "Allow videos." },
  { name: "can_send_video_notes", type: "boolean", default: false, description: "Allow video notes." },
  { name: "can_send_voice_notes", type: "boolean", default: false, description: "Allow voice notes." },
  { name: "can_send_polls", type: "boolean", default: false, description: "Allow polls." },
  { name: "can_send_other_messages", type: "boolean", default: false, description: "Allow other messages." },
  { name: "can_add_web_page_previews", type: "boolean", default: false, description: "Allow web page previews." },
  { name: "can_change_info", type: "boolean", default: false, description: "Allow changing info." },
  { name: "can_invite_users", type: "boolean", default: false, description: "Allow inviting users." },
  { name: "can_pin_messages", type: "boolean", default: false, description: "Allow pinning messages." },
  { name: "can_manage_topics", type: "boolean", default: false, description: "Allow managing topics." },
  { name: "use_independent_chat_permissions", type: "boolean", default: true, description: "Use independent permissions." },
  { name: "until_date", type: "integer", default: null, description: "Restriction end timestamp. Empty means forever." },
];

const promotePermissionInputs: ModularActionDefinition["inputs"] = [
  { name: "is_anonymous", type: "boolean", default: false, description: "Administrator is anonymous." },
  { name: "can_manage_chat", type: "boolean", default: true, description: "Can manage chat." },
  { name: "can_delete_messages", type: "boolean", default: false, description: "Can delete messages." },
  { name: "can_manage_video_chats", type: "boolean", default: false, description: "Can manage video chats." },
  { name: "can_restrict_members", type: "boolean", default: false, description: "Can restrict members." },
  { name: "can_promote_members", type: "boolean", default: false, description: "Can promote members." },
  { name: "can_change_info", type: "boolean", default: false, description: "Can change info." },
  { name: "can_invite_users", type: "boolean", default: false, description: "Can invite users." },
  { name: "can_post_stories", type: "boolean", default: false, description: "Can post stories." },
  { name: "can_edit_stories", type: "boolean", default: false, description: "Can edit stories." },
  { name: "can_delete_stories", type: "boolean", default: false, description: "Can delete stories." },
  { name: "can_post_messages", type: "boolean", default: false, description: "Channel only: can post messages." },
  { name: "can_edit_messages", type: "boolean", default: false, description: "Channel only: can edit messages." },
  { name: "can_pin_messages", type: "boolean", default: false, description: "Can pin messages." },
  { name: "can_manage_topics", type: "boolean", default: false, description: "Can manage topics." },
];

function makeDefinition(input: {
  id: string;
  name: string;
  zhName: string;
  description: string;
  inputs: ModularActionDefinition["inputs"];
  icon: string;
  color: string;
}): ModularActionDefinition {
  return {
    id: input.id,
    version: "1.0.0",
    name: input.name,
    description: input.description,
    category: "telegram",
    tags: ["telegram", "admin", "member"],
    inputs: input.inputs,
    outputs: baseOutputs,
    i18n: {
      name: { "zh-CN": input.zhName, "en-US": input.name },
      description: { "zh-CN": input.description, "en-US": input.description },
    },
    ui: { icon: input.icon, color: input.color, group: "telegram" },
    runtime: telegramRuntime,
    compatibility: { engineVersion: ">=0.1.0" },
  };
}

export const TELEGRAM_ADMIN_NODE_PACKAGES: NodePackage[] = [
  {
    definition: makeDefinition({
      id: "ban_chat_member",
      name: "Ban Chat Member",
      zhName: "封禁用户",
      description: "Ban a user from a group or channel.",
      icon: "user-x",
      color: "#ef4444",
      inputs: [
        ...chatUserInputs,
        { name: "until_date", type: "integer", default: null, description: "Ban end timestamp. Empty means forever." },
        { name: "revoke_messages", type: "boolean", default: true, description: "Delete recent user messages." },
      ],
    }),
    handler: banChatMemberHandler,
  },
  {
    definition: makeDefinition({
      id: "unban_chat_member",
      name: "Unban Chat Member",
      zhName: "解封用户",
      description: "Unban a previously banned user.",
      icon: "user-check",
      color: "#22c55e",
      inputs: [
        ...chatUserInputs,
        { name: "only_if_banned", type: "boolean", default: false, description: "Only unban if currently banned." },
      ],
    }),
    handler: unbanChatMemberHandler,
  },
  {
    definition: makeDefinition({
      id: "restrict_chat_member",
      name: "Restrict Chat Member",
      zhName: "限制用户权限",
      description: "Restrict user permissions in a group or channel.",
      icon: "shield",
      color: "#f97316",
      inputs: [...chatUserInputs, ...restrictPermissionInputs],
    }),
    handler: restrictChatMemberHandler,
  },
  {
    definition: makeDefinition({
      id: "promote_chat_member",
      name: "Promote Chat Member",
      zhName: "提升管理员",
      description: "Promote a user to administrator or update admin rights.",
      icon: "shield-check",
      color: "#6366f1",
      inputs: [...chatUserInputs, ...promotePermissionInputs],
    }),
    handler: promoteChatMemberHandler,
  },
  {
    definition: makeDefinition({
      id: "pin_chat_message",
      name: "Pin Chat Message",
      zhName: "置顶消息",
      description: "Pin a message in a group, supergroup, or channel.",
      icon: "pin",
      color: "#eab308",
      inputs: [
        { name: "chat_id", type: "string", required: true, description: "Target chat ID." },
        { name: "message_id", type: "integer", required: true, description: "Message ID to pin." },
        { name: "disable_notification", type: "boolean", default: false, description: "Pin silently." },
      ],
    }),
    handler: pinChatMessageHandler,
  },
  {
    definition: makeDefinition({
      id: "unpin_chat_message",
      name: "Unpin Chat Message",
      zhName: "取消置顶",
      description: "Unpin a specific message or the most recent pinned message.",
      icon: "pin-off",
      color: "#64748b",
      inputs: [
        { name: "chat_id", type: "string", required: true, description: "Target chat ID." },
        { name: "message_id", type: "integer", default: null, description: "Optional message ID to unpin." },
      ],
    }),
    handler: unpinChatMessageHandler,
  },
];

export default TELEGRAM_ADMIN_NODE_PACKAGES;
