import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "json_parse",
  version: "1.0.0",
  name: "JSON Parse",
  description: "Parse JSON text or stringify data.",
  category: "utility",
  tags: ["json", "parse", "stringify"],
  inputs: [
    {
      name: "mode",
      type: "string",
      default: "parse",
      options: [
        { value: "parse", label: "parse" },
        { value: "stringify", label: "stringify" },
      ],
      description: "Operation mode.",
    },
    {
      name: "value",
      type: "string",
      default: "",
      description: "JSON text (parse) or any value (stringify).",
    },
    {
      name: "pretty",
      type: "boolean",
      default: false,
      description: "Use pretty-printed JSON for stringify.",
    },
    {
      name: "indent",
      type: "integer",
      default: 2,
      description: "Indent width when pretty=true.",
    },
    {
      name: "fail_on_error",
      type: "boolean",
      default: false,
      description: "Throw error instead of returning error fields.",
    },
  ],
  outputs: [
    { name: "result", type: "any", description: "Parsed object or stringified text." },
    { name: "text", type: "string", description: "String form of result." },
    { name: "is_valid", type: "boolean", description: "Whether operation succeeded." },
    { name: "error", type: "string", description: "Error message when failed." },
    { name: "value_type", type: "string", description: "Result type." },
  ],
  i18n: {
    name: { "zh-CN": "JSON \u89e3\u6790", "en-US": "JSON Parse" },
    description: {
      "zh-CN": "JSON \u89e3\u6790\u4e0e stringify\u3002",
      "en-US": "Parse JSON text or stringify data.",
    },
    inputs: {
      mode: { label: { "zh-CN": "\u6a21\u5f0f", "en-US": "Mode" } },
      value: { label: { "zh-CN": "\u8f93\u5165\u503c", "en-US": "Value" } },
      pretty: { label: { "zh-CN": "\u683c\u5f0f\u5316\u8f93\u51fa", "en-US": "Pretty" } },
      indent: { label: { "zh-CN": "\u7f29\u8fdb", "en-US": "Indent" } },
      fail_on_error: { label: { "zh-CN": "\u5931\u8d25\u5373\u62a5\u9519", "en-US": "Fail On Error" } },
    },
    outputs: {
      result: { label: { "zh-CN": "\u7ed3\u679c", "en-US": "Result" } },
      text: { label: { "zh-CN": "\u6587\u672c\u7ed3\u679c", "en-US": "Text" } },
      is_valid: { label: { "zh-CN": "\u662f\u5426\u6709\u6548", "en-US": "Is Valid" } },
      error: { label: { "zh-CN": "\u9519\u8bef", "en-US": "Error" } },
      value_type: { label: { "zh-CN": "\u7ed3\u679c\u7c7b\u578b", "en-US": "Value Type" } },
    },
  },
  ui: {
    icon: "code",
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
