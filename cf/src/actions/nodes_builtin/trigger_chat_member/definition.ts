import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "trigger_chat_member",
  version: "1.0.0",
  name: "Trigger: Chat Member",
  description: "Trigger workflow on Telegram chat_member update.",
  category: "trigger",
  tags: ["trigger", "chat_member"],
  inputs: [
    {
      name: "enabled",
      type: "boolean",
      default: true,
      description: "Enable this trigger.",
    },
    {
      name: "priority",
      type: "integer",
      default: 100,
      description: "Higher value runs first.",
    },
    {
      name: "from_status",
      type: "string",
      default: "",
      description: "Optional old status filter.",
      placeholder: "member",
    },
    {
      name: "to_status",
      type: "string",
      default: "",
      description: "Optional new status filter.",
      placeholder: "administrator",
    },
    {
      name: "chat_type",
      type: "string",
      default: "",
      description: "Optional chat type filter, e.g. private/group/supergroup/channel.",
      placeholder: "group",
    },
  ],
  outputs: [{ name: "event", type: "any", description: "Trigger event payload." }],
  i18n: {
    name: { "zh-CN": "\u89e6\u53d1\u5668\uff1a\u6210\u5458\u72b6\u6001", "en-US": "Trigger: Chat Member" },
    description: {
      "zh-CN": "\u5f53\u6536\u5230 Telegram chat_member \u66f4\u65b0\u65f6\u89e6\u53d1\u5de5\u4f5c\u6d41\u3002",
      "en-US": "Trigger workflow on Telegram chat_member update.",
    },
    inputs: {
      enabled: { label: { "zh-CN": "\u542f\u7528", "en-US": "Enabled" } },
      priority: { label: { "zh-CN": "\u4f18\u5148\u7ea7", "en-US": "Priority" } },
      from_status: { label: { "zh-CN": "\u539f\u72b6\u6001", "en-US": "From Status" } },
      to_status: { label: { "zh-CN": "\u65b0\u72b6\u6001", "en-US": "To Status" } },
      chat_type: { label: { "zh-CN": "\u4f1a\u8bdd\u7c7b\u578b", "en-US": "Chat Type" } },
    },
    outputs: {
      event: { label: { "zh-CN": "\u4e8b\u4ef6", "en-US": "Event" } },
    },
  },
  ui: {
    icon: "bolt",
    color: "#a855f7",
    group: "trigger",
    order: 4,
  },
  runtime: {
    execution: "local",
    sideEffects: false,
    allowNetwork: false,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
