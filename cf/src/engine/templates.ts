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
  const parts = splitTopLevelFilters(trimmed).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return "";
  }
  let value = evalBasicValue(parts[0], context);

  for (const filter of parts.slice(1)) {
    const parsed = parseFilter(filter);
    const filterName = parsed.name.toLowerCase();
    if (filterName === "tojson") {
      value = JSON.stringify(value);
    } else if (filterName === "urlencode") {
      value = encodeURIComponent(String(value ?? ""));
    } else if (filterName === "default") {
      if (value === null || value === undefined || value === "") {
        value = parsed.args.length ? evalBasicValue(parsed.args[0], context) : "";
      }
    } else if (filterName === "upper") {
      value = String(value ?? "").toUpperCase();
    } else if (filterName === "lower") {
      value = String(value ?? "").toLowerCase();
    } else if (filterName === "trim") {
      value = String(value ?? "").trim();
    } else if (filterName === "length" || filterName === "size") {
      value = getLength(value);
    } else if (filterName === "first") {
      value = Array.isArray(value) ? value[0] : String(value ?? "")[0] || "";
    } else if (filterName === "last") {
      value = Array.isArray(value) ? value[value.length - 1] : String(value ?? "").slice(-1);
    } else if (filterName === "join") {
      const separator = parsed.args.length ? String(evalBasicValue(parsed.args[0], context) ?? "") : ",";
      value = Array.isArray(value) ? value.map((entry) => String(entry ?? "")).join(separator) : String(value ?? "");
    } else if (filterName === "zip") {
      // noop placeholder to keep templates compatible
      value = value;
    }
  }

  return value;
}

function evalBasicValue(expr: string, context: Record<string, unknown>): unknown {
  expr = stripOuterParens(expr.trim());

  const ternary = splitTernary(expr);
  if (ternary) {
    return coerceToBool(evalBasicValue(ternary.condition, context))
      ? evalBasicValue(ternary.truthy, context)
      : evalBasicValue(ternary.falsy, context);
  }

  const logicalOr = splitByTopLevelOperator(expr, ["||"]);
  if (logicalOr) {
    return coerceToBool(evalBasicValue(logicalOr.left, context)) || coerceToBool(evalBasicValue(logicalOr.right, context));
  }

  const logicalAnd = splitByTopLevelOperator(expr, ["&&"]);
  if (logicalAnd) {
    return coerceToBool(evalBasicValue(logicalAnd.left, context)) && coerceToBool(evalBasicValue(logicalAnd.right, context));
  }

  if (expr.startsWith("!") && !expr.startsWith("!=")) {
    return !coerceToBool(evalBasicValue(expr.slice(1), context));
  }

  const comparison = splitByTopLevelOperator(expr, ["==", "!=", ">=", "<=", ">", "<"]);
  if (comparison) {
    const left = evalBasicValue(comparison.left, context);
    const right = evalBasicValue(comparison.right, context);
    return evaluateComparison(left, comparison.operator, right);
  }

  const additive = splitByTopLevelOperator(expr, ["+", "-"], true);
  if (additive) {
    const left = evalBasicValue(additive.left, context);
    const right = evalBasicValue(additive.right, context);
    if (additive.operator === "+") {
      const leftNum = Number(left);
      const rightNum = Number(right);
      if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
        return leftNum + rightNum;
      }
      return String(left ?? "") + String(right ?? "");
    }
    return Number(left) - Number(right);
  }

  const multiplicative = splitByTopLevelOperator(expr, ["*", "/", "%"]);
  if (multiplicative) {
    const left = Number(evalBasicValue(multiplicative.left, context));
    const right = Number(evalBasicValue(multiplicative.right, context));
    if (multiplicative.operator === "*") return left * right;
    if (multiplicative.operator === "/") return right === 0 ? undefined : left / right;
    return right === 0 ? undefined : left % right;
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

function splitTopLevelFilters(expr: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (quote) {
      if (ch === "\\" && i + 1 < expr.length) {
        i += 1;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === "|" && depth === 0 && expr[i - 1] !== "|" && expr[i + 1] !== "|") {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

function parseFilter(filter: string): { name: string; args: string[] } {
  const trimmed = filter.trim();
  const open = trimmed.indexOf("(");
  if (open < 0 || !trimmed.endsWith(")")) {
    return { name: trimmed, args: [] };
  }
  return {
    name: trimmed.slice(0, open).trim(),
    args: splitArguments(trimmed.slice(open + 1, -1)),
  };
}

function splitArguments(input: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === "\\" && i + 1 < input.length) {
        i += 1;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      args.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) {
    args.push(tail);
  }
  return args;
}

function stripOuterParens(expr: string): string {
  let current = expr;
  while (current.startsWith("(") && current.endsWith(")") && enclosesWholeExpression(current)) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

function enclosesWholeExpression(expr: string): boolean {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (quote) {
      if (ch === "\\" && i + 1 < expr.length) {
        i += 1;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0 && i < expr.length - 1) {
        return false;
      }
    }
  }
  return depth === 0;
}

function splitTernary(expr: string): { condition: string; truthy: string; falsy: string } | null {
  let depth = 0;
  let quote = "";
  let questionIndex = -1;
  let nested = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (quote) {
      if (ch === "\\" && i + 1 < expr.length) {
        i += 1;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch === "?") {
      if (questionIndex < 0) {
        questionIndex = i;
      } else {
        nested += 1;
      }
    } else if (depth === 0 && ch === ":" && questionIndex >= 0) {
      if (nested > 0) {
        nested -= 1;
        continue;
      }
      return {
        condition: expr.slice(0, questionIndex).trim(),
        truthy: expr.slice(questionIndex + 1, i).trim(),
        falsy: expr.slice(i + 1).trim(),
      };
    }
  }
  return null;
}

function splitByTopLevelOperator(
  expr: string,
  operators: string[],
  allowUnary = false
): { left: string; operator: string; right: string } | null {
  let depth = 0;
  let quote = "";
  for (let i = expr.length - 1; i >= 0; i -= 1) {
    const ch = expr[i];
    if (quote) {
      if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") depth += 1;
    else if (ch === "(" || ch === "[" || ch === "{") depth = Math.max(0, depth - 1);
    if (depth !== 0) {
      continue;
    }
    for (const operator of operators) {
      const start = i - operator.length + 1;
      if (start < 0 || expr.slice(start, i + 1) !== operator) {
        continue;
      }
      if (allowUnary && (operator === "+" || operator === "-") && isUnaryOperator(expr, start)) {
        continue;
      }
      const left = expr.slice(0, start).trim();
      const right = expr.slice(i + 1).trim();
      if (!left || !right) {
        continue;
      }
      return { left, operator, right };
    }
  }
  return null;
}

function isUnaryOperator(expr: string, operatorIndex: number): boolean {
  if (operatorIndex === 0) {
    return true;
  }
  let i = operatorIndex - 1;
  while (i >= 0 && /\s/.test(expr[i])) {
    i -= 1;
  }
  if (i < 0) {
    return true;
  }
  return /[+\-*/%(<>=!?:,&|]/.test(expr[i]);
}

function evaluateComparison(left: unknown, operator: string, right: unknown): boolean {
  switch (operator) {
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

function getLength(value: unknown): number {
  if (Array.isArray(value) || typeof value === "string") {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return value === null || value === undefined ? 0 : String(value).length;
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
