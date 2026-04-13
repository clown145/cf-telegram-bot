import { ButtonsModel, WorkflowDefinition } from "../types";
import { jsonResponse, parseJson } from "../utils";

export interface WorkflowApiHandlers {
  listWorkflows(): Promise<Response>;
  testWorkflow(workflowId: string, request: Request): Promise<Response>;
  analyzeWorkflow(workflowId: string): Promise<Response>;
  getWorkflow(workflowId: string): Promise<Response>;
  putWorkflow(workflowId: string, request: Request): Promise<Response>;
  deleteWorkflow(workflowId: string): Promise<Response>;
}

export interface WorkflowApiDependencies {
  loadState(): Promise<ButtonsModel>;
  saveState(state: ButtonsModel): Promise<void>;
  testWorkflow(workflowId: string, request: Request): Promise<Response>;
  analyzeWorkflow(workflowId: string): Promise<Response>;
}

export interface WorkflowApiRouteRequest {
  path: string;
  method: string;
  request: Request;
}

export async function handleWorkflowApiRequest(
  args: WorkflowApiRouteRequest,
  handlers: WorkflowApiHandlers
): Promise<Response | null> {
  const { path, method, request } = args;

  if (path === "/api/workflows" && method === "GET") {
    return await handlers.listWorkflows();
  }

  if (path.startsWith("/api/workflows/") && path.endsWith("/test") && method === "POST") {
    const rawId = path.slice("/api/workflows/".length, path.length - "/test".length);
    return await handlers.testWorkflow(decodeURIComponent(rawId || ""), request);
  }

  if (path.startsWith("/api/workflows/") && path.endsWith("/analyze") && method === "GET") {
    const rawId = path.slice("/api/workflows/".length, path.length - "/analyze".length);
    return await handlers.analyzeWorkflow(decodeURIComponent(rawId || ""));
  }

  if (path.startsWith("/api/workflows/")) {
    const workflowId = decodeURIComponent(path.slice("/api/workflows/".length));
    if (!workflowId) {
      return jsonResponse({ error: "missing workflow_id" }, 400);
    }
    if (method === "GET") {
      return await handlers.getWorkflow(workflowId);
    }
    if (method === "PUT") {
      return await handlers.putWorkflow(workflowId, request);
    }
    if (method === "DELETE") {
      return await handlers.deleteWorkflow(workflowId);
    }
    return null;
  }

  return null;
}

export function createWorkflowApiHandlers(deps: WorkflowApiDependencies): WorkflowApiHandlers {
  return {
    listWorkflows: async () => {
      const state = await deps.loadState();
      return jsonResponse(state.workflows || {});
    },

    testWorkflow: async (workflowId, request) => await deps.testWorkflow(workflowId, request),

    analyzeWorkflow: async (workflowId) => await deps.analyzeWorkflow(workflowId),

    getWorkflow: async (workflowId) => {
      const state = await deps.loadState();
      const workflow = state.workflows?.[workflowId];
      if (!workflow) {
        return jsonResponse({ error: `workflow not found: ${workflowId}` }, 404);
      }
      return jsonResponse(workflow);
    },

    putWorkflow: async (workflowId, request) => {
      const state = await deps.loadState();
      try {
        const payload = await parseJson<Record<string, unknown>>(request);
        state.workflows = state.workflows || {};
        state.workflows[workflowId] = payload as unknown as WorkflowDefinition;
        await deps.saveState(state);
        return jsonResponse({ status: "ok", id: workflowId });
      } catch (error) {
        return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
      }
    },

    deleteWorkflow: async (workflowId) => {
      const state = await deps.loadState();
      if (state.workflows && state.workflows[workflowId]) {
        delete state.workflows[workflowId];
        await deps.saveState(state);
      }
      return jsonResponse({ status: "ok", id: workflowId });
    },
  };
}
