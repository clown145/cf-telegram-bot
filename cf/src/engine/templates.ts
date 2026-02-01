const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  if (!template) {
    return "";
  }
  return template.replace(TOKEN_RE, (_match, expr) => {
    try {
      const value = evalExpression(String(expr), context);
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    } catch (error) {
      return "";
    }
  });
}

export function renderStructure(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return renderTemplate(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderStructure(entry, context));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = renderStructure(entry, context);
    }
    return result;
  }
  return value;
}

export function coerceToBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["", "0", "false", "none", "null", "no", "off"].includes(lowered)) {
      return false;
    }
    return true;
  }
  return Boolean(value);
}

function evalExpression(expr: string, context: Record<string, unknown>): unknown {
  const trimmed = expr.trim();
  const parts = trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return "";
  }
  let value = evalBasicValue(parts[0], context);

  for (const filter of parts.slice(1)) {
    const filterName = filter.toLowerCase();
    if (filterName === "tojson") {
      value = JSON.stringify(value);
    } else if (filterName === "urlencode") {
      value = encodeURIComponent(String(value ?? ""));
    } else if (filterName === "zip") {
      // noop placeholder to keep templates compatible
      value = value;
    }
  }

  return value;
}

function evalBasicValue(expr: string, context: Record<string, unknown>): unknown {
  const comparison = parseComparison(expr);
  if (comparison) {
    const left = evalBasicValue(comparison.left, context);
    const right = evalBasicValue(comparison.right, context);
    switch (comparison.operator) {
      case "==":
        return left == right;
      case "!=":
        return left != right;
      case ">":
        return (left as any) > (right as any);
      case ">=":
        return (left as any) >= (right as any);
      case "<":
        return (left as any) < (right as any);
      case "<=":
        return (left as any) <= (right as any);
      default:
        return false;
    }
  }

  if ((expr.startsWith("\"") && expr.endsWith("\"")) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }

  if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
    return Number(expr);
  }

  const lowered = expr.toLowerCase();
  if (lowered === "true") {
    return true;
  }
  if (lowered === "false") {
    return false;
  }
  if (lowered === "null" || lowered === "none") {
    return null;
  }

  return resolvePath(expr, context);
}

function parseComparison(expr: string): { left: string; operator: string; right: string } | null {
  const match = expr.match(/^(.*?)(==|!=|>=|<=|>|<)(.*)$/);
  if (!match) {
    return null;
  }
  return {
    left: match[1].trim(),
    operator: match[2],
    right: match[3].trim(),
  };
}

function resolvePath(expr: string, context: Record<string, unknown>): unknown {
  const path = expr.replace(/\[(\d+)\]/g, ".$1");
  const parts = path.split(".").filter(Boolean);
  let current: any = context;
  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
