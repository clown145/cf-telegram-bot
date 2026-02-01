import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "send_message",
  version: "1.0.0",
  name: "发送新消息",
  description: "发送新消息或媒体，并输出 message_id。",
  category: "messaging",
  tags: ["telegram", "message", "send"],
  inputs: [
    {
      name: "text",
      type: "string",
      required: false,
      description: "要发送的文本内容。",
    },
    {
      name: "image_source",
      type: "string",
      required: false,
      description: "要发送的本地图片路径（可用 cache_from_url 获取）。",
    },
    {
      name: "voice_source",
      type: "string",
      required: false,
      description: "要发送的本地语音路径。",
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
      description: "解析模式。",
      enum: ["html", "markdown", "markdownv2", "plain"],
      enum_labels: {
        html: "HTML（默认）",
        markdown: "Markdown",
        markdownv2: "MarkdownV2",
        plain: "纯文本",
      },
    },
    {
      name: "no_cache_media",
      type: "boolean",
      required: false,
      default: true,
      description: "是否为媒体 URL 禁用缓存（破解缓存）。",
    },
  ],
  outputs: [
    {
      name: "message_id",
      type: "integer",
      description: "新消息的 ID。",
    },
  ],
  i18n: {
    name: { "zh-CN": "发送新消息", "en-US": "Send Message" },
    description: { "zh-CN": "发送新消息或媒体，并输出 message_id。", "en-US": "Send message/media and output message_id." },
    inputs: {
      text: {
        label: { "zh-CN": "文本", "en-US": "Text" },
        description: { "zh-CN": "要发送的文本内容。", "en-US": "Message text." },
      },
      image_source: {
        label: { "zh-CN": "图片路径", "en-US": "Image Path" },
        description: { "zh-CN": "本地图片路径。", "en-US": "Local image path." },
      },
      voice_source: {
        label: { "zh-CN": "语音路径", "en-US": "Voice Path" },
        description: { "zh-CN": "本地语音路径。", "en-US": "Local voice path." },
      },
      chat_id: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "目标聊天 ID。", "en-US": "Target chat ID." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "文本解析模式。", "en-US": "Text parse mode." },
      },
      no_cache_media: {
        label: { "zh-CN": "禁用媒体缓存", "en-US": "Disable Media Cache" },
        description: { "zh-CN": "自动为远程图片/语音 URL 追加随机参数以避免缓存重复。", "en-US": "Automatically add a random query param to remote URLs to bypass caching." },
      },
    },
    outputs: {
      message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "新消息的 ID。", "en-US": "New message ID." },
      },
    },
  },
  ui: {
    icon: "send",
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
