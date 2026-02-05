import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "send_audio",
  version: "1.0.0",
  name: "发送音频",
  description: "发送音频文件，并输出 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "audio"],
  inputs: [
    {
      name: "audio_source",
      type: "string",
      required: true,
      description: "音频来源（R2 路径 / Telegram file_id / URL）。",
    },
    {
      name: "caption",
      type: "string",
      required: false,
      description: "音频说明文本（可选）。",
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
    {
      name: "filename",
      type: "string",
      required: false,
      description: "上传时使用的文件名（仅本地 R2 文件有效）。",
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
    name: { "zh-CN": "发送音频", "en-US": "Send Audio" },
    description: { "zh-CN": "发送音频文件，并输出 message_id。", "en-US": "Send an audio file and output message_id." },
    inputs: {
      audio_source: {
        label: { "zh-CN": "音频来源", "en-US": "Audio Source" },
        description: { "zh-CN": "R2 路径 / Telegram file_id / URL。", "en-US": "R2 path, Telegram file_id, or URL." },
      },
      caption: {
        label: { "zh-CN": "说明文本", "en-US": "Caption" },
        description: { "zh-CN": "音频说明文本（可选）。", "en-US": "Caption text (optional)." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "caption 解析模式。", "en-US": "Caption parse mode." },
      },
      filename: {
        label: { "zh-CN": "文件名", "en-US": "Filename" },
        description: { "zh-CN": "仅本地 R2 文件有效。", "en-US": "Only for local R2 files." },
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
    icon: "music_note",
    color: "#a78bfa",
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

