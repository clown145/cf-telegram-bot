import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "delete_message",
  version: "1.0.0",
  name: "删除消息",
  description: "根据 chat_id 和 message_id 删除消息。",
  category: "messaging",
  tags: ["telegram", "message", "delete"],
  inputs: [
    {
      name: "chat_id",
      type: "string",
      required: true,
      description: "消息所在聊天 ID。",
    },
    {
      name: "message_id",
      type: "integer",
      required: true,
      description: "消息 ID。",
    },
  ],
  outputs: [],
  i18n: {
    name: { "zh-CN": "删除消息", "en-US": "Delete Message" },
    description: { "zh-CN": "根据 chat_id 和 message_id 删除消息。", "en-US": "Delete a message by chat_id and message_id." },
    inputs: {
      chat_id: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "消息所在聊天 ID。", "en-US": "Chat ID of the message." },
      },
      message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "要删除的消息 ID。", "en-US": "Message ID to delete." },
      },
    },
  },
  ui: {
    icon: "trash",
    color: "#f87171",
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
