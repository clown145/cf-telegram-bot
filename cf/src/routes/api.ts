import { handleActionsApiRequest, type ActionsApiHandlers } from "./actions";
import { handleBotApiRequest, type BotApiHandlers } from "./bot";
import { handleObservabilityApiRequest, type ObservabilityApiHandlers } from "./observability";
import { handleWorkflowApiRequest, type WorkflowApiHandlers } from "./workflows";

export interface StateStoreApiHandlers
  extends ActionsApiHandlers,
    BotApiHandlers,
    ObservabilityApiHandlers,
    WorkflowApiHandlers {
  getState(): Promise<Response>;
  putState(request: Request): Promise<Response>;
  generateId(request: Request): Promise<Response>;
}

export interface StateStoreApiRouteRequest {
  path: string;
  method: string;
  request: Request;
  url: URL;
  handlers: StateStoreApiHandlers;
}

export async function handleApiRequest(args: StateStoreApiRouteRequest): Promise<Response | null> {
  const { path, method, request, url, handlers } = args;

  const botResponse = await handleBotApiRequest({ path, method, request, handlers });
  if (botResponse) {
    return botResponse;
  }

  const workflowResponse = await handleWorkflowApiRequest({ path, method, request }, handlers);
  if (workflowResponse) {
    return workflowResponse;
  }

  const actionsResponse = await handleActionsApiRequest({ path, method, request }, handlers);
  if (actionsResponse) {
    return actionsResponse;
  }

  const observabilityResponse = await handleObservabilityApiRequest({ path, method, request, url }, handlers);
  if (observabilityResponse) {
    return observabilityResponse;
  }

  if (path === "/api/state") {
    if (method === "GET") {
      return await handlers.getState();
    }
    if (method === "PUT") {
      return await handlers.putState(request);
    }
    return null;
  }

  if (path === "/api/util/ids" && method === "POST") {
    return await handlers.generateId(request);
  }

  return null;
}
