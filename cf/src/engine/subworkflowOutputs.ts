import type { ActionExecutionResult, WorkflowDefinition, WorkflowEdge } from "../types";

export const TERMINAL_OUTPUT_PREFIX = "terminal_";

const CONTROL_INPUT_NAMES = new Set(["__control__", "control_input"]);
const CONTROL_OUTPUT_NAMES = new Set([
  "__control__",
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
const CONTROL_OUTPUT_PREFIXES = ["case_", "case:"];

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function sanitizeOutputToken(raw: unknown): string {
  const value = String(raw || "").trim().replace(/[^A-Za-z0-9_]/g, "_");
  if (!value) {
    return "value";
  }
  return value.replace(/_+/g, "_");
}

export function buildTerminalOutputName(terminalNodeId: string, outputName: string): string {
  const safeNode = sanitizeOutputToken(terminalNodeId);
  const safeOutput = sanitizeOutputToken(outputName);
  return `${TERMINAL_OUTPUT_PREFIX}${safeNode}__${safeOutput}`;
}

function isControlOutputName(raw: unknown): boolean {
  const value = String(raw || "").trim();
  if (!value) {
    return false;
  }
  if (CONTROL_OUTPUT_NAMES.has(value)) {
    return true;
  }
  return CONTROL_OUTPUT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isControlEdge(edge: WorkflowEdge): boolean {
  const targetInput = String(edge?.target_input || "").trim();
  const sourceOutput = String(edge?.source_output || "").trim();
  if (CONTROL_INPUT_NAMES.has(targetInput)) {
    return true;
  }
  return isControlOutputName(sourceOutput);
}

function collectTerminalNodeIds(workflow?: WorkflowDefinition | null): string[] {
  if (!workflow || !workflow.nodes || typeof workflow.nodes !== "object") {
    return [];
  }
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const outgoingControlSources = new Set<string>();
  for (const edge of edges) {
    if (!edge || !isControlEdge(edge)) {
      continue;
    }
    const sourceNodeId = String(edge.source_node || "").trim();
    if (!sourceNodeId) {
      continue;
    }
    outgoingControlSources.add(sourceNodeId);
  }
  return Object.keys(workflow.nodes).filter((nodeId) => nodeId && !outgoingControlSources.has(nodeId));
}

function extractEngineNodeOutputs(result: ActionExecutionResult): Record<string, Record<string, unknown>> {
  const variables = normalizeRecord(result.data?.variables);
  const engine = normalizeRecord(variables.__engine__);
  const nodes = normalizeRecord(engine.nodes);
  const nodeOutputs: Record<string, Record<string, unknown>> = {};
  for (const [nodeId, outputs] of Object.entries(nodes)) {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) {
      continue;
    }
    nodeOutputs[normalizedNodeId] = normalizeRecord(outputs);
  }
  return nodeOutputs;
}

export function collectSubWorkflowTerminalOutputs(args: {
  workflow?: WorkflowDefinition | null;
  result: ActionExecutionResult;
}): {
  grouped: Record<string, Record<string, unknown>>;
  flattened: Record<string, unknown>;
} {
  const nodeOutputs = extractEngineNodeOutputs(args.result);
  const terminalNodeIds = collectTerminalNodeIds(args.workflow);
  const candidateNodeIds = terminalNodeIds.length ? terminalNodeIds : Object.keys(nodeOutputs);

  const grouped: Record<string, Record<string, unknown>> = {};
  const flattened: Record<string, unknown> = {};

  for (const nodeId of candidateNodeIds) {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) {
      continue;
    }
    const outputs = normalizeRecord(nodeOutputs[normalizedNodeId]);
    const normalizedOutputs: Record<string, unknown> = {};
    for (const [outputName, outputValue] of Object.entries(outputs)) {
      const normalizedOutputName = String(outputName || "").trim();
      if (!normalizedOutputName || normalizedOutputName.startsWith("__")) {
        continue;
      }
      normalizedOutputs[normalizedOutputName] = outputValue;
      flattened[buildTerminalOutputName(normalizedNodeId, normalizedOutputName)] = outputValue;
    }
    if (Object.keys(normalizedOutputs).length > 0) {
      grouped[normalizedNodeId] = normalizedOutputs;
    }
  }

  return { grouped, flattened };
}

export function extractTerminalOutputVariables(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!key.startsWith(TERMINAL_OUTPUT_PREFIX)) {
      continue;
    }
    result[key] = value;
  }
  return result;
}
