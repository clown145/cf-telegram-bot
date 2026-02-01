import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "provide_static_string",
  version: "1.0.0",
  name: "提供静态字符串",
  description: "输出一个静态字符串。",
  category: "utility",
  tags: ["string", "static"],
  inputs: [
    {
      name: "value",
      type: "string",
      description: "要输出的字符串值。",
    },
  ],
  outputs: [
    {
      name: "output",
      type: "string",
      description: "输出的字符串。",
    },
  ],
  i18n: {
    name: { "zh-CN": "提供静态字符串", "en-US": "Static String" },
    description: { "zh-CN": "输出一个静态字符串。", "en-US": "Outputs a static string." },
    inputs: {
      value: {
        label: { "zh-CN": "字符串", "en-US": "Value" },
        description: { "zh-CN": "要输出的字符串值。", "en-US": "String to output." },
      },
    },
    outputs: {
      output: {
        label: { "zh-CN": "输出", "en-US": "Output" },
        description: { "zh-CN": "输出的字符串。", "en-US": "Resulting string." },
      },
    },
  },
  ui: {
    icon: "text",
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
