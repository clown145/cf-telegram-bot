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
