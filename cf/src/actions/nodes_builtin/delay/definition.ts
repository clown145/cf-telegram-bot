import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "delay",
  version: "1.0.0",
  name: "延迟/路由 (Delay/Router)",
  description: "插入延迟或建立执行顺序依赖。",
  category: "control",
  tags: ["delay", "control"],
  inputs: [
    {
      name: "delay_ms",
      type: "integer",
      required: false,
      default: 0,
      description: "延迟毫秒数。",
    },
    {
      name: "control_input",
      type: "any",
      required: false,
      description: "控制流输入，仅用于确立执行顺序。",
    },
    {
      name: "passthrough_input",
      type: "any",
      required: false,
      description: "需要延迟后再向下游传递的数据。",
    },
  ],
  outputs: [
    {
      name: "passthrough_output",
      type: "any",
      description: "原样输出 passthrough_input。",
    },
  ],
  i18n: {
    name: { "zh-CN": "延迟/路由", "en-US": "Delay/Router" },
    description: { "zh-CN": "插入延迟或建立执行顺序依赖。", "en-US": "Insert delay or establish execution order." },
    inputs: {
      delay_ms: {
        label: { "zh-CN": "延迟毫秒", "en-US": "Delay (ms)" },
        description: { "zh-CN": "延迟毫秒数。", "en-US": "Delay in milliseconds." },
      },
      control_input: {
        label: { "zh-CN": "控制输入", "en-US": "Control Input" },
        description: { "zh-CN": "仅用于确立执行顺序。", "en-US": "Used to establish execution order." },
      },
      passthrough_input: {
        label: { "zh-CN": "透传输入", "en-US": "Passthrough Input" },
        description: { "zh-CN": "需要延迟后传递的数据。", "en-US": "Data to pass through after delay." },
      },
    },
    outputs: {
      passthrough_output: {
        label: { "zh-CN": "透传输出", "en-US": "Passthrough Output" },
        description: { "zh-CN": "原样输出 passthrough_input。", "en-US": "Passthrough output." },
      },
    },
  },
  ui: {
    icon: "timer",
    color: "#a78bfa",
    group: "控制流",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: false,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
