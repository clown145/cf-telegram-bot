import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "run_workflow",
  version: "1.0.0",
  name: "Run Workflow",
  description: "Execute another workflow and return its result.",
  category: "flow",
  tags: ["workflow", "subflow", "control"],
  inputs: [
    {
      name: "workflow_id",
      type: "string",
      required: true,
      options_source: "workflows",
      description: "Target workflow ID.",
    },
    {
      name: "variables",
      type: "object",
      required: false,
      description: "Variables passed into the target workflow.",
    },
    {
      name: "propagate_error",
      type: "boolean",
      required: false,
      default: false,
      description: "Throw on child workflow failure to trigger try/catch.",
    },
  ],
  outputs: [
    { name: "success", type: "flow", description: "Child workflow succeeded." },
    { name: "error", type: "flow", description: "Child workflow failed." },
    { name: "subworkflow_success", type: "boolean", description: "Whether child workflow succeeded." },
    { name: "subworkflow_error", type: "string", description: "Child workflow error message." },
    { name: "subworkflow_text", type: "string", description: "Child workflow output text." },
    { name: "subworkflow_next_menu_id", type: "string", description: "Child workflow next menu ID." },
    { name: "subworkflow_variables", type: "object", description: "Child workflow output variables." },
    { name: "subworkflow_terminal_outputs", type: "object", description: "Terminal node outputs grouped by node id." },
  ],
  i18n: {
    name: {
      "zh-CN": "运行工作流",
      "en-US": "Run Workflow",
    },
    description: {
      "zh-CN": "执行另一个工作流并返回结果。",
      "en-US": "Execute another workflow and return its result.",
    },
    inputs: {
      workflow_id: {
        label: { "zh-CN": "工作流", "en-US": "Workflow" },
        description: { "zh-CN": "要执行的目标工作流 ID。", "en-US": "Target workflow ID." },
      },
      variables: {
        label: { "zh-CN": "变量", "en-US": "Variables" },
        description: { "zh-CN": "传入目标工作流的变量对象。", "en-US": "Variables passed to child workflow." },
      },
      propagate_error: {
        label: { "zh-CN": "抛出错误", "en-US": "Propagate Error" },
        description: {
          "zh-CN": "子工作流失败时是否抛错（触发 try/catch）。",
          "en-US": "Throw on child failure to trigger try/catch.",
        },
      },
    },
    outputs: {
      success: {
        label: { "zh-CN": "成功", "en-US": "Success" },
        description: { "zh-CN": "子工作流成功。", "en-US": "Child workflow succeeded." },
      },
      error: {
        label: { "zh-CN": "失败", "en-US": "Error" },
        description: { "zh-CN": "子工作流失败。", "en-US": "Child workflow failed." },
      },
    },
  },
  ui: {
    icon: "layers",
    color: "#a78bfa",
    group: "flow",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: true,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
