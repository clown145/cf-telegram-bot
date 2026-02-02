import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "trigger_button",
  version: "1.0.0",
  name: "触发器：按钮",
  description: "当点击指定按钮时触发工作流（优先于按钮原绑定行为）。",
  category: "trigger",
  tags: ["trigger", "button"],
  inputs: [
    {
      name: "enabled",
      type: "boolean",
      default: true,
      description: "是否启用该触发器。",
    },
    {
      name: "priority",
      type: "integer",
      default: 100,
      description: "优先级，数字越大越先执行。",
    },
    {
      name: "button_id",
      type: "button",
      required: true,
      options_source: "buttons",
      description: "要监听的按钮 ID。",
    },
    {
      name: "menu_id",
      type: "menu",
      options_source: "menus",
      description: "可选，限定菜单范围。",
    },
  ],
  outputs: [
    { name: "event", type: "any", description: "触发事件对象（用于确立执行顺序或传递上下文）。" },
    { name: "chat_id", type: "string", description: "聊天 ID。" },
    { name: "user_id", type: "string", description: "用户 ID。" },
    { name: "message_id", type: "integer", description: "消息 ID。" },
    { name: "chat_type", type: "string", description: "private / group / supergroup / channel。" },
    { name: "username", type: "string", description: "用户名（如果有）。" },
    { name: "full_name", type: "string", description: "用户全名。" },
    { name: "button_id", type: "string", description: "按钮 ID。" },
    { name: "button_text", type: "string", description: "按钮文案。" },
    { name: "callback_data", type: "string", description: "原始 callback_data。" },
  ],
  i18n: {
    name: { "zh-CN": "触发器：按钮", "en-US": "Trigger: Button" },
    description: { "zh-CN": "当点击指定按钮时触发工作流。", "en-US": "Trigger workflow on a button click." },
    inputs: {
      enabled: { label: { "zh-CN": "启用", "en-US": "Enabled" } },
      priority: { label: { "zh-CN": "优先级", "en-US": "Priority" } },
      button_id: { label: { "zh-CN": "按钮", "en-US": "Button" } },
      menu_id: { label: { "zh-CN": "菜单范围", "en-US": "Menu Scope" } },
    },
    outputs: {
      event: { label: { "zh-CN": "事件", "en-US": "Event" } },
      chat_id: { label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" } },
      user_id: { label: { "zh-CN": "用户 ID", "en-US": "User ID" } },
      message_id: { label: { "zh-CN": "消息 ID", "en-US": "Message ID" } },
      chat_type: { label: { "zh-CN": "聊天类型", "en-US": "Chat Type" } },
      username: { label: { "zh-CN": "用户名", "en-US": "Username" } },
      full_name: { label: { "zh-CN": "全名", "en-US": "Full Name" } },
      button_id: { label: { "zh-CN": "按钮 ID", "en-US": "Button ID" } },
      button_text: { label: { "zh-CN": "按钮文案", "en-US": "Button Text" } },
      callback_data: { label: { "zh-CN": "回调数据", "en-US": "Callback Data" } },
    },
  },
  ui: {
    icon: "bolt",
    color: "#a855f7",
    group: "触发器",
    order: 2,
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

