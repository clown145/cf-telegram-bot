import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "trigger_my_chat_member",
  version: "1.0.0",
  name: "Trigger: My Chat Member",
  description: "Trigger workflow on Telegram my_chat_member update.",
  category: "trigger",
  tags: ["trigger", "my_chat_member"],
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
    name: { "zh-CN": "触发器：Bot 成员状态", "en-US": "Trigger: My Chat Member" },
    description: {
      "zh-CN": "当收到 Telegram my_chat_member 更新时触发工作流。",
      "en-US": "Trigger workflow on Telegram my_chat_member update.",
    },
    inputs: {
      enabled: { label: { "zh-CN": "启用", "en-US": "Enabled" } },
      priority: { label: { "zh-CN": "优先级", "en-US": "Priority" } },
      from_status: { label: { "zh-CN": "原状态", "en-US": "From Status" } },
      to_status: { label: { "zh-CN": "新状态", "en-US": "To Status" } },
      chat_type: { label: { "zh-CN": "会话类型", "en-US": "Chat Type" } },
    },
    outputs: {
      event: { label: { "zh-CN": "事件", "en-US": "Event" } },
    },
  },
  ui: {
    icon: "bolt",
    color: "#a855f7",
    group: "trigger",
    order: 5,
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

