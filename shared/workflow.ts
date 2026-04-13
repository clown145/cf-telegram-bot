export interface LayoutConfig {
  row?: number;
  col?: number;
  rowspan?: number;
  colspan?: number;
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
