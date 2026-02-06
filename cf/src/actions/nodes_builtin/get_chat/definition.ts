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
    name: { "zh-CN": "\u83b7\u53d6\u804a\u5929\u4fe1\u606f", "en-US": "Get Chat" },
    description: {
      "zh-CN": "\u83b7\u53d6 Telegram \u804a\u5929\u5143\u6570\u636e\u3002",
      "en-US": "Fetch Telegram chat metadata.",
    },
    inputs: {
      chat_id: { label: { "zh-CN": "Chat ID", "en-US": "Chat ID" } },
    },
    outputs: {
      chat: { label: { "zh-CN": "\u804a\u5929\u8be6\u60c5", "en-US": "Chat" } },
      chat_id: { label: { "zh-CN": "\u804a\u5929 ID", "en-US": "Chat ID" } },
      chat_type: { label: { "zh-CN": "\u804a\u5929\u7c7b\u578b", "en-US": "Chat Type" } },
      title: { label: { "zh-CN": "\u6807\u9898", "en-US": "Title" } },
      username: { label: { "zh-CN": "\u7528\u6237\u540d", "en-US": "Username" } },
      is_forum: { label: { "zh-CN": "\u8bba\u575b\u6a21\u5f0f", "en-US": "Is Forum" } },
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
