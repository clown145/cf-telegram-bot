import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "copy_message",
  version: "1.0.0",
  name: "复制消息",
  description: "从一个聊天复制指定消息到目标聊天（不带“转发自”），并输出 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "copy"],
  inputs: [
    {
      name: "chat_id",
      type: "string",
      required: true,
      description: "目标聊天 ID。",
    },
    {
      name: "from_chat_id",
      type: "string",
      required: true,
      description: "来源聊天 ID。",
    },
    {
      name: "message_id",
      type: "integer",
      required: true,
      description: "来源消息 ID。",
    },
  ],
  outputs: [
    {
      name: "message_id",
      type: "integer",
      description: "新消息 ID。",
    },
  ],
  i18n: {
    name: { "zh-CN": "复制消息", "en-US": "Copy Message" },
    description: {
      "zh-CN": "从一个聊天复制指定消息到目标聊天（不带“转发自”），并输出 message_id。",
      "en-US": "Copy a message from another chat (without forward attribution) and output message_id.",
    },
    inputs: {
      chat_id: {
        label: { "zh-CN": "目标聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "目标聊天 ID。", "en-US": "Target chat ID." },
      },
      from_chat_id: {
        label: { "zh-CN": "来源聊天 ID", "en-US": "From Chat ID" },
        description: { "zh-CN": "来源聊天 ID。", "en-US": "Source chat ID." },
      },
      message_id: {
        label: { "zh-CN": "来源消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "来源消息 ID。", "en-US": "Source message ID." },
      },
    },
    outputs: {
      message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "新消息 ID。", "en-US": "New message ID." },
      },
    },
  },
  ui: {
    icon: "content_copy",
    color: "#06b6d4",
    group: "消息",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: true,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};

