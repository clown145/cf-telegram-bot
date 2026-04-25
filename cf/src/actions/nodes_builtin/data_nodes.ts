import type { ActionHandler } from "../handlers";
import type { ModularActionDefinition } from "../modularActions";

type NodePackage = {
  definition: ModularActionDefinition;
  handler: ActionHandler;
};

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value: unknown, fallback = 0): number {
  const n = toNumber(value, fallback);
  return Math.trunc(n);
}

function normalizeOperation(value: unknown, fallback: string): string {
  return toText(value || fallback).trim().toLowerCase();
}

function parseArray(value: unknown, delimiter = ","): unknown[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // fall through to delimiter split
      }
    }
    if (trimmed.includes("\n")) {
      return trimmed.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    }
    return delimiter === "" ? trimmed.split("") : trimmed.split(delimiter).map((entry) => entry.trim());
  }
  return [value];
}

function parseValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
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

function getPath(value: unknown, path: unknown): unknown {
  const expr = toText(path).trim();
  if (!expr) {
    return value;
  }
  const parts = expr.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: any = value;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function compareItem(itemValue: unknown, expected: unknown, operator: string): boolean {
  const left = itemValue;
  const right = expected;
  switch (operator) {
    case "not_equals":
      return left != right;
    case "contains":
      return toText(left).includes(toText(right));
    case "not_contains":
      return !toText(left).includes(toText(right));
    case "truthy":
      return Boolean(left);
    case "falsy":
      return !Boolean(left);
    case "equals":
    default:
      return left == right;
  }
}

const mathHandler: ActionHandler = async (params) => {
  const operation = normalizeOperation(params.operation, "add");
  const a = toNumber(params.a, 0);
  const b = toNumber(params.b, 0);
  const min = toNumber(params.min, 0);
  const max = toNumber(params.max, 1);
  const precision = toInt(params.precision, 0);

  let result = a;
  if (operation === "add") result = a + b;
  else if (operation === "subtract") result = a - b;
  else if (operation === "multiply") result = a * b;
  else if (operation === "divide") {
    if (b === 0) throw new Error("division by zero");
    result = a / b;
  } else if (operation === "mod") {
    if (b === 0) throw new Error("modulo by zero");
    result = a % b;
  } else if (operation === "pow") result = Math.pow(a, b);
  else if (operation === "abs") result = Math.abs(a);
  else if (operation === "min") result = Math.min(a, b);
  else if (operation === "max") result = Math.max(a, b);
  else if (operation === "round") result = Math.round(a);
  else if (operation === "floor") result = Math.floor(a);
  else if (operation === "ceil") result = Math.ceil(a);
  else if (operation === "random") {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    result = low + Math.random() * (high - low);
  }

  if (precision > 0) {
    const factor = Math.pow(10, precision);
    result = Math.round(result * factor) / factor;
  }

  return {
    result,
    number: result,
    text: String(result),
  };
};

const arrayOpsHandler: ActionHandler = async (params) => {
  const operation = normalizeOperation(params.operation, "length");
  const delimiter = toText(params.delimiter === undefined ? "," : params.delimiter);
  const joiner = toText(params.joiner === undefined ? "," : params.joiner);
  const source = parseArray(params.items ?? params.value, delimiter);
  const value = parseValue(params.value);
  const path = params.path;
  const operator = normalizeOperation(params.operator, "equals");
  const index = toInt(params.index, 0);
  const start = toInt(params.start, 0);
  const endRaw = params.end === undefined || params.end === "" ? undefined : toInt(params.end, source.length);

  let result: unknown = source;
  let items: unknown[] = [...source];
  let item: unknown = undefined;
  let found = false;
  let resultIndex = -1;

  if (operation === "length" || operation === "size") {
    result = source.length;
  } else if (operation === "push") {
    items = [...source, value];
    result = items;
  } else if (operation === "pop") {
    items = [...source];
    item = items.pop();
    result = item;
  } else if (operation === "shift") {
    items = [...source];
    item = items.shift();
    result = item;
  } else if (operation === "unshift") {
    items = [value, ...source];
    result = items;
  } else if (operation === "first") {
    item = source[0];
    result = item;
  } else if (operation === "last") {
    item = source[source.length - 1];
    result = item;
  } else if (operation === "get") {
    const realIndex = index < 0 ? source.length + index : index;
    item = source[realIndex];
    result = item;
    resultIndex = realIndex;
    found = item !== undefined;
  } else if (operation === "join") {
    result = source.map((entry) => toText(entry)).join(joiner);
  } else if (operation === "includes") {
    resultIndex = source.findIndex((entry) => compareItem(getPath(entry, path), value, "equals"));
    found = resultIndex >= 0;
    result = found;
  } else if (operation === "index_of") {
    resultIndex = source.findIndex((entry) => compareItem(getPath(entry, path), value, "equals"));
    result = resultIndex;
    found = resultIndex >= 0;
  } else if (operation === "slice") {
    items = source.slice(start, endRaw);
    result = items;
  } else if (operation === "reverse") {
    items = [...source].reverse();
    result = items;
  } else if (operation === "unique") {
    const seen = new Set<string>();
    items = source.filter((entry) => {
      const key = JSON.stringify(getPath(entry, path));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    result = items;
  } else if (operation === "filter") {
    items = source.filter((entry) => compareItem(getPath(entry, path), value, operator));
    result = items;
  } else if (operation === "find") {
    resultIndex = source.findIndex((entry) => compareItem(getPath(entry, path), value, operator));
    found = resultIndex >= 0;
    item = found ? source[resultIndex] : undefined;
    result = item;
  } else if (operation === "map") {
    items = source.map((entry) => getPath(entry, path));
    result = items;
  }

  if (Array.isArray(result)) {
    items = result;
  }
  if (item === undefined && !Array.isArray(result) && operation !== "length" && operation !== "join") {
    item = result;
  }

  return {
    result,
    items,
    item,
    text: Array.isArray(result) || (result && typeof result === "object") ? JSON.stringify(result) : toText(result),
    length: Array.isArray(result) ? result.length : items.length,
    found,
    index: resultIndex,
  };
};

function parseDate(value: unknown, fallback = new Date()): Date {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (value instanceof Date) {
    return value;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric);
  }
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return new Date(parsed);
  }
  return fallback;
}

function addToDate(date: Date, amount: number, unit: string): Date {
  const next = new Date(date.getTime());
  if (unit === "year" || unit === "years") next.setUTCFullYear(next.getUTCFullYear() + amount);
  else if (unit === "month" || unit === "months") next.setUTCMonth(next.getUTCMonth() + amount);
  else if (unit === "day" || unit === "days") next.setUTCDate(next.getUTCDate() + amount);
  else if (unit === "hour" || unit === "hours") next.setUTCHours(next.getUTCHours() + amount);
  else if (unit === "minute" || unit === "minutes") next.setUTCMinutes(next.getUTCMinutes() + amount);
  else if (unit === "second" || unit === "seconds") next.setUTCSeconds(next.getUTCSeconds() + amount);
  else next.setTime(next.getTime() + amount);
  return next;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date, format: string, timezoneOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() + timezoneOffsetMinutes * 60_000);
  return format
    .replace(/YYYY/g, String(shifted.getUTCFullYear()))
    .replace(/MM/g, pad(shifted.getUTCMonth() + 1))
    .replace(/DD/g, pad(shifted.getUTCDate()))
    .replace(/HH/g, pad(shifted.getUTCHours()))
    .replace(/mm/g, pad(shifted.getUTCMinutes()))
    .replace(/ss/g, pad(shifted.getUTCSeconds()));
}

