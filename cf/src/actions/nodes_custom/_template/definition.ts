import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "custom_node_id",
  version: "0.1.0",
  name: "Custom Node",
  description: "Describe what this node does.",
  category: "custom",
  tags: ["custom"],
  inputs: [
    {
      name: "input",
      type: "string",
      required: false,
      description: "Example input.",
    },
  ],
  outputs: [
    {
      name: "output",
      type: "string",
      description: "Example output.",
    },
  ],
  i18n: {
    name: { "en-US": "Custom Node", "zh-CN": "自定义节点" },
    description: {
      "en-US": "Describe what this node does.",
      "zh-CN": "描述此节点的作用。",
    },
    inputs: {
      input: {
        label: { "en-US": "Input", "zh-CN": "输入" },
        description: { "en-US": "Example input.", "zh-CN": "示例输入。" },
      },
    },
    outputs: {
      output: {
        label: { "en-US": "Output", "zh-CN": "输出" },
        description: { "en-US": "Example output.", "zh-CN": "示例输出。" },
      },
    },
  },
  ui: {
    icon: "cube",
    color: "#6366f1",
    group: "Custom",
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
