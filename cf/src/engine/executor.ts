import { MODULAR_ACTION_HANDLERS, buildActionResult } from "../actions/handlers";
import {
  ActionExecutionResult,
  ButtonsModel,
  PendingContinuation,
  PendingExecution,
  RuntimeContext,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "../types";
import { coerceToBool, renderStructure, renderTemplate } from "./templates";

export type WorkflowNodeTraceStatus = "success" | "error" | "skipped" | "pending";

export interface WorkflowNodeTrace {
  workflow_id: string;
  node_id: string;
  action_id: string;
  action_kind: string;
  allowed: boolean;
  status: WorkflowNodeTraceStatus;
  started_at: number;
  finished_at: number;
  duration_ms: number;
  flow_output?: string;
  rendered_params?: Record<string, unknown>;
  result?: ActionExecutionResult;
  error?: string;
}

export interface ExecutionTracer {
  onNodeTrace?: (trace: WorkflowNodeTrace) => void;
}

interface ExecuteContext {
  env: Record<string, unknown>;
  state: ButtonsModel;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  runtime: RuntimeContext;
  preview?: boolean;
  tracer?: ExecutionTracer;
}

interface ActionDefinitionShape {
  id?: string;
  name?: string;
  kind?: string;
  config?: Record<string, unknown>;
  limits?: Record<string, unknown>;
}

interface WorkflowNodeDef {
  action_id: string;
  data: Record<string, unknown>;
}

interface TryHandlerEntry {
  try_node_id: string;
  catch_node_id: string;
}

interface NodeExecutionPolicy {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  retryBackoff: "fixed" | "exponential";
}

const SPECIAL_RESULT_KEYS = new Set([
  "new_text",
  "parse_mode",
  "next_menu_id",
  "button_overrides",
  "notification",
  "new_message_chain",
  "temp_files_to_clean",
  "button_title",
]);

const CONTROL_OUTPUTS = new Set([
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
const CONTROL_INPUT_NAMES = new Set(["__control__", "control_input"]);
const CONTROL_OUTPUT_PREFIXES = ["case_", "case:"];
const MAX_WORKFLOW_STEPS = 10000;
const MAX_WORKFLOW_CALL_DEPTH = 16;
const MAX_NODE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_NODE_RETRY_COUNT = 10;
const MAX_NODE_RETRY_DELAY_MS = 60 * 1000;
const ENGINE_STATE_KEY = "__engine__";
const WORKFLOW_CALL_STACK_KEY = "__workflow_call_stack__";
const TRY_STACK_KEY = "try_stack";
const LAST_ERROR_KEY = "last_error";
const LAST_ERROR_NODE_KEY = "last_error_node_id";
const LAST_TRY_NODE_KEY = "last_try_node_id";

export function buildRuntimeContext(payload: Record<string, unknown>, menuId?: string | null): RuntimeContext {
  const variables = { ...(payload.variables as Record<string, unknown> | undefined) };
  if (menuId && variables.menu_id === undefined) {
    variables.menu_id = menuId;
  }
  return {
    chat_id: String(payload.chat_id ?? "0"),
    chat_type: payload.chat_type ? String(payload.chat_type) : undefined,
    message_id: payload.message_id ? Number(payload.message_id) : undefined,
    thread_id: payload.thread_id ? Number(payload.thread_id) : undefined,
    user_id: payload.user_id ? String(payload.user_id) : undefined,
    username: payload.username ? String(payload.username) : undefined,
    full_name: payload.full_name ? String(payload.full_name) : undefined,
    callback_data: payload.callback_data ? String(payload.callback_data) : undefined,
    variables,
  };
}

function normalizeWorkflowCallStack(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized = raw
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function cloneNodeOutputsMap(input: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [nodeId, variables] of Object.entries(input || {})) {
    out[nodeId] =
      variables && typeof variables === "object" && !Array.isArray(variables)
        ? { ...(variables as Record<string, unknown>) }
        : {};
  }
  return out;
}

function cloneRuntimeContext(runtime: RuntimeContext): RuntimeContext {
  return {
    ...runtime,
    variables: { ...(runtime.variables || {}) },
  };
}

export async function executeActionPreview(args: {
  env: Record<string, unknown>;
  state: ButtonsModel;
  action: ActionDefinitionShape;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  runtime: RuntimeContext;
  preview?: boolean;
}): Promise<ActionExecutionResult> {
  const { env, state, action, button, menu, runtime, preview } = args;
  const kind = String(action.kind || "http");

  if (kind === "workflow") {
    const workflowId = String(action.config?.workflow_id || "");
    if (!workflowId) {
      return { success: false, error: "workflow action missing workflow_id" };
    }
    const workflow = state.workflows?.[workflowId];
    if (!workflow) {
      return { success: false, error: `workflow not found: ${workflowId}` };
    }
    return executeWorkflow(
      { env, state, button, menu, runtime, preview: Boolean(preview) },
      workflow
    );
  }

  return executeSingleAction({ env, state, button, menu, runtime, preview: Boolean(preview) }, action);
}

export interface ResumeState {
  exec_order: string[];
  next_index: number;
  node_outputs: Record<string, Record<string, unknown>>;
  global_variables: Record<string, unknown>;
  final_text_parts?: string[];
  temp_files_to_clean?: string[];
}

export async function executeWorkflowWithResume(
  ctx: ExecuteContext,
  workflow: WorkflowDefinition,
  resume?: ResumeState
): Promise<ActionExecutionResult> {
  return executeWorkflow(ctx, workflow, resume);
}

async function executeWorkflow(
  ctx: ExecuteContext,
  workflow: WorkflowDefinition,
  resume?: ResumeState
): Promise<ActionExecutionResult> {
  const nodes = workflow.nodes || {};
  const edges = workflow.edges || [];
  if (!nodes || Object.keys(nodes).length === 0) {
    return { success: true, new_text: "工作流为空，执行完成。" };
  }

  const topo = resume ? null : topologicalSort(nodes, edges);
  const order = resume?.exec_order || (topo ? topo.order : []);
  const error = resume ? undefined : topo?.error;
  if (error) {
    return { success: false, error };
  }

  const nodeOutputs: Record<string, Record<string, unknown>> = resume?.node_outputs || {};
  const finalResult: ActionExecutionResult = { success: true };
  const finalTextParts: string[] = resume?.final_text_parts ? [...resume.final_text_parts] : [];
  const baseVariables = resume?.global_variables || { ...(ctx.runtime.variables || {}) };
  const inheritedCallStack = normalizeWorkflowCallStack(baseVariables[WORKFLOW_CALL_STACK_KEY]);
  let globalVariables: Record<string, unknown>;
  if (resume) {
    globalVariables = baseVariables;
  } else {
    if (inheritedCallStack.includes(workflow.id)) {
      return {
        success: false,
        error: `detected recursive workflow call: ${[...inheritedCallStack, workflow.id].join(" -> ")}`,
      };
    }
    if (inheritedCallStack.length >= MAX_WORKFLOW_CALL_DEPTH) {
      return {
        success: false,
        error: `workflow call depth exceeded limit (${MAX_WORKFLOW_CALL_DEPTH})`,
      };
    }
    globalVariables = {
      ...baseVariables,
      [WORKFLOW_CALL_STACK_KEY]: [...inheritedCallStack, workflow.id],
    };
  }
  const filesToClean: string[] = resume?.temp_files_to_clean ? [...resume.temp_files_to_clean] : [];
  const startIndex = resume?.next_index ?? 0;
  const maxSteps = resolveMaxSteps(workflow, ctx.runtime);

  const indexMap = new Map<string, number>();
  order.forEach((id, idx) => indexMap.set(id, idx));
  const controlEdges: Record<string, Record<string, string>> = {};
  for (const edge of edges) {
    if (!isControlOutput(edge.source_output)) {
      continue;
    }
    if (!controlEdges[edge.source_node]) {
      controlEdges[edge.source_node] = {};
    }
    if (!controlEdges[edge.source_node][edge.source_output]) {
      controlEdges[edge.source_node][edge.source_output] = edge.target_node;
    }
  }

  let index = startIndex;
  let steps = 0;
  while (index < order.length) {
    if (steps > maxSteps) {
      return { success: false, error: `workflow exceeded max steps (${maxSteps})` };
    }
    steps += 1;
    const nodeId = order[index];
    const nodeDef = nodes[nodeId] as unknown as WorkflowNode;
    const { result, error: nodeError } = await executeWorkflowNode(
      ctx,
      workflow.id,
      nodeId,
      nodeDef,
      globalVariables,
      nodeOutputs,
      edges
    );
    if (nodeError) {
      nodeOutputs[nodeId] = { error: nodeError };
      const catchEntry = popTryHandler(globalVariables);
      if (catchEntry && indexMap.has(catchEntry.catch_node_id)) {
        setEngineError(globalVariables, nodeError, nodeId, catchEntry.try_node_id);
        index = indexMap.get(catchEntry.catch_node_id) as number;
        continue;
      }
      return { success: false, error: nodeError };
    }
    if (!result) {
      return { success: false, error: `node ${nodeId} returned empty result` };
    }
    if (result.pending) {
      const pending = result.pending;
      const nestedPending = Boolean(pending.workflow_id && pending.workflow_id !== workflow.id);
      if (nestedPending) {
        const meta =
          pending.meta && typeof pending.meta === "object" && !Array.isArray(pending.meta)
            ? (pending.meta as Record<string, unknown>)
            : {};
        const source = String(meta.source || "");
        if (source !== "sub_workflow") {
          return {
            success: false,
            error: `node ${nodeId} returned unsupported nested pending from workflow ${String(pending.workflow_id)}`,
          };
        }
        const continuation: PendingContinuation = {
          type: "sub_workflow",
          workflow_id: workflow.id,
          node_id: nodeId,
          exec_order: [...order],
          next_index: index,
          node_outputs: cloneNodeOutputsMap(nodeOutputs),
          global_variables: { ...globalVariables },
          final_text_parts: [...finalTextParts],
          temp_files_to_clean: [...filesToClean],
          runtime: cloneRuntimeContext(ctx.runtime),
          button: { ...(ctx.button || {}) },
          menu: { ...(ctx.menu || {}) },
          sub_workflow: {
            propagate_error: Boolean(meta.propagate_error),
          },
        };
        pending.continuations = [...(pending.continuations || []), continuation];
        return result;
      }

      pending.exec_order = [...order];
      pending.next_index = index + 1;
      pending.node_outputs = cloneNodeOutputsMap(nodeOutputs);
      pending.global_variables = { ...globalVariables };
      pending.final_text_parts = [...finalTextParts];
      pending.temp_files_to_clean = [...filesToClean];
      pending.workflow_id = workflow.id;
      pending.node_id = nodeId;
      pending.runtime = cloneRuntimeContext(ctx.runtime);
      pending.button = { ...(ctx.button || {}) };
      pending.menu = { ...(ctx.menu || {}) };
      return result;
    }
    if (result.temp_files_to_clean && result.temp_files_to_clean.length) {
      filesToClean.push(...result.temp_files_to_clean);
    }
    if (result.data && typeof result.data.variables === "object" && result.data.variables) {
      nodeOutputs[nodeId] = result.data.variables as Record<string, unknown>;
      Object.assign(globalVariables, result.data.variables as Record<string, unknown>);
    } else {
      nodeOutputs[nodeId] = {};
    }
    updateEngineState(globalVariables, nodeId, nodeOutputs[nodeId], steps);
    mergeWorkflowResult(result, finalResult, finalTextParts);
    if (nodeDef.action_id === "try_catch") {
      const catchTarget = controlEdges[nodeId]?.catch;
      if (catchTarget) {
        pushTryHandler(globalVariables, { try_node_id: nodeId, catch_node_id: catchTarget });
      }
    }

    let nextIndex = index + 1;
    if (result.flow_output) {
      const targetId = controlEdges[nodeId]?.[result.flow_output];
      if (targetId && indexMap.has(targetId)) {
        nextIndex = indexMap.get(targetId) as number;
      }
    }
    index = nextIndex;
  }

  if (finalTextParts.length && !finalResult.new_message_chain) {
    finalResult.new_text = finalTextParts.join("\n");
  }

  finalResult.should_edit_message = Boolean(
    (finalResult.new_text || finalResult.next_menu_id || (finalResult.button_overrides || []).length || finalResult.button_title) &&
      !finalResult.new_message_chain
  );
  const outputVariables = { ...globalVariables };
  delete outputVariables[WORKFLOW_CALL_STACK_KEY];
  finalResult.data = { variables: outputVariables };
  finalResult.success = true;
  finalResult.temp_files_to_clean = filesToClean;
  return finalResult;
}

async function executeSingleAction(
  ctx: ExecuteContext,
  action: ActionDefinitionShape
): Promise<ActionExecutionResult> {
  const kind = String(action.kind || "http");
  const actionId = String(action.id || "");

  if (kind === "modular" || (actionId && actionId in MODULAR_ACTION_HANDLERS)) {
    return runModularHandler(actionId, (action.config || {}) as Record<string, unknown>, ctx, ctx.runtime);
  }

  if (kind === "local") {
    return executeLocalAction(ctx, action, ctx.runtime, {});
  }

  if (kind === "http") {
    return executeHttpAction(ctx, action, {}, ctx.runtime, {});
  }

  if (kind === "workflow") {
    return { success: false, error: "nested workflow is not supported" };
  }

  return { success: false, error: `unsupported action kind: ${kind}` };
}

async function executeWorkflowNode(
  ctx: ExecuteContext,
  workflowId: string,
  nodeId: string,
  nodeDef: WorkflowNode,
  globalVariables: Record<string, unknown>,
  nodeOutputs: Record<string, Record<string, unknown>>,
  edges: WorkflowEdge[]
): Promise<{ result?: ActionExecutionResult; error?: string }> {
  const actionId = nodeDef.action_id;
  if (!actionId) {
    return { result: { success: true, data: { variables: {} } } };
  }

  const startedAt = Date.now();
  const emitTrace = (trace: Omit<WorkflowNodeTrace, "started_at" | "finished_at" | "duration_ms">) => {
    const finishedAt = Date.now();
    try {
      ctx.tracer?.onNodeTrace?.({
        ...trace,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: Math.max(0, finishedAt - startedAt),
      });
    } catch {
      // ignore tracer failures
    }
  };

  const actionDefinition = findActionDefinition(ctx.state, actionId);
  if (!actionDefinition) {
    const error = `workflow ${workflowId} node ${nodeId} missing action ${actionId}`;
    emitTrace({
      workflow_id: workflowId,
      node_id: nodeId,
      action_id: actionId,
      action_kind: "missing",
      allowed: false,
      status: "error",
      error,
    });
    return { error };
  }

  const inputParams: Record<string, unknown> = { ...(nodeDef.data || {}) };
  if (inputParams.__node_id === undefined) {
    inputParams.__node_id = nodeId;
  }
  const conditionCfg = inputParams.__condition__;
  delete inputParams.__condition__;

  for (const edge of edges) {
    if (edge.target_node !== nodeId) {
      continue;
    }
    if (CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) {
      continue;
    }
    const output = nodeOutputs[edge.source_node];
    if (output && edge.source_output in output) {
      let value: unknown = output[edge.source_output];
      const sourcePath = String((edge as any).source_path || "").trim();
      if (sourcePath) {
        try {
          value = extractByPath("jsonpath", sourcePath, value);
        } catch {
          value = null;
        }
      }
      inputParams[edge.target_input] = value;
    }
  }

  const currentRuntime: RuntimeContext = { ...ctx.runtime, variables: { ...globalVariables } };
  const renderContext = buildTemplateContext({
    action: nodeDef.data || {},
    button: ctx.button,
    menu: ctx.menu,
    runtime: currentRuntime,
    variables: globalVariables,
    nodes: nodeOutputs,
  });
  const renderedParams = renderStructure(inputParams, renderContext) as Record<string, unknown>;
  const executionPolicy = resolveNodeExecutionPolicy(renderedParams, actionDefinition.definition);
  const actionParams = stripNodeExecutionControlParams(renderedParams);

  const conditionContext = { ...renderContext, inputs: actionParams };
  const { allowed, error } = evaluateNodeCondition(conditionCfg, nodeId, conditionContext);
  if (error) {
    emitTrace({
      workflow_id: workflowId,
      node_id: nodeId,
      action_id: actionId,
      action_kind: actionDefinition.kind,
      allowed: false,
      status: "error",
      rendered_params: actionParams,
      error,
    });
    return { error };
  }
  if (!allowed) {
    emitTrace({
      workflow_id: workflowId,
      node_id: nodeId,
      action_id: actionId,
      action_kind: actionDefinition.kind,
      allowed: false,
      status: "skipped",
      rendered_params: actionParams,
    });
    return { result: { success: true, data: { variables: {} } } };
  }

  try {
    const result = await executeNodeActionWithPolicy(
      ctx,
      actionDefinition,
      actionParams,
      currentRuntime,
      nodeOutputs,
      executionPolicy,
      nodeId
    );
    emitTrace({
      workflow_id: workflowId,
      node_id: nodeId,
      action_id: actionId,
      action_kind: actionDefinition.kind,
      allowed: true,
      status: result.pending ? "pending" : result.success ? "success" : "error",
      flow_output: result.flow_output,
      rendered_params: actionParams,
      result,
      error: result.success ? undefined : result.error,
    });
    if (!result.success) {
      return { error: result.error || `node ${nodeId} failed` };
    }
    return { result };
  } catch (error) {
    const err = `workflow ${workflowId} node ${actionId} failed: ${String(error)}`;
    emitTrace({
      workflow_id: workflowId,
      node_id: nodeId,
      action_id: actionId,
      action_kind: actionDefinition.kind,
      allowed: true,
      status: "error",
      rendered_params: actionParams,
      error: err,
    });
    return { error: err };
  }
}
async function executeNodeAction(
  ctx: ExecuteContext,
  actionDefinition: { kind: string; definition: ActionDefinitionShape },
  params: Record<string, unknown>,
  runtime: RuntimeContext,
  nodeOutputs: Record<string, Record<string, unknown>>
): Promise<ActionExecutionResult> {
  const kind = actionDefinition.kind;
  if (kind === "modular") {
    return runModularHandler(actionDefinition.definition.id || "", params, ctx, runtime);
  }
  if (kind === "http") {
    const runtimeWithParams: RuntimeContext = {
      ...runtime,
      variables: { ...(runtime.variables || {}), ...(params || {}) },
    };
    return executeHttpAction(ctx, actionDefinition.definition, params, runtimeWithParams, nodeOutputs);
  }
  if (kind === "local") {
    const runtimeWithParams: RuntimeContext = {
      ...runtime,
      variables: { ...(runtime.variables || {}), ...(params || {}) },
    };
    return executeLocalAction(ctx, actionDefinition.definition, runtimeWithParams, nodeOutputs);
  }
  if (kind === "workflow") {
    return { success: false, error: "nested workflow is not supported" };
  }
  return { success: false, error: `unknown action kind: ${kind}` };
}

function resolveNodeExecutionPolicy(
  params: Record<string, unknown>,
  actionDefinition: ActionDefinitionShape
): NodeExecutionPolicy {
  const timeoutRaw =
    params.__timeout_ms ?? params.timeout_ms ?? params.timeout ?? actionDefinition.limits?.timeoutMs;
  const retryCountRaw = params.__retry_count ?? params.retry_count;
  const retryDelayRaw = params.__retry_delay_ms ?? params.retry_delay_ms;
  const retryBackoffRaw = params.__retry_backoff ?? params.retry_backoff;

  const timeoutCandidate = Number(timeoutRaw);
  const timeoutMs =
    Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
      ? Math.min(Math.trunc(timeoutCandidate), MAX_NODE_TIMEOUT_MS)
      : 0;

  const retryCountCandidate = Number(retryCountRaw);
  const retryCount =
    Number.isFinite(retryCountCandidate) && retryCountCandidate > 0
      ? Math.min(Math.trunc(retryCountCandidate), MAX_NODE_RETRY_COUNT)
      : 0;

  const retryDelayCandidate = Number(retryDelayRaw);
  const retryDelayMs =
    Number.isFinite(retryDelayCandidate) && retryDelayCandidate > 0
      ? Math.min(Math.trunc(retryDelayCandidate), MAX_NODE_RETRY_DELAY_MS)
      : 0;

  const retryBackoff =
    String(retryBackoffRaw || "fixed").trim().toLowerCase() === "exponential"
      ? "exponential"
      : "fixed";

  return {
    timeoutMs,
    retryCount,
    retryDelayMs,
    retryBackoff,
  };
}

function stripNodeExecutionControlParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...(params || {}) };
  delete next.__timeout_ms;
  delete next.timeout_ms;
  delete next.timeout;
  delete next.__retry_count;
  delete next.retry_count;
  delete next.__retry_delay_ms;
  delete next.retry_delay_ms;
  delete next.__retry_backoff;
  delete next.retry_backoff;
  return next;
}

function resolveRetryDelayMs(policy: NodeExecutionPolicy, attempt: number): number {
  if (policy.retryDelayMs <= 0) {
    return 0;
  }
  if (policy.retryBackoff === "exponential") {
    const multiplier = 2 ** Math.max(0, attempt - 1);
    return Math.min(policy.retryDelayMs * multiplier, MAX_NODE_RETRY_DELAY_MS);
  }
  return policy.retryDelayMs;
}

function buildRetryErrorMessage(error: string, attempts: number): string {
  const message = String(error || "unknown error");
  if (attempts <= 1) {
    return message;
  }
  return `${message} (after ${attempts} attempts)`;
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`node execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeNodeActionWithPolicy(
  ctx: ExecuteContext,
  actionDefinition: { kind: string; definition: ActionDefinitionShape },
  params: Record<string, unknown>,
  runtime: RuntimeContext,
  nodeOutputs: Record<string, Record<string, unknown>>,
  policy: NodeExecutionPolicy,
  nodeId: string
): Promise<ActionExecutionResult> {
  const totalAttempts = policy.retryCount + 1;
  let lastError = "";

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const execution = executeNodeAction(ctx, actionDefinition, params, runtime, nodeOutputs);
      const result = policy.timeoutMs > 0 ? await runWithTimeout(execution, policy.timeoutMs) : await execution;
      if (result.success) {
        return result;
      }

      lastError = String(result.error || `node ${nodeId} failed`);
      if (attempt >= totalAttempts) {
        return { ...result, error: buildRetryErrorMessage(lastError, attempt) };
      }
    } catch (error) {
      lastError = String(error || `node ${nodeId} failed`);
      if (attempt >= totalAttempts) {
        throw new Error(buildRetryErrorMessage(lastError, attempt));
      }
    }

    const retryDelay = resolveRetryDelayMs(policy, attempt);
    if (retryDelay > 0) {
      await sleep(retryDelay);
    }
  }

  return {
    success: false,
    error: buildRetryErrorMessage(lastError || `node ${nodeId} failed`, totalAttempts),
  };
}

function findActionDefinition(state: ButtonsModel, actionId: string): { kind: string; definition: ActionDefinitionShape } | null {

  if (actionId in MODULAR_ACTION_HANDLERS) {
    return { kind: "modular", definition: { id: actionId } };
  }
  const legacy = state.actions?.[actionId];
  if (legacy) {
    return { kind: legacy.kind || "http", definition: legacy as ActionDefinitionShape };
  }
  return null;
}

async function runModularHandler(
  actionId: string,
  params: Record<string, unknown>,
  ctx: ExecuteContext,
  runtime: RuntimeContext
): Promise<ActionExecutionResult> {
  const handler = MODULAR_ACTION_HANDLERS[actionId];
  if (!handler) {
    return { success: false, error: `modular action not supported: ${actionId}` };
  }
  const resultMap = await handler(params, {
    env: ctx.env,
    state: ctx.state,
    runtime,
    button: ctx.button,
    menu: ctx.menu,
    preview: ctx.preview,
  });
  if (resultMap && typeof resultMap === "object" && "__pending__" in resultMap) {
    const nestedPending = (resultMap as Record<string, unknown>).__pending__;
    if (!nestedPending || typeof nestedPending !== "object" || Array.isArray(nestedPending)) {
      return { success: false, error: "invalid __pending__ payload" };
    }
    const pending = nestedPending as PendingExecution;
    if (!pending.await || typeof pending.await !== "object") {
      return { success: false, error: "invalid __pending__.await payload" };
    }
    return {
      success: true,
      pending,
    };
  }
  if (resultMap && typeof resultMap === "object" && "__await__" in resultMap) {
    return {
      success: true,
      pending: {
        workflow_id: "",
        node_id: "",
        exec_order: [],
        next_index: 0,
        node_outputs: {},
        global_variables: {},
        runtime,
        button: ctx.button,
        menu: ctx.menu,
        await: (resultMap as Record<string, unknown>).__await__ as any,
      },
    };
  }
  return buildActionResult(resultMap || {});
}

async function executeLocalAction(
  ctx: ExecuteContext,
  actionDef: ActionDefinitionShape,
  runtime: RuntimeContext,
  nodeOutputs: Record<string, Record<string, unknown>>
): Promise<ActionExecutionResult> {
  const config = actionDef.config || {};
  const name = String(config.name || "");
  if (!name) {
    return { success: false, error: "local action missing name" };
  }
  if (!(name in MODULAR_ACTION_HANDLERS)) {
    return { success: false, error: `local action not supported: ${name}` };
  }
  if (ctx.preview) {
    return { success: true, new_text: `此为本地动作 '${name}' 的预览。` };
  }

  const baseContext = buildTemplateContext({
    action: actionDef as Record<string, unknown>,
    button: ctx.button,
    menu: ctx.menu,
    runtime,
    variables: runtime.variables,
    nodes: nodeOutputs,
  });
  const paramsCfg = (config.parameters || {}) as Record<string, unknown>;
  const rendered = renderStructure(paramsCfg, baseContext);
  if (!rendered || typeof rendered !== "object" || Array.isArray(rendered)) {
    return { success: false, error: "local action parameters must be an object" };
  }
  return runModularHandler(name, rendered as Record<string, unknown>, ctx, runtime);
}

function evaluateNodeCondition(conditionCfg: unknown, nodeId: string, conditionContext: Record<string, unknown>): {
  allowed: boolean;
  error?: string;
} {
  if (!conditionCfg || typeof conditionCfg !== "object") {
    return { allowed: true };
  }
  const cfg = conditionCfg as Record<string, unknown>;
  const mode = String(cfg.mode || "always").toLowerCase();
  if (!mode || mode === "always") {
    return { allowed: true };
  }
  if (mode === "never") {
    return { allowed: false };
  }
  if (!conditionContext.inputs) {
    conditionContext.inputs = {};
  }
  try {
    if (mode === "expression") {
      const expression = String(cfg.expression || "");
      if (!expression.trim()) {
        return { allowed: false };
      }
      const rendered = renderTemplate(expression, conditionContext);
      return { allowed: coerceToBool(rendered) };
    }
    if (mode === "linked") {
      const linkCfg = (cfg.link || {}) as Record<string, unknown>;
      if (linkCfg.template) {
        const rendered = renderTemplate(String(linkCfg.template), conditionContext);
        return { allowed: coerceToBool(rendered) };
      }
      const targetKey = String(linkCfg.target_input || linkCfg.target_input_port || "");
      const inputs = conditionContext.inputs as Record<string, unknown>;
      return { allowed: coerceToBool(inputs ? inputs[targetKey] : undefined) };
    }
    return { allowed: true };
  } catch (error) {
    return { allowed: false, error: `condition failed for node ${nodeId}: ${String(error)}` };
  }
}

function buildTemplateContext(args: {
  action: Record<string, unknown>;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  runtime: RuntimeContext;
  variables: Record<string, unknown>;
  nodes?: Record<string, Record<string, unknown>>;
  response?: Record<string, unknown> | null;
  extracted?: unknown;
}): Record<string, unknown> {
  return {
    action: args.action,
    button: args.button,
    menu: args.menu,
    runtime: args.runtime,
    variables: args.variables,
    __trigger__: (args.variables as any)?.__trigger__ ?? null,
    nodes: args.nodes || {},
    response: args.response ?? null,
    extracted: args.extracted ?? null,
  };
}

function resolveMaxSteps(workflow: WorkflowDefinition, runtime: RuntimeContext): number {
  const runtimeLimit = Number((runtime.variables as any)?.max_steps);
  const workflowLimit = Number((workflow as any)?.max_steps ?? (workflow as any)?.settings?.max_steps);
  const fromRuntime = Number.isFinite(runtimeLimit) && runtimeLimit > 0 ? runtimeLimit : 0;
  const fromWorkflow = Number.isFinite(workflowLimit) && workflowLimit > 0 ? workflowLimit : 0;
  if (fromRuntime) {
    return fromRuntime;
  }
  if (fromWorkflow) {
    return fromWorkflow;
  }
  return MAX_WORKFLOW_STEPS;
}

function isControlOutput(output: string): boolean {
  if (CONTROL_OUTPUTS.has(output)) {
    return true;
  }
  return CONTROL_OUTPUT_PREFIXES.some((prefix) => output.startsWith(prefix));
}

function getEngineState(variables: Record<string, unknown>): Record<string, unknown> {
  const current = (variables[ENGINE_STATE_KEY] || {}) as Record<string, unknown>;
  if (!Array.isArray(current[TRY_STACK_KEY])) {
    current[TRY_STACK_KEY] = [];
  }
  return current;
}

function pushTryHandler(variables: Record<string, unknown>, entry: TryHandlerEntry): void {
  const current = getEngineState(variables);
  const stack = Array.isArray(current[TRY_STACK_KEY]) ? [...(current[TRY_STACK_KEY] as TryHandlerEntry[])] : [];
  stack.push(entry);
  variables[ENGINE_STATE_KEY] = { ...current, [TRY_STACK_KEY]: stack };
}

function popTryHandler(variables: Record<string, unknown>): TryHandlerEntry | null {
  const current = getEngineState(variables);
  const stack = Array.isArray(current[TRY_STACK_KEY]) ? [...(current[TRY_STACK_KEY] as TryHandlerEntry[])] : [];
  const entry = stack.pop() || null;
  variables[ENGINE_STATE_KEY] = { ...current, [TRY_STACK_KEY]: stack };
  return entry;
}

function setEngineError(
  variables: Record<string, unknown>,
  error: string,
  nodeId: string,
  tryNodeId?: string
): void {
  const current = getEngineState(variables);
  variables[ENGINE_STATE_KEY] = {
    ...current,
    [LAST_ERROR_KEY]: error,
    [LAST_ERROR_NODE_KEY]: nodeId,
    [LAST_TRY_NODE_KEY]: tryNodeId || current[LAST_TRY_NODE_KEY],
  };
}

function updateEngineState(
  variables: Record<string, unknown>,
  nodeId: string,
  outputs: Record<string, unknown>,
  step: number
): void {
  const current = getEngineState(variables);
  const nodes = (current.nodes || {}) as Record<string, unknown>;
  nodes[nodeId] = outputs;
  variables[ENGINE_STATE_KEY] = {
    ...current,
    last_node_id: nodeId,
    step,
    nodes,
  };
}

function mergeWorkflowResult(
  result: ActionExecutionResult,
  finalResult: ActionExecutionResult,
  finalTextParts: string[]
): void {
  if (result.new_message_chain) {
    finalResult.new_message_chain = result.new_message_chain;
    finalResult.new_text = undefined;
    finalResult.should_edit_message = false;
    finalTextParts.length = 0;
  }

  if (result.web_app_launch) {
    finalResult.web_app_launch = result.web_app_launch;
  }

  if (!finalResult.new_message_chain) {
    if (result.new_text) {
      finalTextParts.push(result.new_text);
    }
    if (result.next_menu_id) {
      finalResult.next_menu_id = result.next_menu_id;
    }
    if (result.parse_mode && result.new_text) {
      finalResult.parse_mode = result.parse_mode;
    }
  }

  if (result.notification) {
    finalResult.notification = result.notification;
  }

  if (result.button_overrides && result.button_overrides.length) {
    finalResult.button_overrides = finalResult.button_overrides || [];
    finalResult.button_overrides.push(...result.button_overrides);
  }

  if (result.button_title) {
    finalResult.button_title = result.button_title;
  }
}

function topologicalSort(
  nodes: Record<string, WorkflowNode>,
  edges: WorkflowEdge[]
): { order: string[]; error?: string } {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  const hasControlBus = edges.some((e) => CONTROL_INPUT_NAMES.has(String(e?.target_input || "")));

  for (const nodeId of Object.keys(nodes)) {
    adj[nodeId] = [];
    inDegree[nodeId] = 0;
  }

  for (const edge of edges) {
    if (isControlOutput(edge.source_output)) {
      continue;
    }
    if (hasControlBus && !CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) {
      continue;
    }
    if (edge.source_node in adj && edge.target_node in inDegree) {
      adj[edge.source_node].push(edge.target_node);
      inDegree[edge.target_node] += 1;
    }
  }

  const queue: string[] = Object.keys(nodes).filter((nodeId) => inDegree[nodeId] === 0);
  const order: string[] = [];

  while (queue.length) {
    const nodeId = queue.shift() as string;
    order.push(nodeId);
    for (const next of adj[nodeId] || []) {
      inDegree[next] -= 1;
      if (inDegree[next] === 0) {
        queue.push(next);
      }
    }
  }

  if (order.length !== Object.keys(nodes).length) {
    const unresolved = Object.keys(nodes).filter((nodeId) => !order.includes(nodeId));
    return { order: [], error: `检测到循环依赖，涉及节点: ${unresolved.join(", ")}` };
  }

  return { order };
}

async function executeHttpAction(
  ctx: ExecuteContext,
  actionDef: ActionDefinitionShape,
  params: Record<string, unknown>,
  runtime: RuntimeContext,
  nodeOutputs: Record<string, Record<string, unknown>>
): Promise<ActionExecutionResult> {
  const config = actionDef.config || {};
  const requestCfg = (config.request as Record<string, unknown>) || {
    method: config.method,
    url: config.url,
    headers: config.headers,
    body: config.body,
    timeout: config.timeout,
  };

  const baseContext = buildTemplateContext({
    action: actionDef as Record<string, unknown>,
    button: ctx.button,
    menu: ctx.menu,
    runtime,
    variables: runtime.variables,
    nodes: nodeOutputs,
  });

  const urlTemplate = requestCfg.url ? String(requestCfg.url) : "";
  if (!urlTemplate) {
    return { success: false, error: "HTTP action missing url" };
  }

  let url = "";
  try {
    url = renderTemplate(urlTemplate, baseContext);
  } catch (error) {
    return { success: false, error: `render url failed: ${String(error)}` };
  }

  const method = String(requestCfg.method || "GET").toUpperCase();
  const headers = buildHeaders(requestCfg.headers, baseContext);
  const { body, contentType } = buildRequestBody(requestCfg.body, baseContext);
  if (contentType && !headers["Content-Type"]) {
    headers["Content-Type"] = contentType;
  }

  let responseText = "";
  let responseJson: unknown = null;
  let responseStatus: number | null = null;
  if (!ctx.preview) {
    try {
      const response = await fetch(url, {
        method,
        headers: headers as Record<string, string>,
        body,
      });
      responseStatus = response.status;
      responseText = await response.text();
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = null;
      }
    } catch (error) {
      return { success: false, error: `http request failed: ${String(error)}` };
    }
  }

  const parseCfg = (config.parse as Record<string, unknown>) || {};
  const variablesCfg = Array.isArray(parseCfg.variables) ? (parseCfg.variables as Record<string, unknown>[]) : [];
  const combinedVariables: Record<string, unknown> = { ...(runtime.variables || {}) };

  let extracted: unknown = null;
  const responseContext = {
    status_code: responseStatus,
    json: responseJson,
    text: responseText,
  };

  const extractorCfg = (parseCfg.extractor as Record<string, unknown>) || (config.extractor as Record<string, unknown>) || {};
  const extractorType = String(extractorCfg.type || "none").toLowerCase();
  const extractorExpr = extractorCfg.expression ? String(extractorCfg.expression) : "";

  const renderContext = buildTemplateContext({
    action: actionDef as Record<string, unknown>,
    button: ctx.button,
    menu: ctx.menu,
    runtime,
    response: responseContext,
    extracted,
    variables: combinedVariables,
    nodes: nodeOutputs,
  });

  if (extractorType !== "none" && extractorExpr) {
    if (extractorType === "template") {
      extracted = renderTemplate(extractorExpr, renderContext);
    } else if (extractorType === "jsonpath" || extractorType === "jmespath") {
      if (responseJson === null || responseJson === undefined) {
        return { success: false, error: "response json unavailable for extractor" };
      }
      try {
        extracted = extractByPath(extractorType, extractorExpr, responseJson);
      } catch (error) {
        return { success: false, error: `extractor failed: ${String(error)}` };
      }
    } else {
      return { success: false, error: `unknown extractor type: ${extractorType}` };
    }
  }

  const renderedContextWithExtracted = buildTemplateContext({
    action: actionDef as Record<string, unknown>,
    button: ctx.button,
    menu: ctx.menu,
    runtime,
    response: responseContext,
    extracted,
    variables: combinedVariables,
    nodes: nodeOutputs,
  });

  for (const entry of variablesCfg) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const name = String(entry.name || "");
    if (!name) {
      continue;
    }
    const type = String(entry.type || "template").toLowerCase();
    if (type === "template") {
      combinedVariables[name] = renderTemplate(String(entry.template || ""), renderedContextWithExtracted);
    } else if (type === "static") {
      combinedVariables[name] = entry.value;
    } else if (type === "runtime") {
      combinedVariables[name] = runtime.variables[String(entry.key || "")];
    } else if (type === "jsonpath" || type === "jmespath") {
      if (responseJson === null || responseJson === undefined) {
        return { success: false, error: "response json unavailable for variable extractor" };
      }
      const expr = String(entry.expression || "");
      if (!expr) {
        combinedVariables[name] = null;
      } else {
        try {
          combinedVariables[name] = extractByPath(type, expr, responseJson);
        } catch (error) {
          return { success: false, error: `variable extractor failed: ${String(error)}` };
        }
      }
    }
  }

  const finalContext = buildTemplateContext({
    action: actionDef as Record<string, unknown>,
    button: ctx.button,
    menu: ctx.menu,
    runtime,
    response: responseContext,
    extracted,
    variables: combinedVariables,
    nodes: nodeOutputs,
  });

  const renderCfg = (config.render as Record<string, unknown>) || {};
  const messageCfg = renderCfg.message as Record<string, unknown> | undefined;
  const templateStr = messageCfg?.template ? String(messageCfg.template) : (renderCfg.template ? String(renderCfg.template) : "");
  const format = String(messageCfg?.format || renderCfg.format || "html").toLowerCase();
  const shouldEdit = messageCfg?.update_message === undefined
    ? renderCfg.update_message === undefined ? true : Boolean(renderCfg.update_message)
    : Boolean(messageCfg.update_message);
  const nextMenuId = messageCfg?.next_menu_id
    ? String(messageCfg.next_menu_id)
    : renderCfg.next_menu_id
      ? String(renderCfg.next_menu_id)
      : undefined;
  const buttonTitleTemplate = renderCfg.button_title_template ? String(renderCfg.button_title_template) : "";

  let resultText = "";
  if (templateStr) {
    resultText = renderTemplate(templateStr, finalContext);
  }

  const overridesCfg: Record<string, unknown>[] = [];
  if (Array.isArray(messageCfg?.button_overrides)) {
    overridesCfg.push(...(messageCfg.button_overrides as Record<string, unknown>[]));
  }
  if (Array.isArray(renderCfg.button_overrides)) {
    overridesCfg.push(...(renderCfg.button_overrides as Record<string, unknown>[]));
  }
  const renderedOverrides = renderButtonOverrides(overridesCfg, finalContext);
  if (buttonTitleTemplate) {
    const renderedTitle = renderTemplate(buttonTitleTemplate, finalContext);
    if (renderedTitle) {
      renderedOverrides.push({ target: "self", text: renderedTitle, temporary: true });
    }
  }

  const buttonId = (ctx.button as any)?.id;
  const overridesSelfText = renderedOverrides.find(
    (entry) => entry && (entry.target === "self" || entry.target === buttonId)
  )?.text;

  const resultMap: Record<string, unknown> = {
    new_text: resultText,
    parse_mode: normalizeParseMode(format),
    next_menu_id: nextMenuId,
    button_overrides: renderedOverrides,
    button_title: overridesSelfText,
  };

  const result = buildActionResult(resultMap);
  result.should_edit_message = Boolean(shouldEdit && resultText);
  result.data = {
    extracted,
    response_status: responseStatus,
    variables: combinedVariables,
  };
  return result;
}

function buildHeaders(
  raw: unknown,
  context: Record<string, unknown>
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const key = String((entry as any).key || (entry as any).name || "");
      const value = (entry as any).value;
      if (!key) {
        continue;
      }
      headers[key] = renderTemplate(String(value ?? ""), context);
    }
  } else if (raw && typeof raw === "object") {
    const rendered = renderStructure(raw, context) as Record<string, unknown>;
    for (const [key, value] of Object.entries(rendered || {})) {
      if (!key) {
        continue;
      }
      headers[key] = value === undefined || value === null ? "" : String(value);
    }
  }
  return headers;
}

function buildRequestBody(
  raw: unknown,
  context: Record<string, unknown>
): { body?: BodyInit; contentType?: string } {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw === "string") {
    return { body: renderTemplate(raw, context) };
  }
  if (typeof raw !== "object") {
    return { body: String(raw) };
  }

  const cfg = raw as Record<string, unknown>;
  const mode = String(cfg.mode || "raw").toLowerCase();
  if (mode === "json") {
    const rendered = renderStructure(cfg.json || {}, context);
    return { body: JSON.stringify(rendered), contentType: "application/json" };
  }
  if (mode === "form" || mode === "urlencoded") {
    const rendered = renderStructure(cfg.form || {}, context) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rendered || {})) {
      params.append(key, value === null || value === undefined ? "" : String(value));
    }
    return { body: params.toString(), contentType: "application/x-www-form-urlencoded" };
  }
  if (mode === "multipart") {
    const rendered = renderStructure(cfg.form || {}, context) as Record<string, unknown>;
    const form = new FormData();
    for (const [key, value] of Object.entries(rendered || {})) {
      form.append(key, value === null || value === undefined ? "" : String(value));
    }
    return { body: form };
  }

  const templateValue = String(cfg.text || cfg.raw || "");
  if (templateValue) {
    return { body: renderTemplate(templateValue, context) };
  }
  return {};
}

function renderButtonOverrides(
  overridesCfg: Record<string, unknown>[],
  context: Record<string, unknown>
): Record<string, unknown>[] {
  const rendered: Record<string, unknown>[] = [];
  for (const entry of overridesCfg || []) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const source = entry as Record<string, unknown>;
    const templates: Record<string, string> = {};
    if (source.text_template) templates.text = String(source.text_template);
    if (source.callback_template) templates.callback_data = String(source.callback_template);
    if (source.url_template) templates.url = String(source.url_template);
    if (source.switch_inline_query_template) {
      templates.switch_inline_query = String(source.switch_inline_query_template);
    }
    if (source.switch_inline_query_current_chat_template) {
      templates.switch_inline_query_current_chat = String(source.switch_inline_query_current_chat_template);
    }
    if (source.web_app_url_template) {
      templates.web_app_url = String(source.web_app_url_template);
    }

    const layout = source.layout as Record<string, unknown> | undefined;
    if (layout && layout.row !== undefined) templates.layout_row = String(layout.row);
    if (layout && layout.col !== undefined) templates.layout_col = String(layout.col);

    const renderedParts: Record<string, unknown> = {};
    for (const [key, template] of Object.entries(templates)) {
      renderedParts[key] = renderTemplate(template, context);
    }

    const result: Record<string, unknown> = {
      target: source.target || "self",
      temporary: source.temporary !== undefined ? Boolean(source.temporary) : true,
      ...renderedParts,
    };

    for (const field of ["type", "action_id", "menu_id", "web_app_id"]) {
      if (source[field]) {
        result[field] = source[field];
      }
    }
    for (const field of ["text", "callback_data", "url", "web_app_url", "switch_inline_query", "switch_inline_query_current_chat"]) {
      if (result[field] === undefined && source[field]) {
        result[field] = source[field];
      }
    }

    const layoutResult: Record<string, number> = {};
    if (result.layout_row !== undefined) {
      const rowNum = Number(result.layout_row);
      if (!Number.isNaN(rowNum)) {
        layoutResult.row = rowNum;
      }
      delete result.layout_row;
    }
    if (result.layout_col !== undefined) {
      const colNum = Number(result.layout_col);
      if (!Number.isNaN(colNum)) {
        layoutResult.col = colNum;
      }
      delete result.layout_col;
    }
    if (Object.keys(layoutResult).length) {
      result.layout = layoutResult;
    }

    rendered.push(stripEmpty(result));
  }
  return rendered;
}

function stripEmpty(entry: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function normalizeParseMode(alias: string): string | undefined {
  if (alias === "html") {
    return "HTML";
  }
  if (alias === "markdown" || alias === "md") {
    return "Markdown";
  }
  if (alias === "markdownv2" || alias === "mdv2") {
    return "MarkdownV2";
  }
  if (alias === "plain" || alias === "none") {
    return undefined;
  }
  return undefined;
}

function extractByPath(
  kind: "jsonpath" | "jmespath",
  expression: string,
  payload: unknown
): unknown {
  const tokens = parsePathTokens(kind, expression);
  let current: any = payload;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return null;
    }
    if (typeof token === "number") {
      if (!Array.isArray(current)) {
        return null;
      }
      current = current[token];
    } else {
      if (typeof current !== "object") {
        return null;
      }
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current;
}

function parsePathTokens(
  kind: "jsonpath" | "jmespath",
  expression: string
): Array<string | number> {
  let expr = String(expression || "").trim();
  if (!expr) {
    return [];
  }
  if (kind === "jsonpath") {
    if (expr.startsWith("$")) {
      expr = expr.slice(1);
    }
    if (expr.startsWith(".")) {
      expr = expr.slice(1);
    }
  }

  const tokens: Array<string | number> = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ".") {
      i += 1;
      continue;
    }
    if (ch === "[") {
      const closing = expr.indexOf("]", i + 1);
      if (closing === -1) {
        throw new Error("invalid path expression");
      }
      const inner = expr.slice(i + 1, closing).trim();
      if (!inner) {
        throw new Error("invalid path expression");
      }
      if ((inner.startsWith("'") && inner.endsWith("'")) || (inner.startsWith("\"") && inner.endsWith("\""))) {
        tokens.push(inner.slice(1, -1));
      } else if (/^-?\d+$/.test(inner)) {
        tokens.push(Number(inner));
      } else {
        throw new Error("unsupported path expression");
      }
      i = closing + 1;
      continue;
    }

    if (!/[A-Za-z0-9_]/.test(ch)) {
      throw new Error("unsupported path expression");
    }
    let start = i;
    i += 1;
    while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) {
      i += 1;
    }
    const ident = expr.slice(start, i);
    tokens.push(ident);
  }
  return tokens;
}