const dateTimeHandler: ActionHandler = async (params) => {
  const operation = normalizeOperation(params.operation, "now");
  const base = parseDate(params.date ?? params.timestamp);
  const compareTo = parseDate(params.compare_to, new Date());
  const amount = toNumber(params.amount, 0);
  const unit = normalizeOperation(params.unit, "seconds");
  const format = toText(params.format || "YYYY-MM-DD HH:mm:ss");
  const timezoneOffsetMinutes = toInt(params.timezone_offset_minutes, 0);

  let resultDate = base;
  let diffMs = 0;
  let result: unknown = base.toISOString();
  if (operation === "add") {
    resultDate = addToDate(base, amount, unit);
    result = resultDate.toISOString();
  } else if (operation === "subtract") {
    resultDate = addToDate(base, -amount, unit);
    result = resultDate.toISOString();
  } else if (operation === "format") {
    result = formatDate(base, format, timezoneOffsetMinutes);
  } else if (operation === "diff") {
    diffMs = base.getTime() - compareTo.getTime();
    result = diffMs;
  } else if (operation === "timestamp") {
    result = Math.floor(base.getTime() / 1000);
  } else if (operation === "iso") {
    result = base.toISOString();
  }

  const timestampMs = resultDate.getTime();
  return {
    result,
    timestamp: Math.floor(timestampMs / 1000),
    timestamp_ms: timestampMs,
    iso: resultDate.toISOString(),
    text: toText(result),
    diff_ms: diffMs,
    diff_seconds: Math.round(diffMs / 1000),
  };
};

