import { clearAuthToken, getAuthToken } from "./auth";

type UnauthorizedHandler = () => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

export interface ApiErrorInit {
  status: number;
  path: string;
  code?: string | number;
  details?: unknown;
  payload?: unknown;
}

export class ApiError extends Error {
  status: number;
  path: string;
  code?: string | number;
  details?: unknown;
  payload?: unknown;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.path = init.path;
    this.code = init.code;
    this.details = init.details;
    this.payload = init.payload;
  }
}

const readResponsePayload = async (response: Response): Promise<unknown> => {
  const raw = await response.text();
  if (!raw) return null;
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
};

const inferErrorMessage = (status: number, payload: unknown) => {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    const candidate = body.message ?? body.error ?? body.detail;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return `API ${status} request failed`;
};

const inferErrorCode = (payload: unknown): string | number | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const code = (payload as Record<string, unknown>).code;
  if (typeof code === "string" || typeof code === "number") {
    return code;
  }
  return undefined;
};

const inferErrorDetails = (payload: unknown): unknown => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const details = (payload as Record<string, unknown>).details;
  if (details !== undefined) {
    return details;
  }
  return payload;
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();
  if (token) {
    headers.set("X-Auth-Token", token);
  }
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    clearAuthToken();
    try {
      await unauthorizedHandler?.();
    } catch (error) {
      console.warn("unauthorized handler failed:", error);
    }
    throw new ApiError("unauthorized", {
      status: 401,
      path,
      code: "unauthorized",
      payload: null,
    });
  }
  return response;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const payload = await readResponsePayload(response);
    throw new ApiError(inferErrorMessage(response.status, payload), {
      status: response.status,
      path,
      code: inferErrorCode(payload),
      details: inferErrorDetails(payload),
      payload,
    });
  }
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}
