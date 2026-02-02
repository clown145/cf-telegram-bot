import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "trigger_command",
  version: "1.0.0",
  name: "触发器：命令",
  description: "当收到指定 Telegram 命令时触发工作流。",
  category: "trigger",
  tags: ["trigger", "command"],
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
      name: "command",
      type: "string",
      required: true,
      description: "命令名（如 help，无需斜杠）。",
      placeholder: "help",
    },
    {
      name: "args_mode",
      type: "string",
      default: "auto",
      description: "参数解析模式。",
      options: [
        { value: "auto", label: "auto" },
        { value: "text", label: "text" },
        { value: "kv", label: "kv" },
        { value: "json", label: "json" },
      ],
    },
  ],
  outputs: [
    { name: "event", type: "any", description: "触发事件对象（用于确立执行顺序或传递上下文）。" },
  ],
  i18n: {
    name: { "zh-CN": "触发器：命令", "en-US": "Trigger: Command" },
    description: { "zh-CN": "当收到指定 Telegram 命令时触发工作流。", "en-US": "Trigger workflow on a Telegram command." },
    inputs: {
      enabled: {
        label: { "zh-CN": "启用", "en-US": "Enabled" },
        description: { "zh-CN": "是否启用该触发器。", "en-US": "Enable this trigger." },
      },
      priority: {
        label: { "zh-CN": "优先级", "en-US": "Priority" },
        description: { "zh-CN": "数字越大越先执行。", "en-US": "Higher runs first." },
      },
      command: {
        label: { "zh-CN": "命令", "en-US": "Command" },
        description: { "zh-CN": "命令名（无需斜杠）。", "en-US": "Command name (without slash)." },
        placeholder: { "zh-CN": "help", "en-US": "help" },
      },
      args_mode: {
        label: { "zh-CN": "参数模式", "en-US": "Args Mode" },
        description: { "zh-CN": "参数解析模式。", "en-US": "Argument parsing mode." },
      },
    },
    outputs: {
      event: {
        label: { "zh-CN": "事件", "en-US": "Event" },
        description: { "zh-CN": "触发事件对象。", "en-US": "Trigger event object." },
      },
    },
  },
  ui: {
    icon: "bolt",
    color: "#a855f7",
    group: "触发器",
    order: 0,
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
