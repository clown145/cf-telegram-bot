import { ActionExecutionResult, ButtonsModel, RuntimeContext } from "../types";
import { BUILTIN_NODE_HANDLERS } from "./nodes_builtin";
import { CUSTOM_NODE_HANDLERS } from "./nodes_custom";

export interface ActionHandlerContext {
  env: Record<string, unknown>;
  state: ButtonsModel;
  runtime: RuntimeContext;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  preview?: boolean;
}

export type ActionHandler = (
  params: Record<string, unknown>,
  context: ActionHandlerContext
) => Promise<Record<string, unknown>>;

let _handlers: Record<string, ActionHandler> | null = null;

export function getModularActionHandlers(): Record<string, ActionHandler> {
  if (!_handlers) {
    _handlers = {
      ...BUILTIN_NODE_HANDLERS,
      ...CUSTOM_NODE_HANDLERS,
    };
    console.log('[DEBUG] Registered handlers keys:', Object.keys(_handlers).sort());
  }
  return _handlers;
}

// Keep the old constant for compatibility but make it a proxy or a lazy property
export const MODULAR_ACTION_HANDLERS: Record<string, ActionHandler> = new Proxy({} as any, {
  get(target, prop: string) {
    return getModularActionHandlers()[prop];
  },
  has(target, prop: string) {
    return prop in getModularActionHandlers();
  },
  ownKeys() {
    return Object.keys(getModularActionHandlers());
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  }
});

export function buildActionResult(
  resultMap: Record<string, unknown>
): ActionExecutionResult {
  const specialKeys = new Set([
    "new_text",
    "parse_mode",
    "next_menu_id",
    "button_overrides",
    "notification",
    "new_message_chain",
    "temp_files_to_clean",
    "button_title",
    "flow_output",
  ]);

  const outputVariables: Record<string, unknown> = {};
  const flowOutput =
    typeof resultMap.__flow__ === "string"
      ? (resultMap.__flow__ as string)
      : typeof resultMap.flow_output === "string"
        ? (resultMap.flow_output as string)
        : undefined;
  for (const [key, value] of Object.entries(resultMap || {})) {
    if (!specialKeys.has(key) && !key.startsWith("__")) {
      outputVariables[key] = value;
    }
  }

  return {
    success: true,
    should_edit_message: Boolean(
      resultMap.new_text || resultMap.next_menu_id || resultMap.button_overrides || resultMap.button_title
    ),
    flow_output: flowOutput,
    new_text: typeof resultMap.new_text === "string" ? resultMap.new_text : undefined,
    parse_mode: typeof resultMap.parse_mode === "string" ? resultMap.parse_mode : undefined,
    next_menu_id: typeof resultMap.next_menu_id === "string" ? resultMap.next_menu_id : undefined,
    button_overrides: Array.isArray(resultMap.button_overrides)
      ? (resultMap.button_overrides as Record<string, unknown>[])
      : [],
    notification: (resultMap.notification as Record<string, unknown>) || undefined,
    new_message_chain: Array.isArray(resultMap.new_message_chain)
      ? (resultMap.new_message_chain as unknown[])
      : undefined,
    temp_files_to_clean: Array.isArray(resultMap.temp_files_to_clean)
      ? (resultMap.temp_files_to_clean as string[])
      : [],
    button_title: typeof resultMap.button_title === "string" ? resultMap.button_title : undefined,
    data: { variables: outputVariables },
  };
}
