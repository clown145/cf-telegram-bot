import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "update_message",
  version: "1.0.0",
  name: "更新菜单标题",
  description: "更新当前菜单标题或消息文本。",
  category: "messaging",
  tags: ["message", "update"],
  inputs: [
    {
      name: "text",
      type: "string",
      description: "要显示的新文本。",
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
  outputs: [],
  i18n: {
    name: { "zh-CN": "更新菜单标题", "en-US": "Update Message" },
    description: { "zh-CN": "更新当前菜单标题或消息文本。", "en-US": "Update current menu title or message text." },
    inputs: {
      text: {
        label: { "zh-CN": "文本", "en-US": "Text" },
        description: { "zh-CN": "要显示的新文本。", "en-US": "New text to display." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "文本解析模式。", "en-US": "Text parse mode." },
      },
    },
  },
  ui: {
    icon: "edit",
    color: "#f59e0b",
    group: "消息",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: false,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
