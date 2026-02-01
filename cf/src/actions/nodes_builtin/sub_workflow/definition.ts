import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "sub_workflow",
  version: "1.0.0",
  name: "子工作流",
  description: "调用另一个工作流并返回结果。",
  category: "flow",
  tags: ["workflow", "subflow", "control"],
  inputs: [
    {
      name: "workflow_id",
      type: "string",
      required: true,
      options_source: "workflows",
      description: "要调用的工作流 ID。",
    },
    {
      name: "variables",
      type: "object",
      required: false,
      description: "传入子工作流的变量（对象）。",
    },
    {
      name: "propagate_error",
      type: "boolean",
      required: false,
      default: false,
      description: "子工作流失败时是否抛出错误（触发 try/catch）。",
    },
  ],
  outputs: [
    { name: "success", type: "flow", description: "子工作流成功。" },
    { name: "error", type: "flow", description: "子工作流失败。" },
    { name: "subworkflow_success", type: "boolean", description: "是否成功。" },
    { name: "subworkflow_error", type: "string", description: "错误信息。" },
    { name: "subworkflow_text", type: "string", description: "子工作流输出文本。" },
    { name: "subworkflow_next_menu_id", type: "string", description: "子工作流的 next_menu_id。" },
    { name: "subworkflow_variables", type: "object", description: "子工作流输出变量。" },
  ],
  i18n: {
    name: { "zh-CN": "子工作流", "en-US": "Sub Workflow" },
    description: { "zh-CN": "调用另一个工作流并返回结果。", "en-US": "Run another workflow and return results." },
    inputs: {
      workflow_id: {
        label: { "zh-CN": "工作流", "en-US": "Workflow" },
        description: { "zh-CN": "要调用的工作流 ID。", "en-US": "Target workflow id." },
      },
      variables: {
        label: { "zh-CN": "变量", "en-US": "Variables" },
        description: { "zh-CN": "传入子工作流的变量对象。", "en-US": "Variables passed to sub workflow." },
      },
      propagate_error: {
        label: { "zh-CN": "抛出错误", "en-US": "Propagate Error" },
        description: { "zh-CN": "失败时抛错以触发 try/catch。", "en-US": "Throw on failure to trigger try/catch." },
      },
    },
    outputs: {
      success: {
        label: { "zh-CN": "成功", "en-US": "Success" },
        description: { "zh-CN": "子工作流成功。", "en-US": "Sub workflow succeeded." },
      },
      error: {
        label: { "zh-CN": "失败", "en-US": "Error" },
        description: { "zh-CN": "子工作流失败。", "en-US": "Sub workflow failed." },
      },
    },
  },
  ui: {
    icon: "layers",
    color: "#a78bfa",
    group: "控制流",
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