const commonRuntime = {
  execution: "local" as const,
  sideEffects: false,
  allowNetwork: false,
};

export const DATA_NODE_PACKAGES: NodePackage[] = [
  {
    definition: {
      id: "math",
      version: "1.0.0",
      name: "Math",
      description: "Math operations: add/subtract/multiply/divide/mod/random/round.",
      category: "data",
      tags: ["math", "number", "transform"],
      inputs: [
        {
          name: "operation",
          type: "string",
          default: "add",
          options: [
            { value: "add", label: "add" },
            { value: "subtract", label: "subtract" },
            { value: "multiply", label: "multiply" },
            { value: "divide", label: "divide" },
            { value: "mod", label: "mod" },
            { value: "pow", label: "pow" },
            { value: "abs", label: "abs" },
            { value: "min", label: "min" },
            { value: "max", label: "max" },
            { value: "round", label: "round" },
            { value: "floor", label: "floor" },
            { value: "ceil", label: "ceil" },
            { value: "random", label: "random" },
          ],
          description: "Operation type.",
        },
        { name: "a", type: "number", default: 0, description: "First number." },
        { name: "b", type: "number", default: 0, description: "Second number." },
        { name: "min", type: "number", default: 0, description: "Random minimum." },
        { name: "max", type: "number", default: 1, description: "Random maximum." },
        { name: "precision", type: "integer", default: 0, description: "Decimal precision." },
      ],
      outputs: [
        { name: "result", type: "number", description: "Operation result." },
        { name: "number", type: "number", description: "Numeric result." },
        { name: "text", type: "string", description: "String result." },
      ],
      i18n: {
        name: { "zh-CN": "数学运算", "en-US": "Math" },
        description: { "zh-CN": "加减乘除、取模、随机数和取整。", "en-US": "Math operations and random numbers." },
      },
      ui: { icon: "calculator", color: "#22c55e", group: "data" },
      runtime: commonRuntime,
      compatibility: { engineVersion: ">=0.1.0" },
    },
    handler: mathHandler,
  },
  {
    definition: {
      id: "array_ops",
      version: "1.0.0",
      name: "Array Ops",
      description: "Array operations: length/push/pop/filter/map/find/join/slice.",
      category: "data",
      tags: ["array", "transform"],
      inputs: [
        {
          name: "operation",
          type: "string",
          default: "length",
          options: [
            { value: "length", label: "length" },
            { value: "push", label: "push" },
            { value: "pop", label: "pop" },
            { value: "shift", label: "shift" },
            { value: "unshift", label: "unshift" },
            { value: "first", label: "first" },
            { value: "last", label: "last" },
            { value: "get", label: "get" },
            { value: "join", label: "join" },
            { value: "includes", label: "includes" },
            { value: "index_of", label: "index_of" },
            { value: "slice", label: "slice" },
            { value: "reverse", label: "reverse" },
            { value: "unique", label: "unique" },
            { value: "filter", label: "filter" },
            { value: "find", label: "find" },
            { value: "map", label: "map" },
          ],
          description: "Operation type.",
        },
        { name: "items", type: "any", default: "", description: "Array, JSON array, or delimited text." },
        { name: "value", type: "any", default: "", description: "Value used by push/filter/find/includes." },
        { name: "path", type: "string", default: "", description: "Optional item field path." },
        {
          name: "operator",
          type: "string",
          default: "equals",
          options: [
            { value: "equals", label: "equals" },
            { value: "not_equals", label: "not_equals" },
            { value: "contains", label: "contains" },
            { value: "not_contains", label: "not_contains" },
            { value: "truthy", label: "truthy" },
            { value: "falsy", label: "falsy" },
          ],
          description: "Filter/find comparison operator.",
        },
        { name: "delimiter", type: "string", default: ",", description: "Text split delimiter." },
        { name: "joiner", type: "string", default: ",", description: "Join separator." },
        { name: "index", type: "integer", default: 0, description: "Index for get." },
        { name: "start", type: "integer", default: 0, description: "Start index for slice." },
        { name: "end", type: "integer", default: "", description: "End index for slice." },
      ],
      outputs: [
        { name: "result", type: "any", description: "Operation result." },
        { name: "items", type: "any", description: "Array result." },
        { name: "item", type: "any", description: "Single item result." },
        { name: "text", type: "string", description: "String result." },
        { name: "length", type: "integer", description: "Array length." },
        { name: "found", type: "boolean", description: "Whether a matching item was found." },
        { name: "index", type: "integer", description: "Matched index." },
      ],
      i18n: {
        name: { "zh-CN": "数组处理", "en-US": "Array Ops" },
        description: { "zh-CN": "数组长度、增删、过滤、查找、映射等操作。", "en-US": "Array length, mutation, filter, find, and map operations." },
      },
      ui: { icon: "list", color: "#14b8a6", group: "data" },
      runtime: commonRuntime,
      compatibility: { engineVersion: ">=0.1.0" },
    },
    handler: arrayOpsHandler,
  },
  {
    definition: {
      id: "date_time",
      version: "1.0.0",
      name: "Date Time",
      description: "Date/time operations: now, format, add/subtract, diff, timestamp.",
      category: "data",
      tags: ["date", "time", "transform"],
      inputs: [
        {
          name: "operation",
          type: "string",
          default: "now",
          options: [
            { value: "now", label: "now" },
            { value: "format", label: "format" },
            { value: "add", label: "add" },
            { value: "subtract", label: "subtract" },
            { value: "diff", label: "diff" },
            { value: "timestamp", label: "timestamp" },
            { value: "iso", label: "iso" },
          ],
          description: "Operation type.",
        },
        { name: "date", type: "string", default: "", description: "Input date/ISO/timestamp. Empty means now." },
        { name: "timestamp", type: "number", default: "", description: "Input timestamp in seconds or milliseconds." },
        { name: "compare_to", type: "string", default: "", description: "Date used by diff. Empty means now." },
        { name: "amount", type: "number", default: 0, description: "Amount for add/subtract." },
        {
          name: "unit",
          type: "string",
          default: "seconds",
          options: [
            { value: "seconds", label: "seconds" },
            { value: "minutes", label: "minutes" },
            { value: "hours", label: "hours" },
            { value: "days", label: "days" },
            { value: "months", label: "months" },
            { value: "years", label: "years" },
          ],
          description: "Date unit.",
        },
        { name: "format", type: "string", default: "YYYY-MM-DD HH:mm:ss", description: "Format tokens: YYYY MM DD HH mm ss." },
        { name: "timezone_offset_minutes", type: "integer", default: 0, description: "Timezone offset used only by format." },
      ],
      outputs: [
        { name: "result", type: "any", description: "Operation result." },
        { name: "timestamp", type: "integer", description: "Unix timestamp seconds." },
        { name: "timestamp_ms", type: "integer", description: "Unix timestamp milliseconds." },
        { name: "iso", type: "string", description: "ISO date string." },
        { name: "text", type: "string", description: "String result." },
        { name: "diff_ms", type: "integer", description: "Diff in milliseconds." },
        { name: "diff_seconds", type: "integer", description: "Diff in seconds." },
      ],
      i18n: {
        name: { "zh-CN": "日期时间", "en-US": "Date Time" },
        description: { "zh-CN": "格式化日期、加减时间、计算时差和时间戳。", "en-US": "Format dates, add/subtract time, diff, and timestamps." },
      },
      ui: { icon: "calendar", color: "#f59e0b", group: "data" },
      runtime: commonRuntime,
      compatibility: { engineVersion: ">=0.1.0" },
    },
    handler: dateTimeHandler,
  },
];

export default DATA_NODE_PACKAGES;
