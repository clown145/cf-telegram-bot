import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "send_media_group",
  version: "1.0.0",
  name: "发送媒体组",
  description: "发送多媒体组（图片/视频），输出首条 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "media_group"],
  inputs: [
    {
      name: "media",
      type: "array",
      required: true,
      description: "媒体数组（可为 JSON 字符串）。支持 photo/video。",
    },
    {
      name: "chat_id",
      type: "string",
      required: true,
      description: "目标聊天 ID。",
    },
    {
      name: "parse_mode",
      type: "string",
      required: false,
      default: "html",
      description: "caption 解析模式。",
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
      description: "首条消息 ID。",
    },
  ],
  i18n: {
    name: { "zh-CN": "发送媒体组", "en-US": "Send Media Group" },
    description: {
      "zh-CN": "发送多媒体组（图片/视频），输出首条 message_id。",
      "en-US": "Send media group (photo/video) and output first message_id.",
    },
    inputs: {
      media: {
        label: { "zh-CN": "媒体列表", "en-US": "Media List" },
        description: { "zh-CN": "媒体数组或 JSON 字符串。", "en-US": "Media array or JSON string." },
      },
      chat_id: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "目标聊天 ID。", "en-US": "Target chat ID." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "caption 解析模式。", "en-US": "Caption parse mode." },
      },
    },
    outputs: {
      message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "首条消息 ID。", "en-US": "First message ID." },
      },
    },
  },
  ui: {
    icon: "image",
    color: "#34d399",
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
