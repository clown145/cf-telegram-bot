import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "for_each",
  version: "1.0.0",
  name: "遍历数组",
  description: "遍历数组并逐项输出，配合 loop/done 分支使用。",
  category: "flow",
  tags: ["loop", "array", "control"],
  inputs: [
    {
      name: "items",
      type: "array",
      required: true,
      description: "要遍历的数组（也可传 JSON 字符串）。",
    },
    {
      name: "loop_key",
      type: "string",
      required: false,
      description: "循环状态 Key（默认使用节点 ID）。",
    },
    {
      name: "reset",
      type: "boolean",
      required: false,
      default: false,
      description: "是否重置循环状态。",
    },
  ],
  outputs: [
    { name: "loop", type: "flow", description: "仍有元素时走此分支。" },
    { name: "done", type: "flow", description: "遍历结束时走此分支。" },
    { name: "item", type: "any", description: "当前元素。" },
    { name: "index", type: "integer", description: "当前索引（从 0 开始）。" },
    { name: "index1", type: "integer", description: "当前索引（从 1 开始）。" },
    { name: "remaining", type: "integer", description: "剩余元素数量。" },
    { name: "total", type: "integer", description: "元素总数。" },
    { name: "loop_key", type: "string", description: "循环 key。" },
    { name: "loop_state_key", type: "string", description: "循环状态变量 key。" },
  ],
  i18n: {
    name: { "zh-CN": "遍历数组", "en-US": "For Each" },
    description: {
      "zh-CN": "遍历数组并逐项输出，配合 loop/done 分支使用。",
      "en-US": "Iterate an array and output each item with loop/done branches.",
    },
    inputs: {
      items: {
        label: { "zh-CN": "数组", "en-US": "Items" },
        description: {
          "zh-CN": "要遍历的数组（或 JSON 字符串）。",
          "en-US": "Array to iterate (or JSON string).",
        },
      },
      loop_key: {
        label: { "zh-CN": "循环 Key", "en-US": "Loop Key" },
        description: {
          "zh-CN": "循环状态 Key（默认节点 ID）。",
          "en-US": "Loop state key (defaults to node id).",
        },
      },
      reset: {
        label: { "zh-CN": "重置", "en-US": "Reset" },
        description: { "zh-CN": "是否重置循环状态。", "en-US": "Reset loop state." },
      },
    },
    outputs: {
      loop: {
        label: { "zh-CN": "继续", "en-US": "Loop" },
        description: { "zh-CN": "仍有元素。", "en-US": "More items available." },
      },
      done: {
        label: { "zh-CN": "结束", "en-US": "Done" },
        description: { "zh-CN": "遍历结束。", "en-US": "Iteration completed." },
      },
      item: {
        label: { "zh-CN": "当前元素", "en-US": "Item" },
        description: { "zh-CN": "当前元素。", "en-US": "Current item." },
      },
      index: {
        label: { "zh-CN": "索引", "en-US": "Index" },
        description: { "zh-CN": "0 基索引。", "en-US": "0-based index." },
      },
      index1: {
        label: { "zh-CN": "序号", "en-US": "Index (1)" },
        description: { "zh-CN": "1 基序号。", "en-US": "1-based index." },
      },
      remaining: {
        label: { "zh-CN": "剩余", "en-US": "Remaining" },
        description: { "zh-CN": "剩余元素数量。", "en-US": "Remaining items." },
      },
      total: {
        label: { "zh-CN": "总数", "en-US": "Total" },
        description: { "zh-CN": "元素总数。", "en-US": "Total items." },
      },
    },
  },
  ui: {
    icon: "repeat",
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
