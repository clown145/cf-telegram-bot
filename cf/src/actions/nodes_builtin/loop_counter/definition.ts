import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "loop_counter",
  version: "1.0.0",
  name: "循环计数 (Loop Counter)",
  description: "根据计数器决定是否继续循环（loop/done）。",
  category: "control",
  tags: ["flow", "loop", "counter"],
  inputs: [
    {
      name: "count",
      type: "integer",
      required: true,
      description: "循环次数。每次经过节点减少 1。",
    },
    {
      name: "loop_key",
      type: "string",
      required: false,
      description: "可选：自定义循环状态键，避免多个循环互相覆盖。",
    },
    {
      name: "reset",
      type: "boolean",
      required: false,
      default: false,
      description: "重置循环状态（重新开始计数）。",
    },
  ],
  outputs: [
    { name: "loop", type: "flow", description: "继续循环分支。" },
    { name: "done", type: "flow", description: "结束循环分支。" },
    { name: "loop_index", type: "integer", description: "当前迭代次数（从 1 开始）。" },
    { name: "loop_remaining", type: "integer", description: "剩余迭代次数。" },
    { name: "loop_total", type: "integer", description: "总循环次数。" },
    { name: "loop_key", type: "string", description: "循环状态键。" },
    { name: "loop_state_key", type: "string", description: "内部状态变量键。" },
  ],
  i18n: {
    name: {
      "zh-CN": "循环计数",
      "en-US": "Loop Counter",
    },
    description: {
      "zh-CN": "根据计数器决定是否继续循环（loop/done）。",
      "en-US": "Count down and choose loop/done branch.",
    },
    inputs: {
      count: {
        label: { "zh-CN": "循环次数", "en-US": "Count" },
        description: {
          "zh-CN": "循环次数。每次经过节点减少 1。",
          "en-US": "Total iterations; decreases by 1 each time.",
        },
      },
      loop_key: {
        label: { "zh-CN": "循环键", "en-US": "Loop Key" },
        description: {
          "zh-CN": "自定义循环状态键，避免多个循环互相覆盖。",
          "en-US": "Custom state key to avoid collisions.",
        },
      },
      reset: {
        label: { "zh-CN": "重置", "en-US": "Reset" },
        description: {
          "zh-CN": "重置循环状态（重新开始计数）。",
          "en-US": "Reset loop state and start over.",
        },
      },
    },
    outputs: {
      loop: {
        label: { "zh-CN": "继续循环", "en-US": "Loop" },
        description: {
          "zh-CN": "继续循环分支。",
          "en-US": "Continue looping.",
        },
      },
      done: {
        label: { "zh-CN": "结束循环", "en-US": "Done" },
        description: {
          "zh-CN": "结束循环分支。",
          "en-US": "Finish looping.",
        },
      },
      loop_index: {
        label: { "zh-CN": "迭代次数", "en-US": "Loop Index" },
        description: {
          "zh-CN": "当前迭代次数（从 1 开始）。",
          "en-US": "Current iteration index (starts at 1).",
        },
      },
      loop_remaining: {
        label: { "zh-CN": "剩余次数", "en-US": "Remaining" },
        description: {
          "zh-CN": "剩余迭代次数。",
          "en-US": "Remaining iterations.",
        },
      },
      loop_total: {
        label: { "zh-CN": "总次数", "en-US": "Total" },
        description: {
          "zh-CN": "总循环次数。",
          "en-US": "Total iterations.",
        },
      },
      loop_key: {
        label: { "zh-CN": "循环键", "en-US": "Loop Key" },
        description: {
          "zh-CN": "循环状态键。",
          "en-US": "Loop state key.",
        },
      },
      loop_state_key: {
        label: { "zh-CN": "状态键", "en-US": "State Key" },
        description: {
          "zh-CN": "内部状态变量键。",
          "en-US": "Internal state variable key.",
        },
      },
    },
  },
  ui: {
    icon: "loop",
    color: "#f59e0b",
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
