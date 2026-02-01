import type { ActionHandler } from "../../handlers";
import type { RuntimeContext } from "../../../types";
import { executeWorkflowWithResume } from "../../../engine/executor";

export const handler: ActionHandler = async (params, context) => {
  const workflowId = String(params.workflow_id || "");
  if (!workflowId) {
    throw new Error("workflow_id is required");
  }

  const workflow = context.state.workflows?.[workflowId];
  if (!workflow) {
    throw new Error(`workflow not found: ${workflowId}`);
  }

  const extraVars =
    params.variables && typeof params.variables === "object" && !Array.isArray(params.variables)
      ? (params.variables as Record<string, unknown>)
      : {};

  const runtime: RuntimeContext = {
    ...context.runtime,
    variables: { ...(context.runtime.variables || {}), ...extraVars },
  };

  const result = await executeWorkflowWithResume(
    { env: context.env, state: context.state, button: context.button, menu: context.menu, runtime, preview: context.preview },
    workflow
  );

  if (result.pending) {
    throw new Error("sub_workflow does not support await nodes yet");
  }

  if (!result.success) {
    if (params.propagate_error) {
      throw new Error(result.error || "sub_workflow failed");
    }
    return {
      __flow__: "error",
      subworkflow_success: false,
      subworkflow_error: result.error || "sub_workflow failed",
      subworkflow_text: result.new_text || "",
      subworkflow_next_menu_id: result.next_menu_id || "",
      subworkflow_variables: result.data?.variables || {},
    };
  }

  return {
    __flow__: "success",
    subworkflow_success: true,
    subworkflow_error: result.error || "",
    subworkflow_text: result.new_text || "",
    subworkflow_next_menu_id: result.next_menu_id || "",
    subworkflow_variables: result.data?.variables || {},
  };
};
