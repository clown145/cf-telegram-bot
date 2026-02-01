import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "try_catch",
  version: "1.0.0",
  name: "异常捕获",
  description: "捕获后续节点的异常并跳转到 catch 分支。",
  category: "flow",
  tags: ["try", "catch", "error", "control"],
  inputs: [],
  outputs: [
    { name: "try", type: "flow", description: "正常执行分支。" },
    { name: "catch", type: "flow", description: "异常捕获分支。" },
  ],
  i18n: {
    name: { "zh-CN": "异常捕获", "en-US": "Try / Catch" },
    description: {
      "zh-CN": "捕获后续节点的异常并跳转到 catch 分支。",
      "en-US": "Catch downstream errors and jump to catch branch.",
    },
    outputs: {
      try: {
        label: { "zh-CN": "正常", "en-US": "Try" },
        description: { "zh-CN": "正常执行分支。", "en-US": "Normal flow." },
      },
      catch: {
        label: { "zh-CN": "异常", "en-US": "Catch" },
        description: { "zh-CN": "异常捕获分支。", "en-US": "Error flow." },
      },
    },
  },
  ui: {
    icon: "shield",
    color: "#facc15",
    group: "控制流",
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
