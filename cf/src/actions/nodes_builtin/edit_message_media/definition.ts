import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "edit_message_media",
  version: "1.0.0",
  name: "编辑媒体消息",
  description: "更新已存在媒体消息的图片/语音或说明文字。",
  category: "messaging",
  tags: ["telegram", "media", "edit"],
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
      required: false,
      description: "新的说明文字（caption）。",
    },
    {
      name: "image_source",
      type: "string",
      required: false,
      description: "本地图片路径（优先于语音）。",
    },
    {
      name: "voice_source",
      type: "string",
      required: false,
      description: "本地语音路径。",
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
    name: { "zh-CN": "编辑媒体消息", "en-US": "Edit Message Media" },
    description: { "zh-CN": "更新已存在媒体消息的图片/语音或说明文字。", "en-US": "Edit media (photo/voice) or caption of a message." },
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
        label: { "zh-CN": "说明文字", "en-US": "Caption" },
        description: { "zh-CN": "新的说明文字（caption）。", "en-US": "New caption text." },
      },
      image_source: {
        label: { "zh-CN": "图片路径", "en-US": "Image Path" },
        description: { "zh-CN": "本地图片路径（优先于语音）。", "en-US": "Local image path (preferred)." },
      },
      voice_source: {
        label: { "zh-CN": "语音路径", "en-US": "Voice Path" },
        description: { "zh-CN": "本地语音路径。", "en-US": "Local voice path." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "说明文字解析模式。", "en-US": "Caption parse mode." },
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
    icon: "image",
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
