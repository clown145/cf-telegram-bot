export const CONTROL_PORT_NAME = "__control__";
export const LEGACY_CONTROL_PORT_NAME = "control_input";
export const CONTROL_INPUT_NAMES = new Set([CONTROL_PORT_NAME, LEGACY_CONTROL_PORT_NAME]);

const CONTROL_FLOW_OUTPUT_NAMES = new Set([
  CONTROL_PORT_NAME,
  "next",
  "true",
  "false",
  "loop",
  "done",
  "try",
  "catch",
  "success",
  "error",
  "default",
]);
const CONTROL_FLOW_OUTPUT_PREFIXES = ["case_", "case:"];

export const isControlFlowOutputName = (name: string) => {
  const value = String(name || "").trim();
  if (!value) {
    return false;
  }
  if (CONTROL_FLOW_OUTPUT_NAMES.has(value)) {
    return true;
  }
  return CONTROL_FLOW_OUTPUT_PREFIXES.some((prefix) => value.startsWith(prefix));
};
