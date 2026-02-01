import { ButtonsModel } from "./types";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

export async function parseJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) {
    throw new Error("empty body");
  }
  return JSON.parse(text) as T;
}

export function generateId(prefix: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function defaultState(header = "请选择功能"): ButtonsModel {
  return {
    version: 2,
    menus: {
      root: {
        id: "root",
        name: "root",
        header,
        items: [],
      },
    },
    buttons: {},
    actions: {},
    web_apps: {},
    workflows: {},
  };
}
