import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "provide_placeholders",
  version: "1.0.0",
  name: "提供占位符 (Provide Placeholders)",
  description: "输出常用运行时变量占位符模板。",
  category: "utility",
  tags: ["placeholder", "runtime"],
  inputs: [],
  outputs: [
    {
      name: "chat_id_placeholder",
      type: "string",
      description: "当前聊天 ID 占位符。",
    },
    {
      name: "user_id_placeholder",
      type: "string",
      description: "当前用户 ID 占位符。",
    },
    {
      name: "message_id_placeholder",
      type: "string",
      description: "当前消息 ID 占位符。",
    },
    {
      name: "username_placeholder",
      type: "string",
      description: "当前用户名占位符。",
    },
    {
      name: "full_name_placeholder",
      type: "string",
      description: "当前用户全名占位符。",
    },
    {
      name: "callback_data_placeholder",
      type: "string",
      description: "回调数据占位符。",
    },
    {
      name: "menu_id_placeholder",
      type: "string",
      description: "菜单 ID 占位符。",
    },
    {
      name: "menu_name_placeholder",
      type: "string",
      description: "菜单名称占位符。",
    },
  ],
  i18n: {
    name: { "zh-CN": "提供占位符", "en-US": "Provide Placeholders" },
    description: { "zh-CN": "输出常用运行时变量占位符模板。", "en-US": "Outputs common runtime placeholders." },
    outputs: {
      chat_id_placeholder: {
        label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" },
        description: { "zh-CN": "当前聊天 ID 占位符。", "en-US": "Chat ID placeholder." },
      },
      user_id_placeholder: {
        label: { "zh-CN": "用户 ID", "en-US": "User ID" },
        description: { "zh-CN": "当前用户 ID 占位符。", "en-US": "User ID placeholder." },
      },
      message_id_placeholder: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "当前消息 ID 占位符。", "en-US": "Message ID placeholder." },
      },
      username_placeholder: {
        label: { "zh-CN": "用户名", "en-US": "Username" },
        description: { "zh-CN": "当前用户名占位符。", "en-US": "Username placeholder." },
      },
      full_name_placeholder: {
        label: { "zh-CN": "全名", "en-US": "Full Name" },
        description: { "zh-CN": "当前用户全名占位符。", "en-US": "Full name placeholder." },
      },
      callback_data_placeholder: {
        label: { "zh-CN": "回调数据", "en-US": "Callback Data" },
        description: { "zh-CN": "回调数据占位符。", "en-US": "Callback data placeholder." },
      },
      menu_id_placeholder: {
        label: { "zh-CN": "菜单 ID", "en-US": "Menu ID" },
        description: { "zh-CN": "菜单 ID 占位符。", "en-US": "Menu ID placeholder." },
      },
      menu_name_placeholder: {
        label: { "zh-CN": "菜单名称", "en-US": "Menu Name" },
        description: { "zh-CN": "菜单名称占位符。", "en-US": "Menu name placeholder." },
      },
    },
  },
  ui: {
    icon: "brackets",
    color: "#60a5fa",
    group: "基础",
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
