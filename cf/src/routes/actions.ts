import type { ModularActionDefinition } from "../actions/modularActions";
import { ButtonsModel } from "../types";
import { CORS_HEADERS, jsonResponse } from "../utils";

export interface UploadedModularActionFile {
  id: string;
  filename: string;
  content: string;
  metadata?: ModularActionDefinition;
}

export interface ActionsApiHandlers {
  getLocalActions(): Promise<Response>;
  getModularActions(): Promise<Response>;
  uploadModularAction(request: Request): Promise<Response>;
  downloadModularAction(actionId: string): Promise<Response>;
  deleteModularAction(actionId: string): Promise<Response>;
  testAction(request: Request): Promise<Response>;
}

export interface ActionsApiDependencies {
  loadState(): Promise<ButtonsModel>;
  buildModularActionList(state: ButtonsModel): Promise<ModularActionDefinition[]>;
  loadUploadedModularActions(): Promise<Record<string, UploadedModularActionFile>>;
  saveUploadedModularActions(actions: Record<string, UploadedModularActionFile>): Promise<void>;
  testAction(request: Request): Promise<Response>;
}

export interface ActionsApiRouteRequest {
  path: string;
  method: string;
  request: Request;
}

export async function handleActionsApiRequest(
  args: ActionsApiRouteRequest,
  handlers: ActionsApiHandlers
): Promise<Response | null> {
  const { path, method, request } = args;

  if (path === "/api/actions/local/available" && method === "GET") {
    return await handlers.getLocalActions();
  }

  if (path === "/api/actions/modular/available" && method === "GET") {
    return await handlers.getModularActions();
  }

  if (path === "/api/actions/modular/upload" && method === "POST") {
    return await handlers.uploadModularAction(request);
  }

  if (path.startsWith("/api/actions/modular/download/") && method === "GET") {
    const actionId = decodeURIComponent(path.slice("/api/actions/modular/download/".length));
    return await handlers.downloadModularAction(actionId);
  }

  if (path.startsWith("/api/actions/modular/") && method === "DELETE") {
    const actionId = decodeURIComponent(path.slice("/api/actions/modular/".length));
    return await handlers.deleteModularAction(actionId);
  }

  if (path === "/api/actions/test" && method === "POST") {
    return await handlers.testAction(request);
  }

  return null;
}

export function createActionsApiHandlers(deps: ActionsApiDependencies): ActionsApiHandlers {
  return {
    getLocalActions: async () => jsonResponse({ actions: [] }),

    getModularActions: async () => {
      const state = await deps.loadState();
      const actions = await deps.buildModularActionList(state);
      return jsonResponse({ actions, secure_upload_enabled: false });
    },

    uploadModularAction: async (_request) => jsonResponse({ error: "modular upload not supported yet" }, 501),

    downloadModularAction: async (actionId) => {
      const actions = await deps.loadUploadedModularActions();
      const action = actions[actionId];
      if (!action) {
        return jsonResponse({ error: `action not found: ${actionId}` }, 404);
      }
      return new Response(action.content, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename=\"${action.filename}\"`,
          ...CORS_HEADERS,
        },
      });
    },

    deleteModularAction: async (actionId) => {
      const actions = await deps.loadUploadedModularActions();
      if (actions[actionId]) {
        delete actions[actionId];
        await deps.saveUploadedModularActions(actions);
      }
      return jsonResponse({ status: "ok", deleted_id: actionId });
    },

    testAction: async (request) => await deps.testAction(request),
  };
}
