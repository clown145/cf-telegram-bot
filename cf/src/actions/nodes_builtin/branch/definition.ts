import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "branch",
  version: "1.0.0",
  name: "条件分支 (Branch)",
  description: "根据表达式结果选择 true/false 分支。",
  category: "control",
  tags: ["flow", "logic", "branch"],
  inputs: [
    {
      name: "expression",
      type: "string",
      required: true,
      description: "布尔表达式，支持模板语法与比较运算。",
      placeholder: "{{ variables.loop_remaining > 0 }}",
    },
  ],
  outputs: [
    { name: "true", type: "flow", description: "条件为真时走此分支。" },
    { name: "false", type: "flow", description: "条件为假时走此分支。" },
    { name: "condition_value", type: "any", description: "表达式原始结果。" },
    { name: "condition_passed", type: "boolean", description: "表达式布尔结果。" },
  ],
  i18n: {
    name: {
      "zh-CN": "条件分支",
      "en-US": "Branch",
    },
    description: {
      "zh-CN": "根据表达式结果选择 true/false 分支。",
      "en-US": "Route to true/false branches based on expression.",
    },
    inputs: {
      expression: {
        label: {
          "zh-CN": "表达式",
          "en-US": "Expression",
        },
        description: {
          "zh-CN": "布尔表达式，支持模板语法与比较运算。",
          "en-US": "Boolean expression, supports templates and comparisons.",
        },
        placeholder: {
          "zh-CN": "{{ variables.loop_remaining > 0 }}",
          "en-US": "{{ variables.loop_remaining > 0 }}",
        },
      },
    },
    outputs: {
      true: {
        label: { "zh-CN": "为真", "en-US": "True" },
        description: {
          "zh-CN": "条件为真时走此分支。",
          "en-US": "Taken when condition is true.",
        },
      },
      false: {
        label: { "zh-CN": "为假", "en-US": "False" },
        description: {
          "zh-CN": "条件为假时走此分支。",
          "en-US": "Taken when condition is false.",
        },
      },
      condition_value: {
        label: { "zh-CN": "原始结果", "en-US": "Raw Value" },
        description: {
          "zh-CN": "表达式原始计算结果。",
          "en-US": "Raw evaluated result.",
        },
      },
      condition_passed: {
        label: { "zh-CN": "布尔结果", "en-US": "Boolean Result" },
        description: {
          "zh-CN": "表达式布尔结果。",
          "en-US": "Boolean evaluation result.",
        },
      },
    },
  },
  ui: {
    icon: "branch",
    color: "#22c55e",
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
