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
  outputs: [{ name: "event", type: "any", description: "Trigger event payload." }],
  i18n: {
    name: { "zh-CN": "\u89e6\u53d1\u5668\uff1aInline Query", "en-US": "Trigger: Inline Query" },
    description: {
      "zh-CN": "\u5f53\u6536\u5230 Telegram inline_query \u66f4\u65b0\u65f6\u89e6\u53d1\u5de5\u4f5c\u6d41\u3002",
      "en-US": "Trigger workflow when Telegram inline_query update arrives.",
    },
    inputs: {
      enabled: { label: { "zh-CN": "\u542f\u7528", "en-US": "Enabled" } },
      priority: { label: { "zh-CN": "\u4f18\u5148\u7ea7", "en-US": "Priority" } },
      query_pattern: {
        label: { "zh-CN": "\u5339\u914d\u6a21\u5f0f", "en-US": "Query Pattern" },
        placeholder: { "zh-CN": "\u53ef\u9009\uff0c\u4f8b\u5982 help", "en-US": "optional, e.g. help" },
      },
      match_mode: { label: { "zh-CN": "\u5339\u914d\u65b9\u5f0f", "en-US": "Match Mode" } },
      case_sensitive: { label: { "zh-CN": "\u533a\u5206\u5927\u5c0f\u5199", "en-US": "Case Sensitive" } },
    },
    outputs: {
      event: { label: { "zh-CN": "\u4e8b\u4ef6", "en-US": "Event" } },
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
