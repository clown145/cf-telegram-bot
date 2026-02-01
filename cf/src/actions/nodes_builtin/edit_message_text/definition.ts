import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "edit_message_text",
  version: "1.0.0",
  name: "编辑消息文本",
  description: "通过 message_id 更新消息文本。",
  category: "messaging",
  tags: ["telegram", "message", "edit"],
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
    {
      name: "text",
      type: "string",
      required: true,
      description: "新的文本内容。",
    },
    {
      name: "parse_mode",
      type: "string",
      required: false,
      default: "html",
      description: "解析模式。",
      enum: ["html", "markdown", "markdownv2", "plain"],
      enum_labels: {
        html: "HTML（默认）",
        markdown: "Markdown",
        markdownv2: "MarkdownV2",
        plain: "纯文本",
      },
    },
  ],
  outputs: [
    {
      name: "message_id",
      type: "integer",
      description: "编辑后的消息 ID。",
    },
  ],
  i18n: {
    name: { "zh-CN": "编辑消息文本", "en-US": "Edit Message Text" },
    description: { "zh-CN": "通过 message_id 更新消息文本。", "en-US": "Edit message text by message_id." },
    inputs: {
      chat_id: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "消息所在聊天 ID。", "en-US": "Chat ID of the message." },
      },
      message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "要编辑的消息 ID。", "en-US": "Message ID to edit." },
      },
      text: {
        label: { "zh-CN": "文本", "en-US": "Text" },
        description: { "zh-CN": "新的文本内容。", "en-US": "New text content." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "文本解析模式。", "en-US": "Text parse mode." },
      },
    },
    outputs: {
      message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "编辑后的消息 ID。", "en-US": "Edited message ID." },
      },
    },
  },
  ui: {
    icon: "edit",
    color: "#38bdf8",
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
