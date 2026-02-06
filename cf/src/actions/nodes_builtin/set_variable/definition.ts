import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "set_variable",
  version: "1.0.0",
  name: "Set Variable",
  description: "Set or update runtime variables explicitly.",
  category: "utility",
  tags: ["variable", "state"],
  inputs: [
    {
      name: "variable_name",
      type: "string",
      required: true,
      description: "Variable name. Supports dot path, e.g. user.profile.name",
      placeholder: "my_var",
    },
    {
      name: "value",
      type: "string",
      default: "",
      description: "Target value.",
    },
    {
      name: "value_type",
      type: "string",
      default: "auto",
      options: [
        { value: "auto", label: "auto" },
        { value: "string", label: "string" },
        { value: "number", label: "number" },
        { value: "boolean", label: "boolean" },
        { value: "json", label: "json" },
        { value: "null", label: "null" },
      ],
      description: "How to coerce input value.",
    },
    {
      name: "operation",
      type: "string",
      default: "set",
      options: [
        { value: "set", label: "set" },
        { value: "append_text", label: "append_text" },
        { value: "increment", label: "increment" },
        { value: "push", label: "push" },
      ],
      description: "Variable update operation.",
    },
  ],
  outputs: [
    { name: "variable_name", type: "string", description: "Updated variable name." },
    { name: "value", type: "any", description: "Final stored value." },
  ],
  i18n: {
    name: { "zh-CN": "\u8bbe\u7f6e\u53d8\u91cf", "en-US": "Set Variable" },
    description: {
      "zh-CN": "\u663e\u5f0f\u8bbe\u7f6e\u6216\u66f4\u65b0\u8fd0\u884c\u65f6\u53d8\u91cf\u3002",
      "en-US": "Set or update runtime variables explicitly.",
    },
    inputs: {
      variable_name: { label: { "zh-CN": "\u53d8\u91cf\u540d", "en-US": "Variable Name" } },
      value: { label: { "zh-CN": "\u503c", "en-US": "Value" } },
      value_type: { label: { "zh-CN": "\u503c\u7c7b\u578b", "en-US": "Value Type" } },
      operation: { label: { "zh-CN": "\u64cd\u4f5c", "en-US": "Operation" } },
    },
    outputs: {
      variable_name: { label: { "zh-CN": "\u53d8\u91cf\u540d", "en-US": "Variable Name" } },
      value: { label: { "zh-CN": "\u6700\u7ec8\u503c", "en-US": "Value" } },
    },
  },
  ui: {
    icon: "database",
    color: "#60a5fa",
    group: "Utility",
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
