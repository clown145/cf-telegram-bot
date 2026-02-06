import type { ActionHandler } from "../../handlers";

function detectType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function stringifyValue(value: unknown, pretty: boolean, indent: number): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, pretty ? indent : undefined);
}

export const handler: ActionHandler = async (params) => {
  const mode = String(params.mode || "parse").trim().toLowerCase();
  const pretty = Boolean(params.pretty);
  const indentRaw = Number(params.indent);
  const indent = Number.isFinite(indentRaw) ? Math.max(0, Math.min(8, Math.trunc(indentRaw))) : 2;
  const failOnError = Boolean(params.fail_on_error);

  try {
    if (mode === "stringify") {
      const text = stringifyValue(params.value, pretty, indent);
      return {
        result: text,
        text,
        is_valid: true,
        error: "",
        value_type: "string",
      };
    }

    let parsed: unknown;
    if (typeof params.value === "string") {
      parsed = JSON.parse(params.value || "");
    } else {
      parsed = params.value;
    }

    return {
      result: parsed,
      text: stringifyValue(parsed, pretty, indent),
      is_valid: true,
      error: "",
      value_type: detectType(parsed),
    };
  } catch (error) {
    const message = String(error);
    if (failOnError) {
      throw new Error(message);
    }
    return {
      result: null,
      text: "",
      is_valid: false,
      error: message,
      value_type: "error",
    };
  }
};