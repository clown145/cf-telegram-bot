import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "get_chat",
  version: "1.0.0",
  name: "Get Chat",
  description: "Fetch Telegram chat metadata.",
  category: "telegram",
  tags: ["telegram", "chat"],
  inputs: [
    {
      name: "chat_id",
      type: "string",
      default: "{{ runtime.chat_id }}",
      required: true,
      description: "Target chat id.",
    },
  ],
  outputs: [
    { name: "chat", type: "any", description: "Raw getChat result." },
    { name: "chat_id", type: "string", description: "Chat id." },
    { name: "chat_type", type: "string", description: "Chat type." },
    { name: "title", type: "string", description: "Chat title." },
    { name: "username", type: "string", description: "Public username." },
    { name: "is_forum", type: "boolean", description: "Whether this chat is forum-enabled." },
  ],
  i18n: {
    name: { "zh-CN": "获取聊天信息", "en-US": "Get Chat" },
    description: {
      "zh-CN": "获取 Telegram 聊天元数据。",
      "en-US": "Fetch Telegram chat metadata.",
    },
    inputs: {
      chat_id: { label: { "zh-CN": "Chat ID", "en-US": "Chat ID" } },
    },
    outputs: {
      chat: { label: { "zh-CN": "聊天详情", "en-US": "Chat" } },
      chat_id: { label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" } },
      chat_type: { label: { "zh-CN": "聊天类型", "en-US": "Chat Type" } },
      title: { label: { "zh-CN": "标题", "en-US": "Title" } },
      username: { label: { "zh-CN": "用户名", "en-US": "Username" } },
      is_forum: { label: { "zh-CN": "论坛模式", "en-US": "Is Forum" } },
    },
  },
  ui: {
    icon: "message-circle",
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