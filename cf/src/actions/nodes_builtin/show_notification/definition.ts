import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "show_notification",
  version: "1.0.0",
  name: "显示弹窗通知",
  description: "在 Telegram 客户端顶部显示弹窗通知。",
  category: "messaging",
  tags: ["notification", "telegram"],
  inputs: [
    {
      name: "text",
      type: "string",
      description: "要显示的通知内容。",
      default: "操作成功",
    },
    {
      name: "show_alert",
      type: "boolean",
      description: "是否以 alert 弹窗显示（强制确认）。",
      default: false,
    },
  ],
  outputs: [],
  i18n: {
    name: { "zh-CN": "显示弹窗通知", "en-US": "Show Notification" },
    description: { "zh-CN": "在 Telegram 客户端顶部显示弹窗通知。", "en-US": "Show a notification on Telegram client." },
    inputs: {
      text: {
        label: { "zh-CN": "通知文本", "en-US": "Text" },
        description: { "zh-CN": "要显示的通知内容。", "en-US": "Notification text." },
      },
      show_alert: {
        label: { "zh-CN": "弹窗提示", "en-US": "Show Alert" },
        description: { "zh-CN": "是否以 alert 弹窗显示。", "en-US": "Show as alert dialog." },
      },
    },
  },
  ui: {
    icon: "bell",
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
