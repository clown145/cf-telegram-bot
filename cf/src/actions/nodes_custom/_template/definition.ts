import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "custom_node_id",
  version: "0.1.0",
  name: "Custom Node",
  description: "Describe what this node does.",
  category: "utility",
  tags: ["custom", "utility"],
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
    name: { "en-US": "Custom Node", "zh-CN": "Custom Node" },
    description: {
      "en-US": "Describe what this node does.",
      "zh-CN": "Describe what this node does.",
    },
    inputs: {
      input: {
        label: { "en-US": "Input", "zh-CN": "Input" },
        description: { "en-US": "Example input.", "zh-CN": "Example input." },
      },
    },
    outputs: {
      output: {
        label: { "en-US": "Output", "zh-CN": "Output" },
        description: { "en-US": "Example output.", "zh-CN": "Example output." },
      },
    },
  },
  ui: {
    icon: "cube",
    color: "#6366f1",
    group: "utility",
    order: 8100,
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
