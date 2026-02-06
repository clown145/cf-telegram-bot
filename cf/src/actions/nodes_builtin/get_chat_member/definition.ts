import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "get_chat_member",
  version: "1.0.0",
  name: "Get Chat Member",
  description: "Fetch a member's permission status in a chat.",
  category: "telegram",
  tags: ["telegram", "chat", "permission"],
  inputs: [
    {
      name: "chat_id",
      type: "string",
      default: "{{ runtime.chat_id }}",
      required: true,
      description: "Target chat id.",
    },
    {
      name: "user_id",
      type: "string",
      default: "{{ runtime.user_id }}",
      required: true,
      description: "Target user id.",
    },
  ],
  outputs: [
    { name: "chat_member", type: "any", description: "Raw getChatMember result." },
    { name: "status", type: "string", description: "Normalized member status." },
    { name: "is_admin", type: "boolean", description: "Whether user is admin or owner." },
    { name: "is_owner", type: "boolean", description: "Whether user is owner." },
    { name: "is_member", type: "boolean", description: "Whether user currently belongs to the chat." },
    { name: "is_restricted", type: "boolean", description: "Whether user is restricted." },
    { name: "is_left", type: "boolean", description: "Whether user left the chat." },
    { name: "is_banned", type: "boolean", description: "Whether user is banned (kicked)." },
  ],
  i18n: {
    name: { "zh-CN": "获取群成员信息", "en-US": "Get Chat Member" },
    description: {
      "zh-CN": "获取用户在群聊中的成员状态与权限。",
      "en-US": "Fetch a member's permission status in a chat.",
    },
    inputs: {
      chat_id: { label: { "zh-CN": "Chat ID", "en-US": "Chat ID" } },
      user_id: { label: { "zh-CN": "User ID", "en-US": "User ID" } },
    },
    outputs: {
      chat_member: { label: { "zh-CN": "成员详情", "en-US": "Chat Member" } },
      status: { label: { "zh-CN": "状态", "en-US": "Status" } },
      is_admin: { label: { "zh-CN": "是否管理员", "en-US": "Is Admin" } },
      is_owner: { label: { "zh-CN": "是否群主", "en-US": "Is Owner" } },
      is_member: { label: { "zh-CN": "是否在群内", "en-US": "Is Member" } },
      is_restricted: { label: { "zh-CN": "是否受限", "en-US": "Is Restricted" } },
      is_left: { label: { "zh-CN": "是否已离开", "en-US": "Is Left" } },
      is_banned: { label: { "zh-CN": "是否封禁", "en-US": "Is Banned" } },
    },
  },
  ui: {
    icon: "shield",
    color: "#22c55e",
    group: "Telegram",
  },
  runtime: {
    execution: "local",
    sideEffects: false,
    allowNetwork: true,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};