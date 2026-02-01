import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "provide_existing_ids",
  version: "1.0.0",
  name: "获取现有 ID",
  description: "输出现有菜单/按钮/WebApp/动作/工作流 ID。",
  category: "utility",
  tags: ["id", "picker"],
  inputs: [
    {
      name: "menu_id",
      type: "string",
      description: "选择一个已有菜单。",
      options: [],
      options_source: "menus",
    },
    {
      name: "button_id",
      type: "string",
      description: "选择一个已有按钮。",
      options: [],
      options_source: "buttons",
    },
    {
      name: "web_app_id",
      type: "string",
      description: "选择一个已有 WebApp。",
      options: [],
      options_source: "web_apps",
    },
    {
      name: "local_action_id",
      type: "string",
      description: "选择一个已有动作。",
      options: [],
      options_source: "local_actions",
    },
    {
      name: "workflow_id",
      type: "string",
      description: "选择一个已有工作流。",
      options: [],
      options_source: "workflows",
    },
  ],
  outputs: [
    { name: "menu_id", type: "string", description: "菜单 ID。" },
    { name: "button_id", type: "string", description: "按钮 ID。" },
    { name: "web_app_id", type: "string", description: "WebApp ID。" },
    { name: "local_action_id", type: "string", description: "动作 ID。" },
    { name: "workflow_id", type: "string", description: "工作流 ID。" },
  ],
  i18n: {
    name: { "zh-CN": "获取现有 ID", "en-US": "Provide Existing IDs" },
    description: { "zh-CN": "输出现有菜单/按钮/WebApp/动作/工作流 ID。", "en-US": "Output existing menu/button/webapp/action/workflow IDs." },
    inputs: {
      menu_id: {
        label: { "zh-CN": "菜单 ID", "en-US": "Menu ID" },
        description: { "zh-CN": "选择一个已有菜单。", "en-US": "Select an existing menu." },
      },
      button_id: {
        label: { "zh-CN": "按钮 ID", "en-US": "Button ID" },
        description: { "zh-CN": "选择一个已有按钮。", "en-US": "Select an existing button." },
      },
      web_app_id: {
        label: { "zh-CN": "WebApp ID", "en-US": "WebApp ID" },
        description: { "zh-CN": "选择一个已有 WebApp。", "en-US": "Select an existing web app." },
      },
      local_action_id: {
        label: { "zh-CN": "动作 ID", "en-US": "Action ID" },
        description: { "zh-CN": "选择一个已有动作。", "en-US": "Select an existing action." },
      },
      workflow_id: {
        label: { "zh-CN": "工作流 ID", "en-US": "Workflow ID" },
        description: { "zh-CN": "选择一个已有工作流。", "en-US": "Select an existing workflow." },
      },
    },
    outputs: {
      menu_id: {
        label: { "zh-CN": "菜单 ID", "en-US": "Menu ID" },
        description: { "zh-CN": "菜单 ID。", "en-US": "Menu ID." },
      },
      button_id: {
        label: { "zh-CN": "按钮 ID", "en-US": "Button ID" },
        description: { "zh-CN": "按钮 ID。", "en-US": "Button ID." },
      },
      web_app_id: {
        label: { "zh-CN": "WebApp ID", "en-US": "WebApp ID" },
        description: { "zh-CN": "WebApp ID。", "en-US": "WebApp ID." },
      },
      local_action_id: {
        label: { "zh-CN": "动作 ID", "en-US": "Action ID" },
        description: { "zh-CN": "动作 ID。", "en-US": "Action ID." },
      },
      workflow_id: {
        label: { "zh-CN": "工作流 ID", "en-US": "Workflow ID" },
        description: { "zh-CN": "工作流 ID。", "en-US": "Workflow ID." },
      },
    },
  },
  ui: {
    icon: "list",
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
