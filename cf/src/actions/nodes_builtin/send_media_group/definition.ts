import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "send_media_group",
  version: "1.0.0",
  name: "发送媒体组",
  description: "发送多媒体组（图片/视频/音频/文档），输出首条消息的 message_id（最多 10 条）。",
  category: "messaging",
  tags: ["telegram", "message", "media_group"],
  inputs: [
    {
      name: "media",
      type: "array",
      required: true,
      description:
        "媒体条目数组，或 JSON 字符串。每条示例：{ type, media, caption?, parse_mode? }；type 支持 photo/video/audio/document；最多 10 条。",
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
      description: "默认 caption 的解析模式；可被 media 条目的 parse_mode 覆盖。",
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
      "zh-CN": "发送多媒体组（图片/视频/音频/文档），输出首条消息的 message_id（最多 10 条）。",
      "en-US": "Send a media group (photo/video/audio/document), output the first message_id (max 10 items).",
    },
    inputs: {
      media: {
        label: { "zh-CN": "媒体列表", "en-US": "Media List" },
        description: {
          "zh-CN":
            "媒体条目数组，或 JSON 字符串。每条：{ type, media, caption?, parse_mode? }；type 支持 photo/video/audio/document；最多 10 条。",
          "en-US":
            "Media array or JSON string. Each item: { type, media, caption?, parse_mode? }. Supports photo/video/audio/document. Max 10 items.",
        },
      },
      chat_id: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "目标聊天 ID。", "en-US": "Target chat ID." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: {
          "zh-CN": "默认 caption 的解析模式；可被 media 条目的 parse_mode 覆盖。",
          "en-US": "Default caption parse mode. Can be overridden per media item via entry.parse_mode.",
        },
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
