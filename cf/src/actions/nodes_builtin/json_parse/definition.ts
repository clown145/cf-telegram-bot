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
    name: { "zh-CN": "JSON 解析", "en-US": "JSON Parse" },
    description: {
      "zh-CN": "JSON 解析与 stringify。",
      "en-US": "Parse JSON text or stringify data.",
    },
    inputs: {
      mode: { label: { "zh-CN": "模式", "en-US": "Mode" } },
      value: { label: { "zh-CN": "输入值", "en-US": "Value" } },
      pretty: { label: { "zh-CN": "格式化输出", "en-US": "Pretty" } },
      indent: { label: { "zh-CN": "缩进", "en-US": "Indent" } },
      fail_on_error: { label: { "zh-CN": "失败即报错", "en-US": "Fail On Error" } },
    },
    outputs: {
      result: { label: { "zh-CN": "结果", "en-US": "Result" } },
      text: { label: { "zh-CN": "文本结果", "en-US": "Text" } },
      is_valid: { label: { "zh-CN": "是否有效", "en-US": "Is Valid" } },
      error: { label: { "zh-CN": "错误", "en-US": "Error" } },
      value_type: { label: { "zh-CN": "结果类型", "en-US": "Value Type" } },
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