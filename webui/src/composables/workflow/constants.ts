export const CONTROL_PORT_NAME = "__control__";
export const LEGACY_CONTROL_PORT_NAME = "control_input";
export const CONTROL_INPUT_NAMES = new Set([CONTROL_PORT_NAME, LEGACY_CONTROL_PORT_NAME]);

const CONTROL_FLOW_OUTPUT_NAMES = new Set(["next", "true", "false", "try", "catch"]);

export const isControlFlowOutputName = (name: string) => {
  const value = String(name || "").trim();
  return CONTROL_FLOW_OUTPUT_NAMES.has(value);
};
