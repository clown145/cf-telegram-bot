import { buildRuntimeContext } from "../../engine/executor";
import type {
  ActionExecutionResult,
  ButtonDefinition,
  ButtonsModel,
  MenuDefinition,
  RuntimeContext,
  WorkflowDefinition,
} from "../../types";

type WorkflowButtonLike = ButtonDefinition | Record<string, unknown>;
type WorkflowMenuLike = MenuDefinition | Record<string, unknown>;

export interface WorkflowEntryExecutionRequest {
  state: ButtonsModel;
  workflow: WorkflowDefinition;
  runtime: RuntimeContext;
  button: WorkflowButtonLike;
  menu: WorkflowMenuLike;
  preview: boolean;
  trigger_type?: string;
  trigger?: unknown;
}

export interface WorkflowEntryRuntimeInput extends Partial<RuntimeContext> {
  variables?: Record<string, unknown>;
}

export interface WorkflowEntryBinding {
  button: WorkflowButtonLike;
  menu: WorkflowMenuLike;
}

export interface WorkflowEntryHooks<T = void> {
  execute: (request: WorkflowEntryExecutionRequest) => Promise<ActionExecutionResult>;
  apply: (result: ActionExecutionResult, request: WorkflowEntryExecutionRequest) => Promise<T>;
  onError?: (error: unknown, request: WorkflowEntryExecutionRequest) => Promise<T>;
}

const DEFAULT_ENTRY_MENU_ID = "root";
const DEFAULT_ENTRY_MENU_HEADER = "请选择功能";

export function buildWorkflowRuntime(
  input: WorkflowEntryRuntimeInput,
  options?: {
    menuId?: string | null;
    extraVariables?: Record<string, unknown>;
    callbackData?: string | null;
  }
): RuntimeContext {
  const variables = {
    ...(input.variables || {}),
    ...(options?.extraVariables || {}),
  };
  return buildRuntimeContext(
    {
      chat_id: input.chat_id ?? "0",
      chat_type: input.chat_type,
      message_id: input.message_id,
      thread_id: input.thread_id,
      user_id: input.user_id,
      username: input.username,
      full_name: input.full_name,
      callback_data: options?.callbackData ?? input.callback_data,
      variables,
    },
    options?.menuId ?? String((input.variables as any)?.menu_id || DEFAULT_ENTRY_MENU_ID)
  );
}

export function createDefaultWorkflowEntryBinding(
  menuId = DEFAULT_ENTRY_MENU_ID,
  header = DEFAULT_ENTRY_MENU_HEADER
): WorkflowEntryBinding {
  return {
    button: { id: "runtime_button", text: "runtime", type: "workflow", payload: {} },
    menu: { id: menuId, name: menuId, items: [], header },
  };
}

export async function runWorkflowEntry<T = void>(
  request: WorkflowEntryExecutionRequest,
  hooks: WorkflowEntryHooks<T>
): Promise<T | undefined> {
  try {
    const result = await hooks.execute(request);
    return await hooks.apply(result, request);
  } catch (error) {
    return await hooks.onError?.(error, request);
  }
}
