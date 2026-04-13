import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "../../../../shared/workflow";
import { CONTROL_INPUT_NAMES, isControlFlowOutputName } from "./constants";

type WorkflowRecordLike = Record<string, unknown> & { data?: unknown };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const parseWorkflowRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isPlainObject(value) ? value : null;
};

const normalizeNodePosition = (value: unknown): { x: number; y: number } => {
  const position = isPlainObject(value) ? value : {};
  const x = Number(position.x);
  const y = Number(position.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
};

const cloneWorkflowNodes = (value: unknown): Record<string, WorkflowNode> => {
  if (!isPlainObject(value)) {
    return {};
  }

  const next: Record<string, WorkflowNode> = {};
  for (const [nodeKey, nodeValue] of Object.entries(value)) {
    if (!isPlainObject(nodeValue)) {
      continue;
    }
    next[nodeKey] = {
      id: String(nodeValue.id || nodeKey),
      action_id: String(nodeValue.action_id || ""),
      position: normalizeNodePosition(nodeValue.position),
      data: isPlainObject(nodeValue.data) ? { ...nodeValue.data } : {},
    };
  }
  return next;
};

const cloneWorkflowEdges = (value: unknown): WorkflowEdge[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((edge): edge is Record<string, unknown> => isPlainObject(edge))
    .map((edge, index) => ({
      id: String(edge.id || `edge-${index}`),
      source_node: String(edge.source_node || ""),
      source_output: String(edge.source_output || ""),
      source_path: edge.source_path === undefined ? undefined : String(edge.source_path || ""),
      target_node: String(edge.target_node || ""),
      target_input: String(edge.target_input || ""),
    }));
};

export const isCanonicalWorkflowDefinition = (workflowRaw: unknown): workflowRaw is WorkflowDefinition => {
  if (!isPlainObject(workflowRaw)) {
    return false;
  }
  return isPlainObject(workflowRaw.nodes) && Array.isArray(workflowRaw.edges);
};

export const readWorkflowDefinition = (workflowRaw: unknown): WorkflowDefinition | null => {
  if (!isPlainObject(workflowRaw)) {
    return null;
  }

  const workflow = workflowRaw as WorkflowRecordLike;
  const legacy = parseWorkflowRecord(workflow.data);
  const source = isCanonicalWorkflowDefinition(workflow) ? workflow : legacy;

  const id = String(workflow.id || source?.id || "").trim();
  const name = String(workflow.name || source?.name || id).trim();
  const descriptionSource = workflow.description ?? source?.description;

  if (!source && !id && !name) {
    return null;
  }

  return {
    id,
    name,
    ...(descriptionSource === undefined || descriptionSource === null
      ? {}
      : { description: String(descriptionSource) }),
    nodes: cloneWorkflowNodes(source?.nodes),
    edges: cloneWorkflowEdges(source?.edges),
  };
};

export const ensureWorkflowDefinitionCanonical = (workflowRaw: unknown): WorkflowDefinition | null => {
  const canonical = readWorkflowDefinition(workflowRaw);
  if (!canonical) {
    return null;
  }
  if (isPlainObject(workflowRaw)) {
    const target = workflowRaw as WorkflowRecordLike;
    target.id = canonical.id;
    target.name = canonical.name;
    target.description = canonical.description;
    target.nodes = canonical.nodes;
    target.edges = canonical.edges;
    if (Object.prototype.hasOwnProperty.call(target, "data")) {
      delete target.data;
    }
    return target as unknown as WorkflowDefinition;
  }
  return canonical;
};

export const getHiddenWorkflowEdges = (workflowRaw: unknown): WorkflowEdge[] => {
  const workflow = readWorkflowDefinition(workflowRaw);
  if (!workflow) {
    return [];
  }
  return (workflow.edges || [])
    .filter((edge) => {
      if (!edge) return false;
      if (CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) return false;
      if (isControlFlowOutputName(String(edge.source_output || ""))) return false;
      return true;
    })
    .map((edge) => ({ ...edge }));
};

export const createCanonicalWorkflowDefinition = (
  input: Partial<WorkflowDefinition>,
  existingWorkflowRaw?: unknown
): WorkflowDefinition => {
  const hiddenEdges = getHiddenWorkflowEdges(existingWorkflowRaw);
  const baseEdges = Array.isArray(input.edges) ? input.edges.map((edge) => ({ ...edge })) : [];
  return {
    id: String(input.id || "").trim(),
    name: String(input.name || "").trim(),
    ...(input.description === undefined ? {} : { description: String(input.description) }),
    nodes: cloneWorkflowNodes(input.nodes),
    edges: [...baseEdges, ...hiddenEdges],
  };
};

export const normalizeWorkflowMap = (workflowsRaw: unknown): Record<string, WorkflowDefinition> => {
  if (!isPlainObject(workflowsRaw)) {
    return {};
  }

  const normalized: Record<string, WorkflowDefinition> = {};
  for (const [workflowId, workflowRaw] of Object.entries(workflowsRaw)) {
    const canonical = readWorkflowDefinition(
      isPlainObject(workflowRaw)
        ? ({ id: workflowId, ...workflowRaw } as WorkflowRecordLike)
        : { id: workflowId, name: workflowId }
    );
    if (!canonical) {
      continue;
    }
    normalized[workflowId] = {
      ...canonical,
      id: canonical.id || workflowId,
      name: canonical.name || workflowId,
    };
  }
  return normalized;
};
