export interface ObservabilityConfig {
  enabled: boolean;
  keep: number;
  include_inputs: boolean;
  include_outputs: boolean;
  include_runtime: boolean;
}

export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  enabled: true,
  keep: 200,
  include_inputs: true,
  include_outputs: true,
  include_runtime: true,
};

export function normalizeObservabilityConfig(input?: Partial<ObservabilityConfig> | null): ObservabilityConfig {
  const raw = input || {};
  const keepRaw = typeof raw.keep === "number" && Number.isFinite(raw.keep) ? Math.round(raw.keep) : DEFAULT_OBSERVABILITY_CONFIG.keep;
  const keep = Math.min(Math.max(keepRaw, 1), 500);

  return {
    enabled: raw.enabled === undefined ? DEFAULT_OBSERVABILITY_CONFIG.enabled : Boolean(raw.enabled),
    keep,
    include_inputs: raw.include_inputs === undefined ? DEFAULT_OBSERVABILITY_CONFIG.include_inputs : Boolean(raw.include_inputs),
    include_outputs: raw.include_outputs === undefined ? DEFAULT_OBSERVABILITY_CONFIG.include_outputs : Boolean(raw.include_outputs),
    include_runtime: raw.include_runtime === undefined ? DEFAULT_OBSERVABILITY_CONFIG.include_runtime : Boolean(raw.include_runtime),
  };
}

export type ObsExecutionStatus = "success" | "error" | "pending";
export type ObsNodeStatus = "success" | "error" | "skipped" | "pending";

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
  runtime?: unknown;
  nodes: ObsNodeTrace[];
  final_result?: unknown;
  error?: string;
  await_node_id?: string;
}

export interface SanitizeOptions {
  maxDepth: number;
  maxKeys: number;
  maxArray: number;
  maxString: number;
}

const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  maxDepth: 6,
  maxKeys: 80,
  maxArray: 80,
  maxString: 4000,
};

const REDACT_KEY_RE = /(token|secret|password|authorization|cookie|set-cookie|api[_-]?key)/i;

function truncateString(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}

function shouldRedactKey(key: string): boolean {
  return REDACT_KEY_RE.test(key);
}

export function sanitizeForObs(value: unknown, opts?: Partial<SanitizeOptions>): unknown {
  const options: SanitizeOptions = { ...DEFAULT_SANITIZE_OPTIONS, ...(opts || {}) };
  const seen = new WeakSet<object>();

  const walk = (input: unknown, depth: number): unknown => {
    if (input === null || input === undefined) {
      return input;
    }

    const inputType = typeof input;
    if (inputType === "string") {
      return truncateString(input, options.maxString);
    }
    if (inputType === "number" || inputType === "boolean") {
      return input;
    }
    if (inputType === "bigint") {
      return String(input);
    }
    if (inputType === "symbol") {
      return String(input);
    }
    if (inputType === "function") {
      const fn = input as any;
      return `[Function${fn?.name ? ` ${fn.name}` : ""}]`;
    }

    if (input instanceof Date) {
      return input.toISOString();
    }

    if (input instanceof Error) {
      const stack = typeof input.stack === "string" ? truncateString(input.stack, options.maxString) : undefined;
      return {
        name: String(input.name || "Error"),
        message: truncateString(String(input.message || input), options.maxString),
        stack,
      };
    }

    if (depth >= options.maxDepth) {
      if (Array.isArray(input)) {
        return `[Array(${input.length})]`;
      }
      return "[Object]";
    }

    if (typeof input === "object") {
      if (seen.has(input)) {
        return "[Circular]";
      }
      seen.add(input);

      if (Array.isArray(input)) {
        const list = input as unknown[];
        const out: unknown[] = [];
        const max = Math.min(list.length, options.maxArray);
        for (let i = 0; i < max; i += 1) {
          out.push(walk(list[i], depth + 1));
        }
        if (list.length > max) {
          out.push(`[... ${list.length - max} more items]`);
        }
        return out;
      }

      if (input instanceof Map) {
        const entries = Array.from(input.entries()).slice(0, options.maxArray);
        const outEntries = entries.map(([k, v]) => [walk(k, depth + 1), walk(v, depth + 1)]);
        if (input.size > entries.length) {
          outEntries.push([`[... ${input.size - entries.length} more entries]`, null]);
        }
        return { __type__: "Map", entries: outEntries };
      }

      if (input instanceof Set) {
        const entries = Array.from(input.values()).slice(0, options.maxArray);
        const outEntries = entries.map((v) => walk(v, depth + 1));
        if (input.size > entries.length) {
          outEntries.push(`[... ${input.size - entries.length} more items]`);
        }
        return { __type__: "Set", entries: outEntries };
      }

      const obj = input as Record<string, unknown>;
      const keys = Object.keys(obj);
      const out: Record<string, unknown> = {};
      const maxKeys = Math.min(keys.length, options.maxKeys);
      for (let i = 0; i < maxKeys; i += 1) {
        const key = keys[i];
        if (shouldRedactKey(key)) {
          out[key] = "[REDACTED]";
          continue;
        }
        out[key] = walk(obj[key], depth + 1);
      }
      if (keys.length > maxKeys) {
        out.__obs_truncated_keys__ = keys.length - maxKeys;
      }
      return out;
    }

    try {
      return truncateString(String(input), options.maxString);
    } catch {
      return "[Unserializable]";
    }
  };

  return walk(value, 0);
}
