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
    { name: "chat_id", type: "string", description: "聊天 ID。" },
    { name: "user_id", type: "string", description: "用户 ID。" },
    { name: "message_id", type: "integer", description: "消息 ID。" },
    { name: "chat_type", type: "string", description: "private / group / supergroup / channel。" },
    { name: "username", type: "string", description: "用户名（如果有）。" },
    { name: "full_name", type: "string", description: "用户全名。" },
    { name: "command", type: "string", description: "命令名（小写，去掉 / 与 @bot）。" },
    { name: "raw_args", type: "string", description: "原始参数文本。" },
    { name: "args", type: "any", description: "解析后的参数（{ args: string[]; params: object }）。" },
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
      chat_id: { label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" } },
      user_id: { label: { "zh-CN": "用户 ID", "en-US": "User ID" } },
      message_id: { label: { "zh-CN": "消息 ID", "en-US": "Message ID" } },
      chat_type: { label: { "zh-CN": "聊天类型", "en-US": "Chat Type" } },
      username: { label: { "zh-CN": "用户名", "en-US": "Username" } },
      full_name: { label: { "zh-CN": "全名", "en-US": "Full Name" } },
      command: { label: { "zh-CN": "命令名", "en-US": "Command" } },
      raw_args: { label: { "zh-CN": "原始参数", "en-US": "Raw Args" } },
      args: { label: { "zh-CN": "解析参数", "en-US": "Parsed Args" } },
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

