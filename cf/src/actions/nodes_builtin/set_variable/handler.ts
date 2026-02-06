import type { ActionHandler } from "../../handlers";

function toPath(name: string): string[] {
  return name
    .split(".")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getByPath(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setByPath(currentRoot: unknown, path: string[], nextValue: unknown): unknown {
  if (!path.length) {
    return nextValue;
  }
  const rootObject =
    currentRoot && typeof currentRoot === "object" && !Array.isArray(currentRoot)
      ? { ...(currentRoot as Record<string, unknown>) }
      : {};

  let cursor = rootObject as Record<string, unknown>;
  let sourceCursor: unknown = currentRoot;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const sourceChild =
      sourceCursor && typeof sourceCursor === "object" && !Array.isArray(sourceCursor)
        ? (sourceCursor as Record<string, unknown>)[key]
        : undefined;
    const child =
      sourceChild && typeof sourceChild === "object" && !Array.isArray(sourceChild)
        ? { ...(sourceChild as Record<string, unknown>) }
        : {};
    cursor[key] = child;
    cursor = child as Record<string, unknown>;
    sourceCursor = sourceChild;
  }

  cursor[path[path.length - 1]] = nextValue;
  return rootObject;
}

function parseBoolean(raw: string): boolean {
  const lowered = raw.trim().toLowerCase();
  return lowered === "true" || lowered === "1" || lowered === "yes" || lowered === "on";
}

function coerceValue(value: unknown, type: string): unknown {
  const normalizedType = String(type || "auto").trim().toLowerCase();
  if (normalizedType === "null") {
    return null;
  }
  if (normalizedType === "string") {
    return String(value ?? "");
  }
  if (normalizedType === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error("value is not a valid number");
    }
    return parsed;
  }
  if (normalizedType === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }
    return parseBoolean(String(value || ""));
  }
  if (normalizedType === "json") {
    if (typeof value !== "string") {
      return value;
    }
    return JSON.parse(value);
  }

  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (["true", "false", "1", "0", "yes", "no", "on", "off"].includes(trimmed.toLowerCase())) {
    return parseBoolean(trimmed);
  }
  if (trimmed.toLowerCase() === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function applyOperation(currentValue: unknown, nextValue: unknown, operation: string): unknown {
  const op = String(operation || "set").trim().toLowerCase();
  if (op === "append_text") {
    return `${currentValue ?? ""}${nextValue ?? ""}`;
  }
  if (op === "increment") {
    const base = Number(currentValue ?? 0);
    const delta = Number(nextValue ?? 0);
    if (!Number.isFinite(base) || !Number.isFinite(delta)) {
      throw new Error("increment requires numeric values");
    }
    return base + delta;
  }
  if (op === "push") {
    if (Array.isArray(currentValue)) {
      return [...currentValue, nextValue];
    }
    if (currentValue === undefined || currentValue === null) {
      return [nextValue];
    }
    return [currentValue, nextValue];
  }
  return nextValue;
}

export const handler: ActionHandler = async (params, context) => {
  const variableName = String(params.variable_name || "").trim();
  if (!variableName) {
    throw new Error("variable_name is required");
  }

  const path = toPath(variableName);
  if (!path.length) {
    throw new Error("variable_name is invalid");
  }

  const variables = (context.runtime.variables || {}) as Record<string, unknown>;
  const currentValue = getByPath(variables, path);
  const coerced = coerceValue(params.value, String(params.value_type || "auto"));
  const finalValue = applyOperation(currentValue, coerced, String(params.operation || "set"));

  const rootKey = path[0];
  const rootPath = path.slice(1);
  const patch: Record<string, unknown> = {};
  if (rootPath.length === 0) {
    patch[rootKey] = finalValue;
  } else {
    patch[rootKey] = setByPath(variables[rootKey], rootPath, finalValue);
  }

  return {
    ...patch,
    variable_name: variableName,
    value: finalValue,
  };
};