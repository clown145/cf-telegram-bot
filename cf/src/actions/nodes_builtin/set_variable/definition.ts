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
    name: { "zh-CN": "设置变量", "en-US": "Set Variable" },
    description: {
      "zh-CN": "显式设置或更新运行时变量。",
      "en-US": "Set or update runtime variables explicitly.",
    },
    inputs: {
      variable_name: { label: { "zh-CN": "变量名", "en-US": "Variable Name" } },
      value: { label: { "zh-CN": "值", "en-US": "Value" } },
      value_type: { label: { "zh-CN": "值类型", "en-US": "Value Type" } },
      operation: { label: { "zh-CN": "操作", "en-US": "Operation" } },
    },
    outputs: {
      variable_name: { label: { "zh-CN": "变量名", "en-US": "Variable Name" } },
      value: { label: { "zh-CN": "最终值", "en-US": "Value" } },
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