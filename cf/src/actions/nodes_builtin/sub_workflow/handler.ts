import type { ActionHandler } from "../../handlers";
import type { PendingExecution, RuntimeContext } from "../../../types";
import { executeWorkflowWithResume } from "../../../engine/executor";

const SUB_WORKFLOW_RESUME_KEY = "__subworkflow_resume__";

interface SubWorkflowResumePayload {
  __flow__?: string;
  subworkflow_success?: boolean;
  subworkflow_error?: string;
  subworkflow_text?: string;
  subworkflow_next_menu_id?: string;
  subworkflow_variables?: Record<string, unknown>;
  throw_error?: boolean;
}

function normalizeVariables(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function buildSuccessPayload(result: {
  error?: string;
  new_text?: string;
  next_menu_id?: string;
  data?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    __flow__: "success",
    subworkflow_success: true,
    subworkflow_error: String(result.error || ""),
    subworkflow_text: String(result.new_text || ""),
    subworkflow_next_menu_id: String(result.next_menu_id || ""),
    subworkflow_variables: normalizeVariables(result.data?.variables),
  };
}

function buildErrorPayload(error: string, result?: { new_text?: string; next_menu_id?: string; data?: Record<string, unknown> }): Record<string, unknown> {
  return {
    __flow__: "error",
    subworkflow_success: false,
    subworkflow_error: error || "sub_workflow failed",
    subworkflow_text: String(result?.new_text || ""),
    subworkflow_next_menu_id: String(result?.next_menu_id || ""),
    subworkflow_variables: normalizeVariables(result?.data?.variables),
  };
}

function consumeResumePayload(runtime: RuntimeContext, nodeId: string): SubWorkflowResumePayload | null {
  if (!nodeId) {
    return null;
  }
  const vars = normalizeVariables(runtime.variables);
  const rawMap = vars[SUB_WORKFLOW_RESUME_KEY];
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
    return null;
  }
  const map = rawMap as Record<string, unknown>;
  const payload = map[nodeId];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  delete map[nodeId];
  if (Object.keys(map).length === 0) {
    delete vars[SUB_WORKFLOW_RESUME_KEY];
  }
  return payload as SubWorkflowResumePayload;
}

export const handler: ActionHandler = async (params, context) => {
  const nodeId = String(params.__node_id || "").trim();
  const injectedPayload = consumeResumePayload(context.runtime, nodeId);
  if (injectedPayload) {
    if (injectedPayload.throw_error) {
      throw new Error(String(injectedPayload.subworkflow_error || "sub_workflow failed"));
    }
    return {
      __flow__: String(injectedPayload.__flow__ || (injectedPayload.subworkflow_success ? "success" : "error")),
      subworkflow_success: Boolean(injectedPayload.subworkflow_success),
      subworkflow_error: String(injectedPayload.subworkflow_error || ""),
      subworkflow_text: String(injectedPayload.subworkflow_text || ""),
      subworkflow_next_menu_id: String(injectedPayload.subworkflow_next_menu_id || ""),
      subworkflow_variables: normalizeVariables(injectedPayload.subworkflow_variables),
    };
  }

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
    const rawMeta = result.pending.meta;
    const meta =
      rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
        ? { ...(rawMeta as Record<string, unknown>) }
        : {};
    const pending: PendingExecution = {
      ...result.pending,
      meta: {
        ...meta,
        source: "sub_workflow",
        propagate_error: Boolean(params.propagate_error),
      },
    };
    return {
      __pending__: pending as unknown as Record<string, unknown>,
    };
  }

  if (!result.success) {
    const errorMessage = String(result.error || "sub_workflow failed");
    if (params.propagate_error) {
      throw new Error(errorMessage);
    }
    return buildErrorPayload(errorMessage, result);
  }

  return buildSuccessPayload(result);
};
