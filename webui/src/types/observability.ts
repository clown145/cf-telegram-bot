export type ObsExecutionStatus = "success" | "error" | "pending";
export type ObsNodeStatus = "success" | "error" | "skipped" | "pending";
export type ObsFailureTrend = "up" | "down" | "flat";

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

export interface ObsExecutionStats {
  scope_total: number;
  success_count: number;
  error_count: number;
  pending_count: number;
  success_rate: number | null;
  avg_duration_ms: number | null;
  failures_last_24h: number;
  failures_prev_24h: number;
  failure_trend: ObsFailureTrend;
  failure_delta: number;
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

export interface ObsFailureSnapshot {
  source: "node" | "workflow";
  node_id?: string;
  action_id?: string;
  action_kind?: string;
  node_status?: ObsNodeStatus;
  error: string;
  at: number;
  rendered_params?: unknown;
  node_result?: unknown;
  runtime?: unknown;
  trigger?: unknown;
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
  failure_snapshot?: ObsFailureSnapshot;
}
