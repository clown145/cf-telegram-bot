import type { ActionHandler } from "../../handlers";

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function toArray(value: unknown, delimiter: string): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => toText(entry));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((entry) => toText(entry));
        }
      } catch {
        // ignore json parse error and fallback to split
      }
    }
    if (!trimmed) {
      return [];
    }
    return delimiter === "" ? trimmed.split("") : trimmed.split(delimiter);
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [toText(value)];
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.trunc(n);
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const handler: ActionHandler = async (params) => {
  const operation = String(params.operation || "split").trim().toLowerCase();
  const valueText = toText(params.value);
  const delimiter = toText(params.delimiter === undefined ? "," : params.delimiter);
  const joiner = toText(params.joiner === undefined ? "," : params.joiner);
  const search = toText(params.search);
  const replaceWith = toText(params.replace_with);
  const start = toInt(params.start, 0);
  const end = toInt(params.end, -1);
  const caseSensitive = params.case_sensitive === undefined ? true : Boolean(params.case_sensitive);

  let result: unknown = valueText;
  let text = valueText;
  let items: unknown[] = [];
  let contains = false;

  if (operation === "split") {
    items = delimiter === "" ? valueText.split("") : valueText.split(delimiter);
    result = items;
    text = JSON.stringify(items);
  } else if (operation === "join") {
    items = toArray(params.items ?? params.value, delimiter);
    text = items.join(joiner);
    result = text;
  } else if (operation === "replace") {
    if (!search) {
      text = valueText;
      result = text;
    } else if (caseSensitive) {
      text = valueText.split(search).join(replaceWith);
      result = text;
    } else {
      const re = new RegExp(escapeRegex(search), "gi");
      text = valueText.replace(re, replaceWith);
      result = text;
    }
  } else if (operation === "substring") {
    text = end >= 0 ? valueText.slice(start, end) : valueText.slice(start);
    result = text;
  } else if (operation === "contains") {
    if (!search) {
      contains = false;
    } else if (caseSensitive) {
      contains = valueText.includes(search);
    } else {
      contains = valueText.toLowerCase().includes(search.toLowerCase());
    }
    result = contains;
    text = contains ? "true" : "false";
  } else if (operation === "trim") {
    text = valueText.trim();
    result = text;
  } else if (operation === "to_upper") {
    text = valueText.toUpperCase();
    result = text;
  } else if (operation === "to_lower") {
    text = valueText.toLowerCase();
    result = text;
  } else if (operation === "length") {
    const length = valueText.length;
    result = length;
    text = String(length);
  }

  const length = Array.isArray(result)
    ? result.length
    : typeof result === "string"
      ? result.length
      : typeof result === "number"
        ? result
        : text.length;

  return {
    result,
    text,
    items,
    contains,
    length,
  };
};