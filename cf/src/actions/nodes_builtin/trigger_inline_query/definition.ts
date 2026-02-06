import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "trigger_inline_query",
  version: "1.0.0",
  name: "Trigger: Inline Query",
  description: "Trigger workflow when Telegram inline_query update arrives.",
  category: "trigger",
  tags: ["trigger", "inline_query"],
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
      name: "query_pattern",
      type: "string",
      default: "",
      description: "Optional query match pattern. Empty means match all.",
      placeholder: "help",
    },
    {
      name: "match_mode",
      type: "string",
      default: "contains",
      options: [
        { value: "contains", label: "contains" },
        { value: "equals", label: "equals" },
        { value: "startsWith", label: "startsWith" },
        { value: "regex", label: "regex" },
      ],
      description: "Pattern match mode.",
    },
    {
      name: "case_sensitive",
      type: "boolean",
      default: false,
      description: "Use case-sensitive match.",
    },
  ],
  outputs: [
    { name: "event", type: "any", description: "Trigger event payload." },
  ],
  i18n: {
    name: { "zh-CN": "触发器：Inline Query", "en-US": "Trigger: Inline Query" },
    description: {
      "zh-CN": "当收到 Telegram inline_query 更新时触发工作流。",
      "en-US": "Trigger workflow when Telegram inline_query update arrives.",
    },
    inputs: {
      enabled: {
        label: { "zh-CN": "启用", "en-US": "Enabled" },
      },
      priority: {
        label: { "zh-CN": "优先级", "en-US": "Priority" },
      },
      query_pattern: {
        label: { "zh-CN": "匹配模式", "en-US": "Query Pattern" },
        placeholder: { "zh-CN": "可选，例如 help", "en-US": "optional, e.g. help" },
      },
      match_mode: {
        label: { "zh-CN": "匹配方式", "en-US": "Match Mode" },
      },
      case_sensitive: {
        label: { "zh-CN": "区分大小写", "en-US": "Case Sensitive" },
      },
    },
    outputs: {
      event: {
        label: { "zh-CN": "事件", "en-US": "Event" },
      },
    },
  },
  ui: {
    icon: "bolt",
    color: "#a855f7",
    group: "trigger",
    order: 3,
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

