import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "switch",
  version: "1.0.0",
  name: "多分支",
  description: "根据输入值匹配分支（固定 4 个 case + default）。",
  category: "flow",
  tags: ["switch", "case", "control"],
  inputs: [
    {
      name: "value",
      type: "string",
      required: true,
      description: "要匹配的值。",
    },
    {
      name: "case_1",
      type: "string",
      required: false,
      description: "分支 1 值。",
    },
    {
      name: "case_2",
      type: "string",
      required: false,
      description: "分支 2 值。",
    },
    {
      name: "case_3",
      type: "string",
      required: false,
      description: "分支 3 值。",
    },
    {
      name: "case_4",
      type: "string",
      required: false,
      description: "分支 4 值。",
    },
    {
      name: "case_insensitive",
      type: "boolean",
      required: false,
      default: false,
      description: "是否忽略大小写。",
    },
  ],
  outputs: [
    { name: "case_1", type: "flow", description: "匹配 case_1 时走此分支。" },
    { name: "case_2", type: "flow", description: "匹配 case_2 时走此分支。" },
    { name: "case_3", type: "flow", description: "匹配 case_3 时走此分支。" },
    { name: "case_4", type: "flow", description: "匹配 case_4 时走此分支。" },
    { name: "default", type: "flow", description: "无匹配时走此分支。" },
    { name: "matched_case", type: "string", description: "命中的 case 值。" },
    { name: "matched_index", type: "integer", description: "命中的 case 序号。" },
  ],
  i18n: {
    name: { "zh-CN": "多分支", "en-US": "Switch" },
    description: {
      "zh-CN": "根据输入值匹配分支（固定 4 个 case + default）。",
      "en-US": "Match input value with 4 cases and default.",
    },
    inputs: {
      value: {
        label: { "zh-CN": "匹配值", "en-US": "Value" },
        description: { "zh-CN": "要匹配的值。", "en-US": "Value to match." },
      },
      case_1: {
        label: { "zh-CN": "分支 1", "en-US": "Case 1" },
        description: { "zh-CN": "分支 1 值。", "en-US": "Case 1 value." },
      },
      case_2: {
        label: { "zh-CN": "分支 2", "en-US": "Case 2" },
        description: { "zh-CN": "分支 2 值。", "en-US": "Case 2 value." },
      },
      case_3: {
        label: { "zh-CN": "分支 3", "en-US": "Case 3" },
        description: { "zh-CN": "分支 3 值。", "en-US": "Case 3 value." },
      },
      case_4: {
        label: { "zh-CN": "分支 4", "en-US": "Case 4" },
        description: { "zh-CN": "分支 4 值。", "en-US": "Case 4 value." },
      },
      case_insensitive: {
        label: { "zh-CN": "忽略大小写", "en-US": "Case Insensitive" },
        description: { "zh-CN": "是否忽略大小写。", "en-US": "Ignore case." },
      },
    },
    outputs: {
      default: {
        label: { "zh-CN": "默认", "en-US": "Default" },
        description: { "zh-CN": "无匹配时走此分支。", "en-US": "No case matched." },
      },
      matched_case: {
        label: { "zh-CN": "命中值", "en-US": "Matched Case" },
        description: { "zh-CN": "命中的 case 值。", "en-US": "Matched case value." },
      },
      matched_index: {
        label: { "zh-CN": "命中序号", "en-US": "Matched Index" },
        description: { "zh-CN": "命中的 case 序号。", "en-US": "Matched case index." },
      },
    },
  },
  ui: {
    icon: "shuffle",
    color: "#f97316",
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
