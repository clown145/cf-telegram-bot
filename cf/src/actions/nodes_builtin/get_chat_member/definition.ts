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
    name: { "zh-CN": "\u83b7\u53d6\u7fa4\u6210\u5458\u4fe1\u606f", "en-US": "Get Chat Member" },
    description: {
      "zh-CN": "\u83b7\u53d6\u7528\u6237\u5728\u7fa4\u804a\u4e2d\u7684\u6210\u5458\u72b6\u6001\u4e0e\u6743\u9650\u3002",
      "en-US": "Fetch a member's permission status in a chat.",
    },
    inputs: {
      chat_id: { label: { "zh-CN": "Chat ID", "en-US": "Chat ID" } },
      user_id: { label: { "zh-CN": "User ID", "en-US": "User ID" } },
    },
    outputs: {
      chat_member: { label: { "zh-CN": "\u6210\u5458\u8be6\u60c5", "en-US": "Chat Member" } },
      status: { label: { "zh-CN": "\u72b6\u6001", "en-US": "Status" } },
      is_admin: { label: { "zh-CN": "\u662f\u5426\u7ba1\u7406\u5458", "en-US": "Is Admin" } },
      is_owner: { label: { "zh-CN": "\u662f\u5426\u7fa4\u4e3b", "en-US": "Is Owner" } },
      is_member: { label: { "zh-CN": "\u662f\u5426\u5728\u7fa4\u5185", "en-US": "Is Member" } },
      is_restricted: { label: { "zh-CN": "\u662f\u5426\u53d7\u9650", "en-US": "Is Restricted" } },
      is_left: { label: { "zh-CN": "\u662f\u5426\u5df2\u79bb\u5f00", "en-US": "Is Left" } },
      is_banned: { label: { "zh-CN": "\u662f\u5426\u5c01\u7981", "en-US": "Is Banned" } },
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
