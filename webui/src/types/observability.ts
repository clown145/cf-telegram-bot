export type ObsExecutionStatus = "success" | "error" | "pending";
export type ObsNodeStatus = "success" | "error" | "skipped" | "pending";

export interface ObsExecutionSummary {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: ObsExecutionStatus;
  started_at: number;
  finished_at?: number;
  duration_ms?: number;
  trigger_type?: string;
  chat_id?: string;
  user_id?: string;
  error?: string;
  await_node_id?: string;
}

export interface ObsNodeTrace {
  node_id: string;
  action_id: string;
  action_kind: string;
  status: ObsNodeStatus;
  allowed: boolean;
  started_at: number;
  finished_at: number;
  duration_ms: number;
  flow_output?: string;
  rendered_params?: unknown;
  result?: unknown;
  error?: string;
}

export interface ObsExecutionRuntime {
  chat_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

export interface ObsExecutionTrace {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: ObsExecutionStatus;
  started_at: number;
  finished_at?: number;
  duration_ms?: number;
  trigger_type?: string;
  trigger?: unknown;
  runtime?: ObsExecutionRuntime;
  nodes: ObsNodeTrace[];
  final_result?: unknown;
  error?: string;
  await_node_id?: string;
}
