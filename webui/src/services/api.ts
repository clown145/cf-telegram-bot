import { clearAuthToken, getAuthToken } from "./auth";

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
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  return response;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}