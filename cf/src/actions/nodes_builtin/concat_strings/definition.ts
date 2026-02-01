import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "concat_strings",
  version: "1.0.0",
  name: "拼接字符串",
  description: "将两个字符串拼接在一起。",
  category: "utility",
  tags: ["string", "concat"],
  inputs: [
    {
      name: "string_a",
      type: "string",
      description: "第一个字符串。",
    },
    {
      name: "string_b",
      type: "string",
      description: "第二个字符串。",
    },
  ],
  outputs: [
    {
      name: "result",
      type: "string",
      description: "拼接后的结果。",
    },
  ],
  i18n: {
    name: { "zh-CN": "拼接字符串", "en-US": "Concat Strings" },
    description: { "zh-CN": "将两个字符串拼接在一起。", "en-US": "Concatenate two strings." },
    inputs: {
      string_a: {
        label: { "zh-CN": "字符串 A", "en-US": "String A" },
        description: { "zh-CN": "第一个字符串。", "en-US": "First string." },
      },
      string_b: {
        label: { "zh-CN": "字符串 B", "en-US": "String B" },
        description: { "zh-CN": "第二个字符串。", "en-US": "Second string." },
      },
    },
    outputs: {
      result: {
        label: { "zh-CN": "结果", "en-US": "Result" },
        description: { "zh-CN": "拼接后的结果。", "en-US": "Concatenated result." },
      },
    },
  },
  ui: {
    icon: "merge",
    color: "#60a5fa",
    group: "基础",
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
