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
