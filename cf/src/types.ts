export interface LayoutConfig {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

export interface ButtonDefinition {
  id: string;
  text: string;
  type: string;
  payload: Record<string, unknown>;
  description?: string;
  layout?: LayoutConfig;
}

export interface MenuDefinition {
  id: string;
  name: string;
  header?: string;
  items: string[];
}

export interface ActionDefinition {
  id: string;
  name: string;
  kind: string;
  config: Record<string, unknown>;
  description?: string;
}

export interface WebAppDefinition {
  id: string;
  name: string;
  kind: string;
  url: string;
  source?: string;
  description?: string;
  options?: Record<string, unknown>;
}

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  action_id: string;
  position: WorkflowNodePosition;
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source_node: string;
  source_output: string;
  source_path?: string;
  target_node: string;
  target_input: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: Record<string, WorkflowNode>;
  edges: WorkflowEdge[];
}

export interface ButtonsModel {
  version: number;
  menus: Record<string, MenuDefinition>;
  buttons: Record<string, ButtonDefinition>;
  actions: Record<string, ActionDefinition>;
  web_apps: Record<string, WebAppDefinition>;
  workflows: Record<string, WorkflowDefinition>;
}

export interface RuntimeContext {
  chat_id: string;
  chat_type?: string;
  message_id?: number;
  thread_id?: number;
  user_id?: string;
  username?: string;
  full_name?: string;
  callback_data?: string;
  variables: Record<string, unknown>;
}

export interface ActionExecutionResult {
  success: boolean;
  should_edit_message?: boolean;
  new_text?: string;
  parse_mode?: string;
  next_menu_id?: string;
  flow_output?: string;
  error?: string;
  data?: Record<string, unknown>;
  button_title?: string;
  button_overrides?: Record<string, unknown>[];
  notification?: Record<string, unknown>;
  web_app_launch?: Record<string, unknown>;
  new_message_chain?: unknown[];
  temp_files_to_clean?: string[];
  pending?: PendingExecution;
}

export interface AwaitConfig {
  prompt: string;
  prompt_display_mode?: string;
  timeout_seconds: number;
  allow_empty: boolean;
  retry_prompt_template?: string;
  success_template?: string;
  timeout_template?: string;
  cancel_keywords: string[];
  cancel_template?: string;
  parse_mode?: string;
  prompt_message_id?: number;
  menu_id?: string;
  button_id?: string;
  original_button_text?: string;
  original_menu_header?: string;
}

export interface PendingExecution {
  workflow_id: string;
  node_id: string;
  exec_order: string[];
  next_index: number;
  node_outputs: Record<string, Record<string, unknown>>;
  global_variables: Record<string, unknown>;
  final_text_parts?: string[];
  temp_files_to_clean?: string[];
  runtime: RuntimeContext;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  await: AwaitConfig;
  obs_execution_id?: string;
}
