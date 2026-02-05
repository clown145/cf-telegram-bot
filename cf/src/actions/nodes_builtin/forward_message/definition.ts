import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "forward_message",
  version: "1.0.0",
  name: "转发消息",
  description: "从一个聊天转发指定消息到目标聊天，并输出 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "forward"],
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
    name: { "zh-CN": "转发消息", "en-US": "Forward Message" },
    description: {
      "zh-CN": "从一个聊天转发指定消息到目标聊天，并输出 message_id。",
      "en-US": "Forward a message from another chat and output message_id.",
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
    icon: "forward_to_inbox",
    color: "#22c55e",
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

