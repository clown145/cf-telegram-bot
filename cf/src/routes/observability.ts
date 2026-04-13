import {
  normalizeObservabilityConfig,
  type ObservabilityConfig,
  type ObsExecutionStats,
  type ObsExecutionSummary,
  type ObsExecutionTrace,
} from "../observability";
import { jsonResponse, parseJson } from "../utils";

export interface ObservabilityApiHandlers {
  getObservabilityConfig(): Promise<Response>;
  putObservabilityConfig(request: Request): Promise<Response>;
  listObservabilityExecutions(url: URL): Promise<Response>;
  clearObservabilityExecutions(): Promise<Response>;
  getObservabilityExecution(execId: string): Promise<Response>;
  deleteObservabilityExecution(execId: string): Promise<Response>;
}

export interface ObservabilityApiDependencies {
  loadObservabilityConfig(): Promise<ObservabilityConfig>;
  saveObservabilityConfig(config: ObservabilityConfig): Promise<void>;
  loadObservabilityIndex(): Promise<ObsExecutionSummary[]>;
  saveObservabilityIndex(index: ObsExecutionSummary[]): Promise<void>;
  loadObservabilityExecution(execId: string): Promise<ObsExecutionTrace | null>;
  deleteObservabilityExecution(execId: string): Promise<void>;
  clearObservabilityIndexStorage(): Promise<void>;
  buildObservabilityStats(entries: ObsExecutionSummary[]): ObsExecutionStats;
}

export interface ObservabilityApiRouteRequest {
  path: string;
  method: string;
  request: Request;
  url: URL;
}

const OBS_STATUSES = new Set(["success", "error", "pending"]);

export async function handleObservabilityApiRequest(
  args: ObservabilityApiRouteRequest,
  handlers: ObservabilityApiHandlers
): Promise<Response | null> {
  const { path, method, request, url } = args;

  if (path === "/api/observability/config") {
    if (method === "GET") {
      return await handlers.getObservabilityConfig();
    }
    if (method === "PUT") {
      return await handlers.putObservabilityConfig(request);
    }
    return null;
  }

  if (path === "/api/observability/executions") {
    if (method === "GET") {
      return await handlers.listObservabilityExecutions(url);
    }
    if (method === "DELETE") {
      return await handlers.clearObservabilityExecutions();
    }
    return null;
  }

  if (path.startsWith("/api/observability/executions/")) {
    const execId = decodeURIComponent(path.slice("/api/observability/executions/".length));
    if (method === "GET") {
      return await handlers.getObservabilityExecution(execId);
    }
    if (method === "DELETE") {
      return await handlers.deleteObservabilityExecution(execId);
    }
    return null;
  }

  return null;
}

export function createObservabilityApiHandlers(
  deps: ObservabilityApiDependencies
): ObservabilityApiHandlers {
  return {
    getObservabilityConfig: async () => jsonResponse(await deps.loadObservabilityConfig()),

    putObservabilityConfig: async (request) => {
      let payload: Partial<ObservabilityConfig>;
      try {
        payload = await parseJson<Partial<ObservabilityConfig>>(request);
      } catch (error) {
        return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
      }
      const nextConfig = normalizeObservabilityConfig(payload);
      await deps.saveObservabilityConfig(nextConfig);
      return jsonResponse(nextConfig);
    },

    listObservabilityExecutions: async (url) => {
      const index = await deps.loadObservabilityIndex();
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

      const stats = deps.buildObservabilityStats(scoped);
      let filtered = scoped;
      if (OBS_STATUSES.has(status)) {
        filtered = filtered.filter((entry) => entry.status === status);
      }

      return jsonResponse({
        total: filtered.length,
        stats,
        executions: filtered.slice(0, limit),
      });
    },

    clearObservabilityExecutions: async () => {
      const index = await deps.loadObservabilityIndex();
      for (const entry of index) {
        await deps.deleteObservabilityExecution(entry.id);
      }
      await deps.clearObservabilityIndexStorage();
      return jsonResponse({ status: "ok", cleared: index.length });
    },

    getObservabilityExecution: async (execId) => {
      const id = String(execId || "").trim();
      if (!id) {
        return jsonResponse({ error: "missing id" }, 400);
      }
      const trace = await deps.loadObservabilityExecution(id);
      if (!trace) {
        return jsonResponse({ error: "not found" }, 404);
      }
      return jsonResponse(trace);
    },

    deleteObservabilityExecution: async (execId) => {
      const id = String(execId || "").trim();
      if (!id) {
        return jsonResponse({ error: "missing id" }, 400);
      }
      await deps.deleteObservabilityExecution(id);
      const index = await deps.loadObservabilityIndex();
      const next = index.filter((entry) => entry.id !== id);
      await deps.saveObservabilityIndex(next);
      return jsonResponse({ status: "ok", deleted_id: id });
    },
  };
}
