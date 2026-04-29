import { jsonResponse, parseJson, generateId } from "../utils";
import {
  DEFAULT_OBSERVABILITY_CONFIG,
  normalizeObservabilityConfig,
  sanitizeForObs,
  type ObservabilityConfig,
  type ObsExecutionStats,
  type ObsExecutionStatus,
  type ObsFailureSnapshot,
  type ObsExecutionSummary,
  type ObsExecutionTrace,
} from "../observability";

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean> | Promise<void>;
}

export class ObservabilityService {
  private storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
  }

  private observabilityConfigKey(): string {
    return "obs:config";
  }

  private observabilityIndexKey(): string {
    return "obs:index";
  }

  private observabilityExecutionKey(execId: string): string {
    return `obs:exec:${execId}`;
  }

  async loadObservabilityConfig(): Promise<ObservabilityConfig> {
    const stored = await this.storage.get<ObservabilityConfig>(this.observabilityConfigKey());
    return normalizeObservabilityConfig(stored || DEFAULT_OBSERVABILITY_CONFIG);
  }

  async saveObservabilityConfig(config: ObservabilityConfig): Promise<void> {
    await this.storage.put(this.observabilityConfigKey(), config);
  }

  normalizeObservabilitySummary(raw: unknown): ObsExecutionSummary | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const entry = raw as Record<string, unknown>;
    const id = String(entry.id || "").trim();
    const workflowId = String(entry.workflow_id || "").trim();
    if (!id || !workflowId) {
      return null;
    }
    const statusRaw = String(entry.status || "error").trim();
    const status: ObsExecutionStatus = ["success", "pending", "error"].includes(statusRaw)
      ? (statusRaw as ObsExecutionStatus)
      : "error";
    const startedAtRaw = Number(entry.started_at);
    const startedAt = Number.isFinite(startedAtRaw) ? Math.floor(startedAtRaw) : Date.now();
    const finishedAtRaw = Number(entry.finished_at);
    const durationRaw = Number(entry.duration_ms);
    return {
      id,
      workflow_id: workflowId,
      workflow_name: entry.workflow_name ? String(entry.workflow_name) : undefined,
      status,
      started_at: startedAt,
      finished_at: Number.isFinite(finishedAtRaw) ? Math.floor(finishedAtRaw) : undefined,
      duration_ms: Number.isFinite(durationRaw) ? Math.floor(durationRaw) : undefined,
      trigger_type: entry.trigger_type ? String(entry.trigger_type) : undefined,
      chat_id: entry.chat_id !== undefined && entry.chat_id !== null ? String(entry.chat_id) : undefined,
      user_id: entry.user_id !== undefined && entry.user_id !== null ? String(entry.user_id) : undefined,
      error: entry.error ? String(entry.error) : undefined,
      await_node_id: entry.await_node_id ? String(entry.await_node_id) : undefined,
    };
  }

  async loadObservabilityIndex(): Promise<ObsExecutionSummary[]> {
    const stored = await this.storage.get<unknown>(this.observabilityIndexKey());
    const list = Array.isArray(stored)
      ? stored
      : stored && typeof stored === "object"
        ? Object.values(stored as Record<string, unknown>)
        : [];
    const normalized: ObsExecutionSummary[] = [];
    for (const item of list) {
      const summary = this.normalizeObservabilitySummary(item);
      if (summary) {
        normalized.push(summary);
      }
    }
    return normalized;
  }

  async saveObservabilityIndex(index: ObsExecutionSummary[]): Promise<void> {
    await this.storage.put(this.observabilityIndexKey(), index);
  }

  async loadObservabilityExecution(execId: string): Promise<ObsExecutionTrace | null> {
    return (await this.storage.get<ObsExecutionTrace>(this.observabilityExecutionKey(execId))) || null;
  }

  async saveObservabilityExecution(trace: ObsExecutionTrace): Promise<void> {
    await this.storage.put(this.observabilityExecutionKey(trace.id), trace);
  }

  async deleteObservabilityExecution(execId: string): Promise<void> {
    await this.storage.delete(this.observabilityExecutionKey(execId));
  }

  async upsertObservabilitySummary(summary: ObsExecutionSummary, keep: number): Promise<void> {
    const existing = await this.loadObservabilityIndex();
    const next = existing.filter((entry) => entry && entry.id !== summary.id);
    next.unshift(summary);
    const keepCount = Math.min(Math.max(Math.floor(keep || DEFAULT_OBSERVABILITY_CONFIG.keep), 1), 500);
    const trimmed = next.slice(0, keepCount);
    const removed = next.slice(keepCount);
    await this.saveObservabilityIndex(trimmed);
    for (const entry of removed) {
      await this.deleteObservabilityExecution(entry.id);
    }
  }

  buildObservabilityStats(entries: ObsExecutionSummary[]): ObsExecutionStats {
    const successCount = entries.filter((entry) => entry.status === "success").length;
    const errorCount = entries.filter((entry) => entry.status === "error").length;
    const pendingCount = entries.filter((entry) => entry.status === "pending").length;
    const completedCount = successCount + errorCount;
    const successRate = completedCount > 0 ? Number(((successCount / completedCount) * 100).toFixed(2)) : null;

    const durations = entries
      .map((entry) => Number(entry.duration_ms))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const avgDurationMs =
      durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;

    const now = Date.now();
    const last24Start = now - 24 * 60 * 60 * 1000;
    const prev24Start = now - 48 * 60 * 60 * 1000;
    const failuresLast24h = entries.filter((entry) => entry.status === "error" && entry.started_at >= last24Start).length;
    const failuresPrev24h = entries.filter(
      (entry) => entry.status === "error" && entry.started_at >= prev24Start && entry.started_at < last24Start
    ).length;
    const failureDelta = failuresLast24h - failuresPrev24h;
    const failureTrend: "up" | "down" | "flat" = failureDelta > 0 ? "up" : failureDelta < 0 ? "down" : "flat";

    return {
      scope_total: entries.length,
      success_count: successCount,
      error_count: errorCount,
      pending_count: pendingCount,
      success_rate: successRate,
      avg_duration_ms: avgDurationMs,
      failures_last_24h: failuresLast24h,
      failures_prev_24h: failuresPrev24h,
      failure_trend: failureTrend,
      failure_delta: failureDelta,
    };
  }

  observabilityResultPayload(result: Record<string, unknown>): Record<string, unknown> {
    if (!result.pending) {
      return result;
    }
    const pending = result.pending as Record<string, unknown>;
    return {
      ...result,
      pending: {
        workflow_id: pending.workflow_id,
        node_id: pending.node_id,
        await: pending.await,
        obs_execution_id: pending.obs_execution_id,
      },
    };
  }

  async handleObservabilityConfigUpdate(request: Request): Promise<Response> {
    let payload: Partial<ObservabilityConfig>;
    try {
      payload = await parseJson<Partial<ObservabilityConfig>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const nextConfig = normalizeObservabilityConfig(payload);
    await this.saveObservabilityConfig(nextConfig);
    return jsonResponse(nextConfig);
  }

  async handleObservabilityExecutionsList(url: URL): Promise<Response> {
    const index = await this.loadObservabilityIndex();
    const workflowId = String(url.searchParams.get("workflow_id") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const limitRaw = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 500) : 100;

    let scoped = index;
    if (workflowId) {
      scoped = scoped.filter((entry) => entry.workflow_id === workflowId);
    }
    if (query) {
      scoped = scoped.filter((entry) => {
        return (
          String(entry.id || "").toLowerCase().includes(query) ||
          String(entry.workflow_id || "").toLowerCase().includes(query) ||
          String(entry.workflow_name || "").toLowerCase().includes(query) ||
          String(entry.error || "").toLowerCase().includes(query) ||
          String(entry.chat_id || "").toLowerCase().includes(query) ||
          String(entry.user_id || "").toLowerCase().includes(query)
        );
      });
    }

    const stats = this.buildObservabilityStats(scoped);
    let filtered = scoped;
    if (status && ["success", "error", "pending"].includes(status)) {
      filtered = filtered.filter((entry) => entry.status === (status as any));
    }

    const total = filtered.length;
    return jsonResponse({
      total,
      stats,
      executions: filtered.slice(0, limit),
    });
  }

  async handleObservabilityExecutionsClear(): Promise<Response> {
    const index = await this.loadObservabilityIndex();
    for (const entry of index) {
      await this.deleteObservabilityExecution(entry.id);
    }
    await this.storage.delete(this.observabilityIndexKey());
    return jsonResponse({ status: "ok", cleared: index.length });
  }

  async handleObservabilityExecutionGet(execId: string): Promise<Response> {
    const id = String(execId || "").trim();
    if (!id) {
      return jsonResponse({ error: "missing id" }, 400);
    }
    const trace = await this.loadObservabilityExecution(id);
    if (!trace) {
      return jsonResponse({ error: "not found" }, 404);
    }
    return jsonResponse(trace);
  }

  async handleObservabilityExecutionDelete(execId: string): Promise<Response> {
    const id = String(execId || "").trim();
    if (!id) {
      return jsonResponse({ error: "missing id" }, 400);
    }
    await this.deleteObservabilityExecution(id);
    const index = await this.loadObservabilityIndex();
    const next = index.filter((entry) => entry.id !== id);
    await this.saveObservabilityIndex(next);
    return jsonResponse({ status: "ok", deleted_id: id });
  }
}
