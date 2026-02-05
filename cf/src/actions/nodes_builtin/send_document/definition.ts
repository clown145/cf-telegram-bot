import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "send_document",
  version: "1.0.0",
  name: "发送文件",
  description: "发送文件/文档并输出 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "document"],
  inputs: [
    {
      name: "document_source",
      type: "string",
      required: true,
      description: "文件来源（R2 路径、Telegram file_id 或 URL）。",
    },
    {
      name: "caption",
      type: "string",
      required: false,
      description: "文件说明文本。",
    },
    {
      name: "parse_mode",
      type: "string",
      required: false,
      default: "html",
      description: "说明文本解析模式。",
      enum: ["html", "markdown", "markdownv2", "plain"],
      enum_labels: {
        html: "HTML（默认）",
        markdown: "Markdown",
        markdownv2: "MarkdownV2",
        plain: "纯文本",
      },
    },
    {
      name: "filename",
      type: "string",
      required: false,
      description: "上传时使用的文件名（仅本地 R2 文件有效）。",
    },
    {
      name: "reply_to_message_id",
      type: "integer",
      required: false,
      default: null,
      label: "回复消息 ID",
      description: "回复指定消息（可选）。",
    },
    {
      name: "chat_id",
      type: "string",
      required: true,
      description: "目标聊天 ID。",
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
    name: { "zh-CN": "发送文件", "en-US": "Send Document" },
    description: {
      "zh-CN": "发送文件/文档并输出 message_id。",
      "en-US": "Send a document and output message_id.",
    },
    inputs: {
      document_source: {
        label: { "zh-CN": "文件来源", "en-US": "Document Source" },
        description: {
          "zh-CN": "R2 路径、Telegram file_id 或 URL。",
          "en-US": "R2 path, Telegram file_id, or URL.",
        },
      },
      caption: {
        label: { "zh-CN": "说明文本", "en-US": "Caption" },
        description: { "zh-CN": "文件说明文本。", "en-US": "Caption text." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "说明文本解析模式。", "en-US": "Caption parse mode." },
      },
      filename: {
        label: { "zh-CN": "文件名", "en-US": "Filename" },
        description: {
          "zh-CN": "仅本地 R2 文件有效。",
          "en-US": "Only for local R2 files.",
        },
      },
      chat_id: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "目标聊天 ID。", "en-US": "Target chat ID." },
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
    icon: "file",
    color: "#60a5fa",
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
