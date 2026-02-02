import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "trigger_keyword",
  version: "1.0.0",
  name: "触发器：关键词",
  description: "当消息命中关键词规则时触发工作流。",
  category: "trigger",
  tags: ["trigger", "keyword"],
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
      default: 50,
      description: "优先级，数字越大越先执行。",
    },
    {
      name: "keywords",
      type: "string",
      required: true,
      description: "逗号分隔的关键词列表。",
      placeholder: "hello,你好",
    },
    {
      name: "match_mode",
      type: "string",
      default: "contains",
      description: "匹配模式。",
      options: [
        { value: "contains", label: "contains" },
        { value: "equals", label: "equals" },
        { value: "startsWith", label: "startsWith" },
        { value: "regex", label: "regex" },
      ],
    },
    {
      name: "case_sensitive",
      type: "boolean",
      default: false,
      description: "是否区分大小写。",
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
    { name: "text", type: "string", description: "完整消息文本。" },
    { name: "matched_keyword", type: "string", description: "匹配到的关键词。" },
  ],
  i18n: {
    name: { "zh-CN": "触发器：关键词", "en-US": "Trigger: Keyword" },
    description: { "zh-CN": "当消息命中关键词规则时触发工作流。", "en-US": "Trigger workflow on keyword match." },
    inputs: {
      enabled: { label: { "zh-CN": "启用", "en-US": "Enabled" } },
      priority: { label: { "zh-CN": "优先级", "en-US": "Priority" } },
      keywords: {
        label: { "zh-CN": "关键词", "en-US": "Keywords" },
        description: { "zh-CN": "逗号分隔。", "en-US": "Comma separated." },
        placeholder: { "zh-CN": "hello,你好", "en-US": "hello,hi" },
      },
      match_mode: { label: { "zh-CN": "匹配模式", "en-US": "Match Mode" } },
      case_sensitive: { label: { "zh-CN": "区分大小写", "en-US": "Case Sensitive" } },
    },
    outputs: {
      event: { label: { "zh-CN": "事件", "en-US": "Event" } },
      chat_id: { label: { "zh-CN": "聊天 ID", "en-US": "Chat ID" } },
      user_id: { label: { "zh-CN": "用户 ID", "en-US": "User ID" } },
      message_id: { label: { "zh-CN": "消息 ID", "en-US": "Message ID" } },
      chat_type: { label: { "zh-CN": "聊天类型", "en-US": "Chat Type" } },
      username: { label: { "zh-CN": "用户名", "en-US": "Username" } },
      full_name: { label: { "zh-CN": "全名", "en-US": "Full Name" } },
      text: { label: { "zh-CN": "文本", "en-US": "Text" } },
      matched_keyword: { label: { "zh-CN": "命中关键词", "en-US": "Matched Keyword" } },
    },
  },
  ui: {
    icon: "bolt",
    color: "#a855f7",
    group: "触发器",
    order: 1,
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

