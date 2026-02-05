import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "send_animation",
  version: "1.0.0",
  name: "发送动图",
  description: "发送 GIF/动画，并输出 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "animation"],
  inputs: [
    {
      name: "animation_source",
      type: "string",
      required: true,
      description: "动画来源（R2 路径 / Telegram file_id / URL）。",
    },
    {
      name: "caption",
      type: "string",
      required: false,
      description: "说明文本（可选）。",
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
    name: { "zh-CN": "发送动图", "en-US": "Send Animation" },
    description: { "zh-CN": "发送 GIF/动画，并输出 message_id。", "en-US": "Send an animation (GIF) and output message_id." },
    inputs: {
      animation_source: {
        label: { "zh-CN": "动画来源", "en-US": "Animation Source" },
        description: { "zh-CN": "R2 路径 / Telegram file_id / URL。", "en-US": "R2 path, Telegram file_id, or URL." },
      },
      caption: {
        label: { "zh-CN": "说明文本", "en-US": "Caption" },
        description: { "zh-CN": "说明文本（可选）。", "en-US": "Caption text (optional)." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "caption 解析模式。", "en-US": "Caption parse mode." },
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
    icon: "gif_box",
    color: "#f472b6",
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
