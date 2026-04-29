import {
  BUILTIN_MODULAR_ACTIONS,
  getNodeCategoryPriority,
  ModularActionDefinition,
} from "./actions/modularActions";
import { callTelegram } from "./actions/telegram";
import {
  analyzeWorkflowExecutionPlan,
  buildRuntimeContext,
  executeActionPreview,
  executeWorkflowWithResume,
  ResumeState,
  type ExecutionTracer,
  type WorkflowNodeTrace,
} from "./engine/executor";
import {
  ActionExecutionResult,
  AwaitConfig,
  ButtonsModel,
  PendingContinuation,
  PendingExecution,
  RuntimeContext,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "./types";
import { CORS_HEADERS, defaultState, generateId, jsonResponse, parseJson } from "./utils";
import {
  DEFAULT_OBSERVABILITY_CONFIG,
  normalizeObservabilityConfig,
  sanitizeForObs,
  type ObservabilityConfig,
  type ObsExecutionStats,
  type ObsExecutionStatus,
  type ObsFailureSnapshot,
  type ObsExecutionSummary,
  type ObsExecutionTrace,
  type ObsNodeTrace,
} from "./observability";
import {
  CALLBACK_PREFIX_ACTION,
  CALLBACK_PREFIX_BACK,
  CALLBACK_PREFIX_COMMAND,
  CALLBACK_PREFIX_MENU,
  CALLBACK_PREFIX_REDIRECT,
  CALLBACK_PREFIX_WORKFLOW,
} from "./telegram/constants";
import { buildMenuMarkup, findMenuForButton, resolveButtonOverrides } from "./telegram/menus";
import { collectSubWorkflowTerminalOutputs } from "./engine/subworkflowOutputs";
import { renderStructure } from "./engine/templates";
import {
  callConfiguredLlmChat,
  callConfiguredLlmToolChat,
  defaultBaseUrlForProvider,
  listProviderModels,
  LLM_CONFIG_ENV_KEY,
  LLM_PROVIDER_TYPES,
  type LlmNativeChatMessage,
  type LlmModelConfig,
  type LlmProviderConfig,
  type LlmProviderType,
  type LlmRuntimeConfig,
  type LlmToolDefinition,
} from "./agents/llmClient";

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1DatabaseLike {
  exec(query: string): Promise<unknown>;
  prepare(query: string): D1PreparedStatementLike;
}

interface WorkflowInstanceLike {
  id: string;
  status?(): Promise<unknown>;
}

interface WorkflowBindingLike<T = unknown> {
  create(options?: { id?: string; params?: T }): Promise<WorkflowInstanceLike>;
  get?(id: string): Promise<WorkflowInstanceLike>;
}

interface TelegramUpdateWorkflowPayload {
  update: Record<string, unknown>;
  received_at: number;
}

export interface Env {
  STATE_STORE: DurableObjectNamespace;
  TELEGRAM_UPDATE_WORKFLOW?: WorkflowBindingLike<TelegramUpdateWorkflowPayload>;
  SKILLS_DB?: D1DatabaseLike;
  WEBUI_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  OPENAI_API_KEY?: string;
  LLM_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_DEFAULT_MODEL?: string;
  FILE_BUCKET?: unknown;
  WEBHOOK_RATE_LIMIT_PER_MINUTE?: string;
  WEBHOOK_RATE_LIMIT_WINDOW_SECONDS?: string;
}

interface ModularActionFile {
  id: string;
  filename: string;
  content: string;
  metadata?: ModularActionDefinition;
}

interface CustomSkillFile {
  path: string;
  content_md: string;
  content_type?: string;
  kind?: string;
  title?: string;
  category?: string;
  tool_id?: string;
  created_at?: number;
  updated_at?: number;
}

interface CustomSkillPack {
  key: string;
  label: string;
  category: string;
  description: string;
  tool_ids: string[];
  content_md: string;
  files?: CustomSkillFile[];
  filename?: string;
  created_at: number;
  updated_at: number;
}

interface D1SkillPackRow {
  key: string;
  label: string;
  category: string;
  description: string | null;
  tool_ids_json: string;
  root_path: string;
  filename: string | null;
  content_md: string | null;
  created_at: number;
  updated_at: number;
}

interface D1SkillFileRow {
  path: string;
  skill_key: string;
  namespace: string;
  content: string;
  content_type: string | null;
  created_at: number;
  updated_at: number;
}

interface WorkflowVersionEntry {
  version_id: string;
  workflow_id: string;
  operation: string;
  reason: string;
  actor: string;
  snapshot: WorkflowDefinition | null;
  created_at: number;
}

interface McpJsonRpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: unknown;
}

interface ExecutionRecord {
  id: string;
  obs_execution_id?: string;
  workflow_id: string;
  exec_order: string[];
  next_index: number;
  next_node_id?: string;
  node_outputs: Record<string, Record<string, unknown>>;
  global_variables: Record<string, unknown>;
  final_text_parts: string[];
  temp_files_to_clean: string[];
  runtime: RuntimeContext;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  await_node_id: string;
  await: AwaitConfig;
  continuations?: PendingContinuation[];
  created_at: number;
  updated_at: number;
}

interface RedirectMeta {
  source_button_id?: string;
  source_menu_id?: string;
  locate_target_menu: boolean;
  target_data: string;
}

type CommandArgMode = "auto" | "text" | "kv" | "json";

interface BotCommand {
  command: string;
  description: string;
  workflow_id?: string;
  arg_mode?: CommandArgMode;
  args_schema?: string[];
}

interface BotConfig {
  token?: string;
  webhook_url?: string;
  webhook_secret?: string;
  commands?: BotCommand[];
}

type LlmConfig = LlmRuntimeConfig;

interface McpToolConfig {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  enabled: boolean;
  updated_at?: number;
}

interface McpServerConfig {
  id: string;
  name: string;
  endpoint_url: string;
  headers: Record<string, string>;
  enabled: boolean;
  tools: McpToolConfig[];
  created_at: number;
  updated_at: number;
}

interface McpConfig {
  servers: Record<string, McpServerConfig>;
}

interface McpRuntimeTool {
  alias: string;
  server_id: string;
  server_name: string;
  tool_name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AgentDocument {
  key: string;
  filename: string;
  label: string;
  description: string;
  content_md: string;
  created_at: number;
  updated_at: number;
}

interface AgentConfig {
  enabled: boolean;
  default_model_id: string;
  allow_node_execution: boolean;
  max_tool_rounds: number;
  context_management_enabled: boolean;
  context_max_tokens: number;
  context_compression_target_tokens: number;
  context_keep_recent_messages: number;
  disabled_skill_keys: string[];
  telegram_command_enabled: boolean;
  telegram_prefix_trigger: string;
  telegram_private_chat_enabled: boolean;
  docs: Record<string, AgentDocument>;
  created_at: number;
  updated_at: number;
}

interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentToolLogEntry {
  id: string;
  tool_call_id: string;
  tool: string;
  arguments: unknown;
  result: unknown;
  created_at: number;
}

interface AgentSessionContext {
  session_id: string;
  summary: string;
  compressed_turns: number;
  recent_history: AgentChatMessage[];
  last_context: Record<string, unknown>;
  tool_calls: AgentToolLogEntry[];
  tool_call_count: number;
  last_message: string;
  last_answer: string;
  created_at: number;
  updated_at: number;
}

interface PreparedAgentContext {
  messages: LlmNativeChatMessage[];
  retainedHistory: AgentChatMessage[];
  meta: Record<string, unknown>;
}

type AgentTelegramEntry = "command" | "private" | "prefix";

interface AgentToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

interface AgentToolExecutionContext {
  config: AgentConfig;
  skillFiles: AgentSkillFile[];
  allowedNodeToolIds: Set<string>;
  enabledSkillKeys: Set<string>;
  mcpTools: Map<string, McpRuntimeTool>;
  runtimePayload: Record<string, unknown>;
  state: ButtonsModel;
  actions: Array<ModularActionDefinition & Record<string, unknown>>;
}

interface AgentModelTurn {
  type: "final" | "tool";
  message?: string;
  tool?: AgentToolCall;
}

interface AgentSkillFile {
  path: string;
  kind?: string;
  title?: string;
  category?: string;
  tool_id?: string;
  content_md?: string;
  source?: string;
  skill_key?: string;
  content_type?: string;
}

type TriggerType = "command" | "keyword" | "button";
type WorkflowTestMode = "workflow" | TriggerType | string;
type EventTriggerType =
  | "inline_query"
  | "chat_member"
  | "my_chat_member"
  | "pre_checkout_query"
  | "shipping_query"
  | "channel_post"
  | "edited_channel_post";

interface WorkflowTestTriggerMatch {
  type: string;
  node_id: string;
  priority: number;
  config: Record<string, unknown>;
}

interface TriggerEntry {
  type: TriggerType;
  workflow_id: string;
  node_id: string;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface EventTriggerEntry {
  type: EventTriggerType;
  workflow_id: string;
  node_id: string;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface TriggerIndex {
  byCommand: Map<string, TriggerEntry[]>;
  byButton: Map<string, TriggerEntry[]>;
  byKeyword: TriggerEntry[];
}

const CONTROL_PORT_NAME = "__control__";
const LEGACY_CONTROL_PORT_NAME = "control_input";
const CONTROL_INPUT_NAMES = new Set([CONTROL_PORT_NAME, LEGACY_CONTROL_PORT_NAME]);
const INTERNAL_WORKFLOW_HEADER = "X-CF-Telegram-Bot-Internal";
const TELEGRAM_UPDATE_WORKFLOW_ID_PREFIX = "tg";
const DEFAULT_WEBHOOK_ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "inline_query",
  "chat_member",
  "my_chat_member",
  "pre_checkout_query",
  "shipping_query",
  "channel_post",
  "edited_channel_post",
];

class ObsTraceCollector implements ExecutionTracer {
  private cfg: ObservabilityConfig;
  private nodes: ObsNodeTrace[];

  constructor(cfg: ObservabilityConfig, seed?: ObsNodeTrace[]) {
    this.cfg = cfg;
    this.nodes = seed ? [...seed] : [];
  }

  onNodeTrace(trace: WorkflowNodeTrace): void {
    const node: ObsNodeTrace = {
      node_id: trace.node_id,
      action_id: trace.action_id,
      action_kind: trace.action_kind,
      status: trace.status,
      allowed: trace.allowed,
      started_at: trace.started_at,
      finished_at: trace.finished_at,
      duration_ms: trace.duration_ms,
      flow_output: trace.flow_output,
      error: trace.error,
    };

    if (this.cfg.include_inputs && trace.rendered_params !== undefined) {
      node.rendered_params = sanitizeForObs(trace.rendered_params);
    }

    if (this.cfg.include_outputs && trace.result !== undefined) {
      const raw = trace.result.pending
        ? {
            ...trace.result,
            pending: {
              workflow_id: trace.result.pending.workflow_id,
              node_id: trace.result.pending.node_id,
              await: trace.result.pending.await,
            },
          }
        : trace.result;
      node.result = sanitizeForObs(raw);
    }

    this.nodes.push(node);
  }

  getNodes(): ObsNodeTrace[] {
    return this.nodes;
  }
}

export class StateStore implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private triggerIndexCache: { signature: string; index: TriggerIndex } | null = null;
  private webhookRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  private skillsD1Ready = false;
  private skillsD1MigrationChecked = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private async loadBotConfig(): Promise<BotConfig> {
    const stored = await this.state.storage.get<BotConfig>("bot_config");
    const normalized = stored ?? {};
    if (!Array.isArray(normalized.commands)) {
      normalized.commands = [];
    }
    if (typeof normalized.token !== "string") {
      normalized.token = "";
    }
    if (typeof normalized.webhook_url !== "string") {
      normalized.webhook_url = "";
    }
    if (typeof normalized.webhook_secret !== "string") {
      normalized.webhook_secret = "";
    }
    normalized.commands = normalized.commands.map((cmd) => ({
      command: String(cmd.command || "").trim().replace(/^\//, ""),
      description: String(cmd.description || "").trim(),
      workflow_id: typeof cmd.workflow_id === "string" ? cmd.workflow_id : "",
      arg_mode: (cmd.arg_mode as CommandArgMode) || "auto",
      args_schema: Array.isArray(cmd.args_schema)
        ? cmd.args_schema.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
    }));
    return normalized;
  }

  private async saveBotConfig(config: BotConfig): Promise<void> {
    await this.state.storage.put("bot_config", config);
  }

  private normalizeLlmProviderType(input: unknown): LlmProviderType {
    const type = String(input || "openai").trim().toLowerCase();
    return (LLM_PROVIDER_TYPES as readonly string[]).includes(type) ? (type as LlmProviderType) : "openai";
  }

  private buildLlmModelId(providerId: string, model: string): string {
    return `${providerId}:${encodeURIComponent(model)}`;
  }

  private async loadLlmConfig(): Promise<LlmConfig> {
    const stored = await this.state.storage.get<Partial<LlmConfig>>("llm_config");
    const rawProviders =
      stored?.providers && typeof stored.providers === "object" && !Array.isArray(stored.providers)
        ? stored.providers
        : {};
    const rawModels =
      stored?.models && typeof stored.models === "object" && !Array.isArray(stored.models)
        ? stored.models
        : {};

    const providers: Record<string, LlmProviderConfig> = {};
    for (const [rawId, rawProvider] of Object.entries(rawProviders)) {
      const provider = rawProvider && typeof rawProvider === "object" ? (rawProvider as Partial<LlmProviderConfig>) : {};
      const id = String(provider.id || rawId || "").trim();
      if (!id) {
        continue;
      }
      const type = this.normalizeLlmProviderType(provider.type);
      providers[id] = {
        id,
        name: String(provider.name || id).trim() || id,
        type,
        base_url: String(provider.base_url || defaultBaseUrlForProvider(type)).trim() || defaultBaseUrlForProvider(type),
        api_key: String(provider.api_key || ""),
        enabled: provider.enabled !== false,
        created_at: Number(provider.created_at || Date.now()),
        updated_at: Number(provider.updated_at || Date.now()),
      };
    }

    const models: Record<string, LlmModelConfig> = {};
    for (const [rawId, rawModel] of Object.entries(rawModels)) {
      const model = rawModel && typeof rawModel === "object" ? (rawModel as Partial<LlmModelConfig>) : {};
      const providerId = String(model.provider_id || "").trim();
      const modelName = String(model.model || "").trim();
      if (!providerId || !providers[providerId] || !modelName) {
        continue;
      }
      if (model.enabled !== true) {
        continue;
      }
      const id = String(model.id || rawId || this.buildLlmModelId(providerId, modelName)).trim();
      models[id] = {
        id,
        provider_id: providerId,
        model: modelName,
        name: String(model.name || modelName).trim() || modelName,
        enabled: true,
        created_at: Number(model.created_at || Date.now()),
        updated_at: Number(model.updated_at || Date.now()),
      };
    }

    return { providers, models };
  }

  private async saveLlmConfig(config: LlmConfig): Promise<void> {
    const models = Object.fromEntries(
      Object.entries(config.models || {}).filter(([, model]) => model.enabled === true)
    );
    await this.state.storage.put("llm_config", { ...config, models });
  }

  private defaultAgentDocuments(now = Date.now()): Record<string, AgentDocument> {
    const docs: Array<Omit<AgentDocument, "created_at" | "updated_at">> = [
      {
        key: "persona",
        filename: "persona.md",
        label: "人格",
        description: "Agent 的说话风格、边界、决策习惯和协作方式。",
        content_md: [
          "# 人格",
          "",
          "定义 agent 对外表现和协作方式。这里不放 API key、token 或其它敏感信息。",
          "",
          "## 语气",
          "",
          "- 直接、清晰、少废话。",
          "- 遇到高风险操作先说明影响，再执行或请求确认。",
          "- 不确定时说明缺口，不编造事实。",
          "",
          "## 行为边界",
          "",
          "- 优先使用已启用模型和已暴露的 workflow node tools。",
          "- 只在任务需要时读取对应 skills，不一次性加载全部工具文档。",
        ].join("\n"),
      },
      {
        key: "memory",
        filename: "memory.md",
        label: "长期记忆",
        description: "可长期保留的用户偏好、项目事实和稳定约定。",
        content_md: [
          "# 长期记忆",
          "",
          "保存稳定、可复用的信息。不要记录短期推理过程，不要保存明文 token。",
          "",
          "## 用户偏好",
          "",
          "- 默认使用中文回复。",
          "- 偏好务实、简洁、直接的工程建议。",
          "",
          "## 项目事实",
          "",
          "- 本项目运行在 Cloudflare Worker / Durable Object 上。",
          "- 工作流节点通过 skills 文件树向 agent 暴露。",
        ].join("\n"),
      },
      {
        key: "tasks",
        filename: "tasks.md",
        label: "任务",
        description: "当前目标、待办事项、阻塞点和已完成事项。",
        content_md: [
          "# 任务",
          "",
          "用这个文件维护 agent 可继续推进的任务状态。",
          "",
          "## 当前目标",
          "",
          "- [ ] 接入 agent runner，让它读取这些文档并调用 skills/node tools。",
          "",
          "## 待确认",
          "",
          "- [ ] Agent 对话入口放在 WebUI 还是 Telegram 内。",
          "- [ ] Agent 是否允许自动修改长期记忆，还是需要人工确认。",
          "",
          "## 已完成",
          "",
          "- [x] 工作流节点 skills 文件树。",
        ].join("\n"),
      },
      {
        key: "instructions",
        filename: "instructions.md",
        label: "运行说明",
        description: "Agent 执行任务时必须遵守的上下文读取、工具调用和写入规则。",
        content_md: [
          "# 运行说明",
          "",
          "Agent 每次执行任务前应先读取 `persona.md`、`memory.md`、`tasks.md`，再按需读取 skills。",
          "",
          "## 上下文读取",
          "",
          "- 先读根 skill，再读分类 skill，最后读具体节点文档。",
          "- 只读取当前任务需要的文档，避免把全部工具塞进上下文。",
          "",
          "## 文档写入",
          "",
          "- `memory.md` 只记录稳定事实和明确偏好。",
          "- `tasks.md` 用于更新待办、阻塞点和完成状态。",
          "- 修改人格或长期记忆时，如果会改变用户体验，应先说明原因。",
        ].join("\n"),
      },
    ];
    return Object.fromEntries(
      docs.map((doc) => [
        doc.key,
        {
          ...doc,
          created_at: now,
          updated_at: now,
        },
      ])
    );
  }

  private normalizeAgentDocKey(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  private normalizeAgentSkillKey(input: unknown): string {
    return this.normalizeSkillPackKey(input);
  }

  private normalizeAgentSkillKeys(input: unknown): string[] {
    const items = Array.isArray(input) ? input : [];
    return Array.from(new Set(items.map((item) => this.normalizeAgentSkillKey(item)).filter(Boolean))).slice(0, 500);
  }

  private normalizeTelegramAgentPrefix(input: unknown, fallback = "*"): string {
    const value = input === undefined || input === null ? fallback : String(input);
    return value.trim().slice(0, 16);
  }

  private clampAgentToolRounds(input: unknown, fallback = 5): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(20, parsed));
  }

  private clampAgentContextTokens(input: unknown, fallback = 24000): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1000, Math.min(1_000_000, parsed));
  }

  private clampAgentCompressionTargetTokens(input: unknown, fallback = 1200): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(200, Math.min(50_000, parsed));
  }

  private clampAgentKeepRecentMessages(input: unknown, fallback = 8): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(2, Math.min(100, parsed));
  }

  private isDefaultAgentDocKey(key: string): boolean {
    return ["persona", "memory", "tasks", "instructions"].includes(key);
  }

  private normalizeAgentDocument(
    rawKey: unknown,
    rawDoc: unknown,
    fallback: AgentDocument | undefined,
    now = Date.now()
  ): AgentDocument | null {
    const source =
      rawDoc && typeof rawDoc === "object" && !Array.isArray(rawDoc)
        ? (rawDoc as Record<string, unknown>)
        : { content_md: typeof rawDoc === "string" ? rawDoc : "" };
    const key = this.normalizeAgentDocKey(source.key || rawKey || fallback?.key);
    if (!key) {
      return null;
    }
    const filenameInput = String(source.filename || fallback?.filename || `${key}.md`).trim();
    const filename = filenameInput.endsWith(".md") ? filenameInput : `${filenameInput || key}.md`;
    const contentMd = String(source.content_md ?? source.markdown ?? source.content ?? fallback?.content_md ?? "").trim();
    return {
      key,
      filename,
      label: String(source.label || fallback?.label || key).trim() || key,
      description: String(source.description || fallback?.description || "").trim(),
      content_md: contentMd.slice(0, 256 * 1024),
      created_at: Number(source.created_at || fallback?.created_at || now),
      updated_at: Number(source.updated_at || now),
    };
  }

  private async loadAgentConfig(): Promise<AgentConfig> {
    const now = Date.now();
    const defaults = this.defaultAgentDocuments(now);
    const stored = await this.state.storage.get<Partial<AgentConfig>>("agent_config");
    const docs: Record<string, AgentDocument> = { ...defaults };
    const rawDocs =
      stored?.docs && typeof stored.docs === "object" && !Array.isArray(stored.docs)
        ? (stored.docs as Record<string, unknown>)
        : {};
    for (const [rawKey, rawDoc] of Object.entries(rawDocs)) {
      const fallback = docs[this.normalizeAgentDocKey(rawKey)];
      const doc = this.normalizeAgentDocument(rawKey, rawDoc, fallback, now);
      if (doc) {
        docs[doc.key] = doc;
      }
    }
    return {
      enabled: stored?.enabled === true,
      default_model_id: String(stored?.default_model_id || "").trim(),
      allow_node_execution: stored?.allow_node_execution === true,
      max_tool_rounds: this.clampAgentToolRounds(stored?.max_tool_rounds, 5),
      context_management_enabled: stored?.context_management_enabled !== false,
      context_max_tokens: this.clampAgentContextTokens(stored?.context_max_tokens, 24000),
      context_compression_target_tokens: this.clampAgentCompressionTargetTokens(
        stored?.context_compression_target_tokens,
        1200
      ),
      context_keep_recent_messages: this.clampAgentKeepRecentMessages(stored?.context_keep_recent_messages, 8),
      disabled_skill_keys: this.normalizeAgentSkillKeys(stored?.disabled_skill_keys),
      telegram_command_enabled: stored?.telegram_command_enabled !== false,
      telegram_prefix_trigger: this.normalizeTelegramAgentPrefix(stored?.telegram_prefix_trigger, "*"),
      telegram_private_chat_enabled: stored?.telegram_private_chat_enabled === true,
      docs,
      created_at: Number(stored?.created_at || now),
      updated_at: Number(stored?.updated_at || now),
    };
  }

  private async saveAgentConfig(config: AgentConfig): Promise<void> {
    await this.state.storage.put("agent_config", config);
  }

  private publicAgentConfig(config: AgentConfig) {
    const orderedDocKeys = ["persona", "memory", "tasks", "instructions"];
    const docs = Object.fromEntries(
      Object.values(config.docs)
        .sort((a, b) => {
          const orderDiff = orderedDocKeys.indexOf(a.key) - orderedDocKeys.indexOf(b.key);
          if (orderDiff !== 0 && orderedDocKeys.includes(a.key) && orderedDocKeys.includes(b.key)) {
            return orderDiff;
          }
          if (orderedDocKeys.includes(a.key)) return -1;
          if (orderedDocKeys.includes(b.key)) return 1;
          return a.key.localeCompare(b.key);
        })
        .map((doc) => [doc.key, doc])
    );
    return {
      ...config,
      docs,
      capabilities: {
        can_read_docs: true,
        can_write_docs: true,
        can_execute_node_tools: config.allow_node_execution === true,
        doc_keys: Object.keys(docs),
        max_tool_rounds: config.max_tool_rounds,
        context_management_enabled: config.context_management_enabled,
        context_max_tokens: config.context_max_tokens,
        context_compression_target_tokens: config.context_compression_target_tokens,
        context_keep_recent_messages: config.context_keep_recent_messages,
        disabled_skill_keys: config.disabled_skill_keys,
      },
    };
  }

  private normalizeMcpServerId(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
  }

  private normalizeMcpHeaders(input: unknown, fallback: Record<string, string> = {}): Record<string, string> {
    if (input === undefined) {
      return { ...fallback };
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    const headers: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
      const key = String(rawKey || "").trim();
      const value = String(rawValue || "").trim();
      if (!key || /[\r\n]/.test(key) || /[\r\n]/.test(value)) {
        continue;
      }
      headers[key.slice(0, 120)] = value.slice(0, 4096);
    }
    return headers;
  }

  private normalizeMcpTool(input: unknown, fallback?: McpToolConfig): McpToolConfig | null {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const name = String(raw.name || fallback?.name || "").trim();
    if (!name) {
      return null;
    }
    const inputSchema =
      raw.input_schema && typeof raw.input_schema === "object" && !Array.isArray(raw.input_schema)
        ? (raw.input_schema as Record<string, unknown>)
        : raw.inputSchema && typeof raw.inputSchema === "object" && !Array.isArray(raw.inputSchema)
          ? (raw.inputSchema as Record<string, unknown>)
          : fallback?.input_schema || { type: "object", properties: {} };
    return {
      name: name.slice(0, 160),
      description: String(raw.description || fallback?.description || "").trim().slice(0, 2000),
      input_schema: inputSchema,
      enabled: raw.enabled === undefined ? fallback?.enabled !== false : raw.enabled === true,
      updated_at: Number(raw.updated_at || fallback?.updated_at || Date.now()),
    };
  }

  private normalizeMcpServer(input: unknown, existing?: McpServerConfig): { server?: McpServerConfig; error?: string } {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { error: "MCP server must be an object" };
    }
    const raw = input as Record<string, unknown>;
    const id = this.normalizeMcpServerId(raw.id || raw.key || raw.name || existing?.id);
    if (!id) {
      return { error: "MCP server id or name is required" };
    }
    const endpointUrl = String(raw.endpoint_url || raw.url || existing?.endpoint_url || "").trim();
    if (!/^https?:\/\//i.test(endpointUrl)) {
      return { error: "MCP endpoint_url must be http(s)" };
    }
    const now = Date.now();
    const fallbackTools = new Map((existing?.tools || []).map((tool) => [tool.name, tool]));
    const rawTools = Array.isArray(raw.tools) ? raw.tools : existing?.tools || [];
    const tools = rawTools
      .map((tool) => {
        const normalizedName =
          tool && typeof tool === "object" && !Array.isArray(tool)
            ? String((tool as Record<string, unknown>).name || "")
            : "";
        return this.normalizeMcpTool(tool, fallbackTools.get(normalizedName));
      })
      .filter((tool): tool is McpToolConfig => Boolean(tool));
    return {
      server: {
        id,
        name: String(raw.name || existing?.name || id).trim().slice(0, 120) || id,
        endpoint_url: endpointUrl,
        headers: this.normalizeMcpHeaders(raw.headers, existing?.headers || {}),
        enabled: raw.enabled === undefined ? existing?.enabled !== false : raw.enabled === true,
        tools,
        created_at: Number(existing?.created_at || now),
        updated_at: now,
      },
    };
  }

  private async loadMcpConfig(): Promise<McpConfig> {
    const stored = (await this.state.storage.get<Partial<McpConfig>>("mcp_config")) || {};
    const servers: Record<string, McpServerConfig> = {};
    const rawServers =
      stored.servers && typeof stored.servers === "object" && !Array.isArray(stored.servers)
        ? stored.servers
        : {};
    for (const [rawId, rawServer] of Object.entries(rawServers)) {
      const normalized = this.normalizeMcpServer({
        ...(rawServer as Record<string, unknown>),
        id: (rawServer as Record<string, unknown>)?.id || rawId,
      });
      if (normalized.server) {
        servers[normalized.server.id] = normalized.server;
      }
    }
    return { servers };
  }

  private async saveMcpConfig(config: McpConfig): Promise<void> {
    await this.state.storage.put("mcp_config", config);
  }

  private publicMcpServer(server: McpServerConfig): Record<string, unknown> {
    return {
      id: server.id,
      name: server.name,
      endpoint_url: server.endpoint_url,
      enabled: server.enabled,
      header_keys: Object.keys(server.headers || {}),
      header_count: Object.keys(server.headers || {}).length,
      tools: (server.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
        enabled: tool.enabled,
        updated_at: tool.updated_at,
      })),
      tool_count: (server.tools || []).length,
      created_at: server.created_at,
      updated_at: server.updated_at,
    };
  }

  private publicMcpConfig(config: McpConfig): Record<string, unknown> {
    return {
      servers: Object.values(config.servers || {})
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((server) => this.publicMcpServer(server)),
    };
  }

  private async handleMcpConfigGet(): Promise<Response> {
    return jsonResponse(this.publicMcpConfig(await this.loadMcpConfig()));
  }

  private async handleMcpServerUpsert(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await parseJson<unknown>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const config = await this.loadMcpConfig();
    const raw = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
    const rawId = this.normalizeMcpServerId(raw.id || raw.key || raw.name);
    const normalized = this.normalizeMcpServer(raw, rawId ? config.servers[rawId] : undefined);
    if (normalized.error || !normalized.server) {
      return jsonResponse({ error: normalized.error || "invalid MCP server" }, 400);
    }
    config.servers[normalized.server.id] = normalized.server;
    await this.saveMcpConfig(config);
    return jsonResponse({
      status: "ok",
      server: this.publicMcpServer(normalized.server),
      config: this.publicMcpConfig(config),
    });
  }

  private async handleMcpServerDelete(serverId: string): Promise<Response> {
    const id = this.normalizeMcpServerId(serverId);
    const config = await this.loadMcpConfig();
    if (id && config.servers[id]) {
      delete config.servers[id];
      await this.saveMcpConfig(config);
    }
    return jsonResponse({ status: "ok", deleted_id: id, config: this.publicMcpConfig(config) });
  }

  private buildMcpRequestHeaders(server: McpServerConfig, sessionId = ""): Record<string, string> {
    return {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(server.headers || {}),
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    };
  }

  private async parseMcpResponse(response: Response, expectedId: number): Promise<McpJsonRpcResponse> {
    const sessionContentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let payload: unknown = null;
    if (sessionContentType.includes("text/event-stream")) {
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice("data:".length).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === "object" && (!("id" in parsed) || Number((parsed as any).id) === expectedId)) {
            payload = parsed;
            break;
          }
        } catch {
          continue;
        }
      }
    } else if (text.trim()) {
      payload = JSON.parse(text);
    }
    const candidates = Array.isArray(payload) ? payload : [payload];
    const matched = candidates.find(
      (entry) => entry && typeof entry === "object" && Number((entry as Record<string, unknown>).id) === expectedId
    ) || candidates.find((entry) => entry && typeof entry === "object");
    if (!matched || typeof matched !== "object") {
      throw new Error(`MCP response is empty or invalid (${response.status})`);
    }
    const result = matched as McpJsonRpcResponse;
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    if (result.error) {
      const detail =
        result.error && typeof result.error === "object"
          ? JSON.stringify(result.error)
          : String(result.error || "");
      throw new Error(`MCP JSON-RPC error: ${detail}`);
    }
    return result;
  }

  private async postMcpJsonRpc(
    server: McpServerConfig,
    method: string,
    params: Record<string, unknown> = {},
    sessionId = ""
  ): Promise<{ result: unknown; session_id: string }> {
    const id = Math.floor(Math.random() * 1_000_000_000);
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(15_000)
        : undefined;
    const response = await fetch(server.endpoint_url, {
      method: "POST",
      headers: this.buildMcpRequestHeaders(server, sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
      signal,
    });
    const payload = await this.parseMcpResponse(response, id);
    return {
      result: payload.result,
      session_id: response.headers.get("mcp-session-id") || sessionId,
    };
  }

  private async initializeMcpSession(server: McpServerConfig): Promise<string> {
    const response = await this.postMcpJsonRpc(server, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "cf-telegram-bot-agent",
        version: "1.0.0",
      },
    });
    return response.session_id;
  }

  private async fetchMcpServerTools(server: McpServerConfig): Promise<McpToolConfig[]> {
    const sessionId = await this.initializeMcpSession(server);
    const listResponse = await this.postMcpJsonRpc(server, "tools/list", {}, sessionId);
    const result = listResponse.result && typeof listResponse.result === "object" ? (listResponse.result as Record<string, unknown>) : {};
    const rawTools = Array.isArray(result.tools) ? result.tools : [];
    const previous = new Map((server.tools || []).map((tool) => [tool.name, tool]));
    return rawTools
      .map((tool) => {
        const name =
          tool && typeof tool === "object" && !Array.isArray(tool)
            ? String((tool as Record<string, unknown>).name || "")
            : "";
        return this.normalizeMcpTool(tool, previous.get(name));
      })
      .filter((tool): tool is McpToolConfig => Boolean(tool));
  }

  private async handleMcpServerFetchTools(serverId: string): Promise<Response> {
    const id = this.normalizeMcpServerId(serverId);
    const config = await this.loadMcpConfig();
    const server = config.servers[id];
    if (!server) {
      return jsonResponse({ error: `MCP server not found: ${id}` }, 404);
    }
    try {
      const tools = await this.fetchMcpServerTools(server);
      const nextServer: McpServerConfig = {
        ...server,
        tools,
        updated_at: Date.now(),
      };
      config.servers[id] = nextServer;
      await this.saveMcpConfig(config);
      return jsonResponse({
        status: "ok",
        server: this.publicMcpServer(nextServer),
        config: this.publicMcpConfig(config),
      });
    } catch (error) {
      return jsonResponse({ error: `fetch MCP tools failed: ${String(error)}` }, 502);
    }
  }

  private normalizeMcpToolAliasPart(input: unknown, limit: number): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, limit) || "tool";
  }

  private buildMcpRuntimeTools(config: McpConfig): { definitions: LlmToolDefinition[]; tools: Map<string, McpRuntimeTool> } {
    const definitions: LlmToolDefinition[] = [];
    const tools = new Map<string, McpRuntimeTool>();
    for (const server of Object.values(config.servers || {}).filter((item) => item.enabled)) {
      const serverPart = this.normalizeMcpToolAliasPart(server.id, 20);
      for (const tool of server.tools || []) {
        if (tool.enabled === false) {
          continue;
        }
        const toolPart = this.normalizeMcpToolAliasPart(tool.name, 34);
        let alias = `mcp__${serverPart}__${toolPart}`.slice(0, 64);
        let suffix = 2;
        while (tools.has(alias)) {
          const tail = `_${suffix}`;
          alias = `mcp__${serverPart}__${toolPart}`.slice(0, 64 - tail.length) + tail;
          suffix += 1;
        }
        const runtimeTool: McpRuntimeTool = {
          alias,
          server_id: server.id,
          server_name: server.name,
          tool_name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema || { type: "object", properties: {} },
        };
        tools.set(alias, runtimeTool);
        definitions.push({
          name: alias,
          description: `MCP tool from ${server.name}: ${tool.name}. ${tool.description || ""}`.trim().slice(0, 2000),
          parameters: runtimeTool.input_schema,
        });
      }
    }
    return { definitions, tools };
  }

  private async callMcpRuntimeTool(
    runtimeTool: McpRuntimeTool,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const config = await this.loadMcpConfig();
    const server = config.servers[runtimeTool.server_id];
    if (!server || server.enabled === false) {
      return { ok: false, error: `MCP server is disabled or missing: ${runtimeTool.server_id}` };
    }
    const tool = (server.tools || []).find((entry) => entry.name === runtimeTool.tool_name);
    if (!tool || tool.enabled === false) {
      return { ok: false, error: `MCP tool is disabled or missing: ${runtimeTool.tool_name}` };
    }
    try {
      const sessionId = await this.initializeMcpSession(server);
      const response = await this.postMcpJsonRpc(
        server,
        "tools/call",
        {
          name: runtimeTool.tool_name,
          arguments: args || {},
        },
        sessionId
      );
      return {
        ok: true,
        server_id: server.id,
        server_name: server.name,
        tool_name: runtimeTool.tool_name,
        result: response.result,
      };
    } catch (error) {
      return {
        ok: false,
        server_id: server.id,
        tool_name: runtimeTool.tool_name,
        error: String(error),
      };
    }
  }

  private async validateAgentModelId(modelId: string): Promise<string | null> {
    const id = String(modelId || "").trim();
    if (!id) {
      return null;
    }
    const llmConfig = await this.loadLlmConfig();
    return llmConfig.models[id] ? null : `LLM model is not enabled: ${id}`;
  }

  private async handleAgentConfigUpdate(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const existing = await this.loadAgentConfig();
    const hasModelInput = Object.prototype.hasOwnProperty.call(payload, "default_model_id");
    const modelId = String(hasModelInput ? payload.default_model_id : existing.default_model_id || "").trim();
    const modelError = hasModelInput ? await this.validateAgentModelId(modelId) : null;
    if (modelError) {
      return jsonResponse({ error: modelError }, 400);
    }
    const now = Date.now();
    const docs = { ...existing.docs };
    if (payload.docs && typeof payload.docs === "object" && !Array.isArray(payload.docs)) {
      for (const [rawKey, rawDoc] of Object.entries(payload.docs as Record<string, unknown>)) {
        const fallback = docs[this.normalizeAgentDocKey(rawKey)];
        const doc = this.normalizeAgentDocument(rawKey, rawDoc, fallback, now);
        if (doc) {
          docs[doc.key] = doc;
        }
      }
    }
    const next: AgentConfig = {
      enabled: payload.enabled === undefined ? existing.enabled : payload.enabled === true,
      default_model_id: modelId,
      allow_node_execution:
        payload.allow_node_execution === undefined
          ? existing.allow_node_execution
          : payload.allow_node_execution === true,
      max_tool_rounds:
        payload.max_tool_rounds === undefined
          ? existing.max_tool_rounds
          : this.clampAgentToolRounds(payload.max_tool_rounds, existing.max_tool_rounds),
      context_management_enabled:
        payload.context_management_enabled === undefined
          ? existing.context_management_enabled
          : payload.context_management_enabled !== false,
      context_max_tokens:
        payload.context_max_tokens === undefined
          ? existing.context_max_tokens
          : this.clampAgentContextTokens(payload.context_max_tokens, existing.context_max_tokens),
      context_compression_target_tokens:
        payload.context_compression_target_tokens === undefined
          ? existing.context_compression_target_tokens
          : this.clampAgentCompressionTargetTokens(
              payload.context_compression_target_tokens,
              existing.context_compression_target_tokens
            ),
      context_keep_recent_messages:
        payload.context_keep_recent_messages === undefined
          ? existing.context_keep_recent_messages
          : this.clampAgentKeepRecentMessages(payload.context_keep_recent_messages, existing.context_keep_recent_messages),
      disabled_skill_keys:
        payload.disabled_skill_keys === undefined
          ? existing.disabled_skill_keys
          : this.normalizeAgentSkillKeys(payload.disabled_skill_keys),
      telegram_command_enabled:
        payload.telegram_command_enabled === undefined
          ? existing.telegram_command_enabled
          : payload.telegram_command_enabled !== false,
      telegram_prefix_trigger:
        payload.telegram_prefix_trigger === undefined
          ? existing.telegram_prefix_trigger
          : this.normalizeTelegramAgentPrefix(payload.telegram_prefix_trigger, existing.telegram_prefix_trigger),
      telegram_private_chat_enabled:
        payload.telegram_private_chat_enabled === undefined
          ? existing.telegram_private_chat_enabled
          : payload.telegram_private_chat_enabled === true,
      docs,
      created_at: existing.created_at,
      updated_at: now,
    };
    await this.saveAgentConfig(next);
    return jsonResponse({ status: "ok", config: this.publicAgentConfig(next) });
  }

  private async readAgentDocumentPayload(request: Request): Promise<Record<string, unknown>> {
    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("text/markdown") || contentType.includes("text/plain")) {
      return { content_md: await request.text() };
    }
    return await parseJson<Record<string, unknown>>(request);
  }

  private async handleAgentDocGet(rawKey: string): Promise<Response> {
    const key = this.normalizeAgentDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    const config = await this.loadAgentConfig();
    const doc = config.docs[key];
    if (!doc) {
      return jsonResponse({ error: `agent doc not found: ${key}` }, 404);
    }
    return jsonResponse({ doc, config: this.publicAgentConfig(config) });
  }

  private async handleAgentDocUpdate(rawKey: string, request: Request): Promise<Response> {
    const key = this.normalizeAgentDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.readAgentDocumentPayload(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const config = await this.loadAgentConfig();
    const now = Date.now();
    const doc = this.normalizeAgentDocument(key, { ...payload, key }, config.docs[key], now);
    if (!doc) {
      return jsonResponse({ error: "invalid doc" }, 400);
    }
    config.docs[doc.key] = doc;
    config.updated_at = now;
    await this.saveAgentConfig(config);
    return jsonResponse({ status: "ok", doc, config: this.publicAgentConfig(config) });
  }

  private async handleAgentDocAppend(rawKey: string, request: Request): Promise<Response> {
    const key = this.normalizeAgentDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.readAgentDocumentPayload(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const config = await this.loadAgentConfig();
    const existing = config.docs[key];
    if (!existing) {
      return jsonResponse({ error: `agent doc not found: ${key}` }, 404);
    }
    const text = String(payload.content_md ?? payload.text ?? payload.content ?? "").trim();
    if (!text) {
      return jsonResponse({ error: "append content is required" }, 400);
    }
    const heading = String(payload.heading || new Date().toISOString()).trim();
    const now = Date.now();
    const nextDoc: AgentDocument = {
      ...existing,
      content_md: `${existing.content_md.trim()}\n\n## ${heading}\n\n${text}`.slice(0, 256 * 1024),
      updated_at: now,
    };
    config.docs[key] = nextDoc;
    config.updated_at = now;
    await this.saveAgentConfig(config);
    return jsonResponse({ status: "ok", doc: nextDoc, config: this.publicAgentConfig(config) });
  }

  private async handleAgentDocDelete(rawKey: string): Promise<Response> {
    const key = this.normalizeAgentDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    if (this.isDefaultAgentDocKey(key)) {
      return jsonResponse({ error: "default agent docs cannot be deleted" }, 400);
    }
    const config = await this.loadAgentConfig();
    if (!config.docs[key]) {
      return jsonResponse({ error: `agent doc not found: ${key}` }, 404);
    }
    delete config.docs[key];
    config.updated_at = Date.now();
    await this.saveAgentConfig(config);
    return jsonResponse({ status: "ok", deleted_key: key, config: this.publicAgentConfig(config) });
  }

  private truncateAgentText(value: unknown, limit = 12000): string {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (text.length <= limit) {
      return text;
    }
    return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]`;
  }

  private stripAgentJsonFence(value: string): string {
    const trimmed = String(value || "").trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  private parseAgentModelTurn(text: string): AgentModelTurn {
    const raw = this.stripAgentJsonFence(text);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { type: "final", message: text };
      }
      const obj = parsed as Record<string, unknown>;
      if (obj.type === "tool" && obj.tool && typeof obj.tool === "object" && !Array.isArray(obj.tool)) {
        const tool = obj.tool as Record<string, unknown>;
        return {
          type: "tool",
          message: typeof obj.message === "string" ? obj.message : "",
          tool: {
            name: String(tool.name || "").trim(),
            arguments:
              tool.arguments && typeof tool.arguments === "object" && !Array.isArray(tool.arguments)
                ? (tool.arguments as Record<string, unknown>)
                : {},
          },
        };
      }
      return {
        type: "final",
        message: typeof obj.message === "string" ? obj.message : text,
      };
    } catch {
      return { type: "final", message: text };
    }
  }

  private normalizeAgentChatHistory(input: unknown): AgentChatMessage[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((entry) => {
        const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : "";
        const content = String(item.content || "").trim();
        return role && content ? { role, content: this.truncateAgentText(content, 4000) } : null;
      })
      .filter((entry): entry is AgentChatMessage => Boolean(entry))
      .slice(-500);
  }

  private normalizeAgentSessionId(input: unknown): string {
    return String(input || "")
      .trim()
      .replace(/[^a-zA-Z0-9:._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 128);
  }

  private agentSessionContextKey(sessionId: string): string {
    return `agent:session:context:${sessionId}`;
  }

  private compactAgentLogValue(value: unknown, limit = 20_000): unknown {
    let text = "";
    try {
      text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
    if (text.length <= limit) {
      return value;
    }
    return {
      truncated: true,
      preview: this.truncateAgentText(text, limit),
      original_length: text.length,
    };
  }

  private normalizeAgentToolLogEntries(input: unknown): AgentToolLogEntry[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((entry, index) => {
        const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const tool = String(item.tool || "").trim();
        if (!tool) {
          return null;
        }
        const createdAt = Number(item.created_at || Date.now());
        return {
          id: String(item.id || `${createdAt}:${index}`).slice(0, 160),
          tool_call_id: String(item.tool_call_id || "").slice(0, 160),
          tool,
          arguments: item.arguments || {},
          result: item.result || {},
          created_at: createdAt,
        };
      })
      .filter((entry): entry is AgentToolLogEntry => Boolean(entry))
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 200);
  }

  private normalizeAgentSessionContext(raw: unknown, sessionId: string): AgentSessionContext {
    const now = Date.now();
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    return {
      session_id: sessionId,
      summary: this.truncateAgentText(source.summary || "", 40_000).trim(),
      compressed_turns: Math.max(0, Math.trunc(Number(source.compressed_turns) || 0)),
      recent_history: this.normalizeAgentChatHistory(source.recent_history),
      last_context:
        source.last_context && typeof source.last_context === "object" && !Array.isArray(source.last_context)
          ? (source.last_context as Record<string, unknown>)
          : {},
      tool_calls: this.normalizeAgentToolLogEntries(source.tool_calls),
      tool_call_count: Math.max(0, Math.trunc(Number(source.tool_call_count) || 0)),
      last_message: this.truncateAgentText(source.last_message || "", 4000),
      last_answer: this.truncateAgentText(source.last_answer || "", 4000),
      created_at: Number(source.created_at || now),
      updated_at: Number(source.updated_at || now),
    };
  }

  private async loadAgentSessionContext(sessionId: string): Promise<AgentSessionContext> {
    const normalized = this.normalizeAgentSessionId(sessionId);
    const stored = normalized ? await this.state.storage.get<AgentSessionContext>(this.agentSessionContextKey(normalized)) : null;
    return this.normalizeAgentSessionContext(stored, normalized);
  }

  private async saveAgentSessionContext(context: AgentSessionContext): Promise<void> {
    const sessionId = this.normalizeAgentSessionId(context.session_id);
    if (!sessionId) {
      return;
    }
    await this.state.storage.put(this.agentSessionContextKey(sessionId), {
      ...context,
      session_id: sessionId,
      summary: this.truncateAgentText(context.summary, 40_000).trim(),
      recent_history: this.normalizeAgentChatHistory(context.recent_history),
      last_context: context.last_context || {},
      tool_calls: this.normalizeAgentToolLogEntries(context.tool_calls),
      tool_call_count: Math.max(0, Math.trunc(Number(context.tool_call_count) || 0)),
      last_message: this.truncateAgentText(context.last_message || "", 4000),
      last_answer: this.truncateAgentText(context.last_answer || "", 4000),
      updated_at: Date.now(),
    });
  }

  private async clearAgentSessionContext(sessionId: string): Promise<void> {
    const normalized = this.normalizeAgentSessionId(sessionId);
    if (normalized) {
      await this.state.storage.delete(this.agentSessionContextKey(normalized));
    }
  }

  private publicAgentSessionContext(context: AgentSessionContext): Record<string, unknown> {
    const sessionId = this.normalizeAgentSessionId(context.session_id);
    const kind = sessionId.startsWith("telegram:") ? "telegram" : sessionId.startsWith("webui:") ? "webui" : "custom";
    return {
      session_id: sessionId,
      kind,
      summary: context.summary,
      preview: this.truncateAgentText(context.summary, 420),
      compressed_turns: context.compressed_turns,
      recent_history_count: context.recent_history.length,
      tool_call_count: context.tool_call_count || context.tool_calls.length,
      last_context: context.last_context,
      last_message: context.last_message,
      last_answer: context.last_answer,
      created_at: context.created_at,
      updated_at: context.updated_at,
    };
  }

  private async listAgentSessionContexts(): Promise<AgentSessionContext[]> {
    const storage = this.state.storage as unknown as {
      list?: <T = unknown>(options?: { prefix?: string; limit?: number; reverse?: boolean }) => Promise<Map<string, T>>;
    };
    if (typeof storage.list !== "function") {
      return [];
    }
    const prefix = "agent:session:context:";
    const entries = await storage.list<AgentSessionContext>({ prefix, limit: 500 });
    return Array.from(entries.entries())
      .map(([key, value]) => this.normalizeAgentSessionContext(value, key.slice(prefix.length)))
      .filter((context) => context.session_id)
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  private async handleAgentSessionsList(): Promise<Response> {
    const sessions = await this.listAgentSessionContexts();
    return jsonResponse({
      sessions: sessions.map((context) => this.publicAgentSessionContext(context)),
      total: sessions.length,
    });
  }

  private async handleAgentSessionGet(rawSessionId: string): Promise<Response> {
    const sessionId = this.normalizeAgentSessionId(rawSessionId);
    if (!sessionId) {
      return jsonResponse({ error: "missing session_id" }, 400);
    }
    const context = await this.loadAgentSessionContext(sessionId);
    if (!context.summary && context.recent_history.length === 0 && context.tool_calls.length === 0) {
      return jsonResponse({ error: `agent session not found: ${sessionId}` }, 404);
    }
    return jsonResponse({
      session: {
        ...this.publicAgentSessionContext(context),
        recent_history: context.recent_history,
        tool_calls: context.tool_calls,
      },
    });
  }

  private async clearAgentSessionById(rawSessionId: string): Promise<Response> {
    const sessionId = this.normalizeAgentSessionId(rawSessionId);
    if (!sessionId) {
      return jsonResponse({ error: "missing session_id" }, 400);
    }
    await this.clearAgentSessionContext(sessionId);
    if (sessionId.startsWith("telegram:")) {
      const [, chatId = "", userId = "anonymous"] = sessionId.split(":");
      if (chatId) {
        await this.state.storage.delete(this.agentTelegramHistoryKey(chatId, userId));
      }
    }
    return jsonResponse({ status: "ok", deleted_session_id: sessionId });
  }

  private async handleAgentSessionPromoteMemory(rawSessionId: string, request: Request): Promise<Response> {
    const sessionId = this.normalizeAgentSessionId(rawSessionId);
    if (!sessionId) {
      return jsonResponse({ error: "missing session_id" }, 400);
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch {
      payload = {};
    }
    const context = await this.loadAgentSessionContext(sessionId);
    const text = String(payload.text || context.summary || "").trim();
    if (!text) {
      return jsonResponse({ error: "session summary is empty" }, 400);
    }
    const now = Date.now();
    const config = await this.loadAgentConfig();
    const existing = config.docs.memory || this.defaultAgentDocuments(now).memory;
    const heading = String(payload.heading || `Promoted session memory: ${sessionId}`).trim().slice(0, 160);
    const nextDoc: AgentDocument = {
      ...existing,
      content_md: `${existing.content_md.trim()}\n\n## ${heading}\n\n${this.truncateAgentText(text, 12_000)}`.slice(0, 256 * 1024),
      updated_at: now,
    };
    config.docs.memory = nextDoc;
    config.updated_at = now;
    await this.saveAgentConfig(config);
    return jsonResponse({
      status: "ok",
      session: this.publicAgentSessionContext(context),
      doc: nextDoc,
      config: this.publicAgentConfig(config),
    });
  }

  private estimateAgentTextTokens(input: unknown): number {
    return Math.ceil(String(input || "").length / 4);
  }

  private estimateAgentMessagesTokens(messages: LlmNativeChatMessage[]): number {
    return messages.reduce((total, message) => total + this.estimateAgentTextTokens(JSON.stringify(message)) + 4, 0);
  }

  private estimateAgentContextTokens(
    systemPrompt: string,
    messages: LlmNativeChatMessage[],
    tools: LlmToolDefinition[]
  ): number {
    return (
      this.estimateAgentTextTokens(systemPrompt) +
      this.estimateAgentMessagesTokens(messages) +
      this.estimateAgentTextTokens(JSON.stringify(tools || [])) +
      32
    );
  }

  private buildAgentSummaryMessage(summary: string): LlmNativeChatMessage | null {
    const content = String(summary || "").trim();
    if (!content) {
      return null;
    }
    return {
      role: "system",
      content: [
        "Compressed session context for this conversation.",
        "Use it as prior conversation memory, but prefer newer user messages when there is a conflict.",
        "",
        content,
      ].join("\n"),
    };
  }

  private buildFallbackAgentSessionSummary(
    previousSummary: string,
    historyToCompress: AgentChatMessage[],
    targetTokens: number
  ): string {
    const targetChars = Math.max(800, targetTokens * 4);
    const previous = String(previousSummary || "").trim();
    const turns = historyToCompress
      .map((entry) => `- ${entry.role}: ${this.truncateAgentText(entry.content, 700)}`)
      .join("\n");
    return [previous ? `Previous summary:\n${previous}` : "", "Compressed turns:", turns]
      .filter(Boolean)
      .join("\n\n")
      .slice(-targetChars)
      .trim();
  }

  private async compressAgentSessionHistory(args: {
    config: AgentConfig;
    modelId: string;
    previousSummary: string;
    historyToCompress: AgentChatMessage[];
    runtimePayload: Record<string, unknown>;
  }): Promise<string> {
    const targetTokens = this.clampAgentCompressionTargetTokens(args.config.context_compression_target_tokens, 1200);
    const result = await callConfiguredLlmChat(await this.getExecutionEnv(), {
      modelId: args.modelId,
      systemPrompt: [
        "You compress one agent conversation session.",
        "Return a concise Markdown summary that preserves stable user goals, decisions, constraints, important facts, tool outcomes, unresolved tasks, and user preferences.",
        "Do not include API keys, bot tokens, passwords, secrets, cookies, or authorization headers.",
        "This summary is per-session context, not global long-term memory.",
      ].join("\n"),
      userPrompt: JSON.stringify(
        {
          previous_summary: args.previousSummary || "",
          runtime: this.summarizeAgentRuntime(args.runtimePayload),
          messages: args.historyToCompress,
          target_tokens: targetTokens,
        },
        null,
        2
      ),
      temperature: 0.1,
      maxTokens: targetTokens,
    });
    const text = String(result.text || "").trim();
    return text || this.buildFallbackAgentSessionSummary(args.previousSummary, args.historyToCompress, targetTokens);
  }

  private normalizeAgentRuntimePayload(input: unknown): Record<string, unknown> {
    const source = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const variables =
      source.variables && typeof source.variables === "object" && !Array.isArray(source.variables)
        ? { ...(source.variables as Record<string, unknown>) }
        : {};
    const payload: Record<string, unknown> = {};
    for (const key of [
      "chat_id",
      "chat_type",
      "message_id",
      "thread_id",
      "user_id",
      "username",
      "full_name",
      "callback_data",
    ]) {
      if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") {
        payload[key] = source[key];
      }
    }
    payload.variables = variables;
    return payload;
  }

  private mergeAgentRuntimePayload(
    base: Record<string, unknown>,
    override: Record<string, unknown>
  ): Record<string, unknown> {
    const baseVars =
      base.variables && typeof base.variables === "object" && !Array.isArray(base.variables)
        ? (base.variables as Record<string, unknown>)
        : {};
    const overrideVars =
      override.variables && typeof override.variables === "object" && !Array.isArray(override.variables)
        ? (override.variables as Record<string, unknown>)
        : {};
    return {
      ...base,
      ...override,
      variables: {
        ...baseVars,
        ...overrideVars,
      },
    };
  }

  private summarizeAgentRuntime(runtimePayload: Record<string, unknown>): string {
    const keys = ["chat_id", "chat_type", "message_id", "thread_id", "user_id", "username", "full_name"];
    const summary = Object.fromEntries(
      keys
        .filter((key) => runtimePayload[key] !== undefined && runtimePayload[key] !== null && String(runtimePayload[key]) !== "")
        .map((key) => [key, runtimePayload[key]])
    );
    if (Object.keys(summary).length === 0) {
      return "No Telegram runtime context is attached.";
    }
    return JSON.stringify(summary, null, 2);
  }

  private buildAgentConversationMessages(
    summary: string,
    history: AgentChatMessage[],
    currentMessage: string
  ): LlmNativeChatMessage[] {
    return [
      this.buildAgentSummaryMessage(summary),
      ...history.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      {
        role: "user" as const,
        content: currentMessage,
      },
    ].filter((entry): entry is LlmNativeChatMessage => Boolean(entry));
  }

  private async prepareAgentContext(args: {
    config: AgentConfig;
    modelId: string;
    sessionId: string;
    history: AgentChatMessage[];
    message: string;
    runtimePayload: Record<string, unknown>;
    systemPrompt: string;
    tools: LlmToolDefinition[];
  }): Promise<PreparedAgentContext> {
    const sessionId = this.normalizeAgentSessionId(args.sessionId);
    const sessionContext = sessionId ? await this.loadAgentSessionContext(sessionId) : null;
    let summary = sessionContext?.summary || "";
    let retainedHistory = this.normalizeAgentChatHistory(args.history);
    let messages = this.buildAgentConversationMessages(summary, retainedHistory, args.message);
    const estimatedBefore = this.estimateAgentContextTokens(args.systemPrompt, messages, args.tools);
    const maxContextTokens = this.clampAgentContextTokens(args.config.context_max_tokens, 24000);
    const keepRecent = Math.min(
      retainedHistory.length,
      this.clampAgentKeepRecentMessages(args.config.context_keep_recent_messages, 8)
    );
    const meta: Record<string, unknown> = {
      session_id: sessionId || "",
      context_management_enabled: args.config.context_management_enabled !== false,
      max_context_tokens: maxContextTokens,
      estimated_tokens_before: estimatedBefore,
      compressed: false,
      summary_active: Boolean(summary),
      retained_history_messages: retainedHistory.length,
    };

    if (args.config.context_management_enabled !== false && estimatedBefore > maxContextTokens && retainedHistory.length > 0) {
      const splitIndex = Math.max(0, retainedHistory.length - keepRecent);
      const historyToCompress = retainedHistory.slice(0, splitIndex);
      retainedHistory = retainedHistory.slice(splitIndex);
      if (historyToCompress.length > 0) {
        try {
          summary = await this.compressAgentSessionHistory({
            config: args.config,
            modelId: args.modelId,
            previousSummary: summary,
            historyToCompress,
            runtimePayload: args.runtimePayload,
          });
        } catch (error) {
          summary = this.buildFallbackAgentSessionSummary(
            summary,
            historyToCompress,
            args.config.context_compression_target_tokens
          );
          meta.compression_error = String(error);
        }
        if (sessionContext) {
          await this.saveAgentSessionContext({
            ...sessionContext,
            summary,
            compressed_turns: sessionContext.compressed_turns + historyToCompress.length,
          });
        }
        meta.compressed = true;
        meta.compressed_messages = historyToCompress.length;
        meta.summary_active = Boolean(summary);
      }
      messages = this.buildAgentConversationMessages(summary, retainedHistory, args.message);
    }

    let estimatedAfter = this.estimateAgentContextTokens(args.systemPrompt, messages, args.tools);
    let trimmedRecentMessages = 0;
    while (args.config.context_management_enabled !== false && estimatedAfter > maxContextTokens && retainedHistory.length > 0) {
      retainedHistory = retainedHistory.slice(1);
      trimmedRecentMessages += 1;
      messages = this.buildAgentConversationMessages(summary, retainedHistory, args.message);
      estimatedAfter = this.estimateAgentContextTokens(args.systemPrompt, messages, args.tools);
    }

    meta.estimated_tokens_after = estimatedAfter;
    meta.retained_history_messages = retainedHistory.length;
    meta.trimmed_recent_messages = trimmedRecentMessages;

    return {
      messages,
      retainedHistory,
      meta,
    };
  }

  private buildAgentResponseHistory(retainedHistory: AgentChatMessage[], userMessage: string, assistantMessage: string) {
    return this.normalizeAgentChatHistory([
      ...retainedHistory,
      { role: "user", content: userMessage },
      { role: "assistant", content: this.truncateAgentText(assistantMessage, 4000) },
    ]);
  }

  private async saveAgentSessionAfterChat(args: {
    sessionId: string;
    retainedHistory: AgentChatMessage[];
    contextMeta: Record<string, unknown>;
    toolResults: Array<Record<string, unknown>>;
    userMessage: string;
    assistantMessage: string;
  }): Promise<void> {
    const sessionId = this.normalizeAgentSessionId(args.sessionId);
    if (!sessionId) {
      return;
    }
    const now = Date.now();
    const context = await this.loadAgentSessionContext(sessionId);
    const newToolLogs = args.toolResults.map((result, index) => ({
      id: `${now}:${index}:${String(result.tool || "tool")}`,
      tool_call_id: String(result.tool_call_id || ""),
      tool: String(result.tool || "unknown_tool"),
      arguments: this.compactAgentLogValue(result.arguments || {}, 12_000),
      result: this.compactAgentLogValue(result.result || {}, 20_000),
      created_at: now + index,
    }));
    await this.saveAgentSessionContext({
      ...context,
      recent_history: this.buildAgentResponseHistory(args.retainedHistory, args.userMessage, args.assistantMessage),
      last_context: args.contextMeta || {},
      tool_calls: this.normalizeAgentToolLogEntries([...newToolLogs, ...context.tool_calls]),
      tool_call_count: (context.tool_call_count || context.tool_calls.length) + newToolLogs.length,
      last_message: args.userMessage,
      last_answer: args.assistantMessage,
    });
  }

  private collectAgentSkillFiles(skillPacks: Array<Record<string, unknown>>): AgentSkillFile[] {
    const files: AgentSkillFile[] = [];
    for (const pack of skillPacks || []) {
      const packKey = String(pack.key || "skill").trim() || "skill";
      const packFiles = Array.isArray(pack.files) ? pack.files : [];
      if (packFiles.length > 0) {
        for (const rawFile of packFiles) {
          const file = rawFile && typeof rawFile === "object" ? (rawFile as Record<string, unknown>) : {};
          const path = String(file.path || "").trim();
          if (!path) continue;
          files.push({
            path,
            kind: typeof file.kind === "string" ? file.kind : undefined,
            title: typeof file.title === "string" ? file.title : undefined,
            category: typeof file.category === "string" ? file.category : undefined,
            tool_id: typeof file.tool_id === "string" ? file.tool_id : undefined,
            content_md: typeof file.content_md === "string" ? file.content_md : "",
            source: typeof file.source === "string" ? file.source : String(pack.source || ""),
            skill_key: packKey,
            content_type: typeof file.content_type === "string" ? file.content_type : "text/markdown",
          });
        }
        continue;
      }
      if (typeof pack.content_md === "string" && pack.content_md.trim()) {
        files.push({
          path: `${packKey}/SKILL.md`,
          kind: "root",
          title: String(pack.label || packKey),
          category: typeof pack.category === "string" ? pack.category : undefined,
          content_md: pack.content_md,
          source: String(pack.source || ""),
          skill_key: packKey,
          content_type: "text/markdown",
        });
      }
    }
    return files;
  }

  private filterAgentSkillPacks(config: AgentConfig, skillPacks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const disabled = new Set(config.disabled_skill_keys || []);
    return (skillPacks || []).filter((pack) => {
      const key = this.normalizeAgentSkillKey(pack.key);
      return key && !disabled.has(key);
    });
  }

  private collectAgentSkillToolIds(skillPacks: Array<Record<string, unknown>>): Set<string> {
    const ids = new Set<string>();
    for (const pack of skillPacks || []) {
      const toolIds = Array.isArray(pack.tool_ids) ? pack.tool_ids : [];
      for (const rawId of toolIds) {
        const id = String(rawId || "").trim();
        if (id) {
          ids.add(id);
        }
      }
      const tools = Array.isArray(pack.tools) ? pack.tools : [];
      for (const rawTool of tools) {
        const tool = rawTool && typeof rawTool === "object" ? (rawTool as Record<string, unknown>) : {};
        const id = String(tool.id || "").trim();
        if (id) {
          ids.add(id);
        }
      }
    }
    return ids;
  }

  private collectAgentSkillPackKeys(skillPacks: Array<Record<string, unknown>>): Set<string> {
    return new Set((skillPacks || []).map((pack) => this.normalizeAgentSkillKey(pack.key)).filter(Boolean));
  }

  private isAgentWorkflowSkillEnabled(enabledSkillKeys: Set<string>): boolean {
    return enabledSkillKeys.has("workflows");
  }

  private isAgentWorkflowEditorSkillEnabled(enabledSkillKeys: Set<string>): boolean {
    return enabledSkillKeys.has("workflow-editor");
  }

  private isAgentSkillEditorSkillEnabled(enabledSkillKeys: Set<string>): boolean {
    return enabledSkillKeys.has("skill-editor");
  }

  private findAgentSkillFile(files: AgentSkillFile[], rawPath: unknown): AgentSkillFile | null {
    const path = String(rawPath || "").trim();
    if (!path) {
      return null;
    }
    const relative = this.vfsPathToSkillRelative(path) || this.sanitizeSkillRelativePath(path);
    return (
      files.find((file) => file.path === path || file.path === relative) ||
      files.find((file) => file.path.endsWith(path) || (relative && file.path.endsWith(relative))) ||
      null
    );
  }

  private skillRelativeToVfsPath(path: string): string {
    const relative = this.sanitizeSkillRelativePath(path);
    return relative ? `skills://${relative}` : "skills://";
  }

  private vfsPathToSkillRelative(input: unknown): string {
    const raw = String(input || "").trim();
    if (!raw || raw === "/" || raw === "skills://" || raw === "skills:/") {
      return "";
    }
    return this.sanitizeSkillRelativePath(raw);
  }

  private vfsEntryName(relativePath: string): string {
    const parts = relativePath.split("/").filter(Boolean);
    return parts[parts.length - 1] || "skills://";
  }

  private listSkillVfs(
    files: AgentSkillFile[],
    rawPath: unknown,
    args: { recursive?: boolean; depth?: number } = {}
  ): Record<string, unknown> {
    const root = this.vfsPathToSkillRelative(rawPath);
    const recursive = args.recursive === true;
    const maxDepth = Math.max(1, Math.min(8, Math.trunc(Number(args.depth) || (recursive ? 3 : 1))));
    const entries = new Map<string, Record<string, unknown>>();
    const rootPrefix = root ? `${root}/` : "";

    for (const file of files) {
      const path = this.sanitizeSkillRelativePath(file.path);
      if (!path) continue;
      if (root && path !== root && !path.startsWith(rootPrefix)) {
        continue;
      }
      const remainder = root ? path.slice(root.length).replace(/^\/+/, "") : path;
      if (!remainder) {
        entries.set(path, {
          path: this.skillRelativeToVfsPath(path),
          name: this.vfsEntryName(path),
          type: "file",
          kind: file.kind,
          title: file.title,
          category: file.category,
          tool_id: file.tool_id,
          source: file.source,
          skill_key: file.skill_key,
          size: (file.content_md || "").length,
        });
        continue;
      }
      const parts = remainder.split("/").filter(Boolean);
      const limit = recursive ? Math.min(parts.length, maxDepth) : 1;
      for (let depth = 1; depth <= limit; depth += 1) {
        const childRel = [root, ...parts.slice(0, depth)].filter(Boolean).join("/");
        const isFile = childRel === path;
        if (!entries.has(childRel)) {
          entries.set(childRel, {
            path: this.skillRelativeToVfsPath(childRel),
            name: this.vfsEntryName(childRel),
            type: isFile ? "file" : "directory",
            kind: isFile ? file.kind : "directory",
            title: isFile ? file.title : undefined,
            category: isFile ? file.category : undefined,
            tool_id: isFile ? file.tool_id : undefined,
            source: isFile ? file.source : undefined,
            skill_key: isFile ? file.skill_key : undefined,
            size: isFile ? (file.content_md || "").length : undefined,
          });
        } else if (!isFile) {
          entries.get(childRel)!.type = "directory";
        }
      }
    }

    return {
      ok: true,
      path: this.skillRelativeToVfsPath(root),
      entries: Array.from(entries.values()).sort((a, b) => {
        const typeDiff = String(a.type) === "directory" && String(b.type) !== "directory"
          ? -1
          : String(a.type) !== "directory" && String(b.type) === "directory"
            ? 1
            : 0;
        if (typeDiff !== 0) return typeDiff;
        return String(a.path || "").localeCompare(String(b.path || ""));
      }),
    };
  }

  private readSkillVfsFile(files: AgentSkillFile[], rawPath: unknown, maxChars = 40000): Record<string, unknown> {
    const file = this.findAgentSkillFile(files, rawPath);
    if (!file) {
      return { ok: false, error: `VFS file not found: ${String(rawPath || "")}` };
    }
    return {
      ok: true,
      file: {
        ...file,
        path: this.skillRelativeToVfsPath(file.path),
        content_md: this.truncateAgentText(file.content_md || "", maxChars),
      },
    };
  }

  private searchSkillVfsFiles(
    files: AgentSkillFile[],
    args: { query?: unknown; path?: unknown; root?: unknown; limit?: unknown }
  ): Record<string, unknown> {
    const query = String(args.query || "").trim().toLowerCase();
    const root = this.vfsPathToSkillRelative(args.path || args.root || "");
    const rootPrefix = root ? `${root}/` : "";
    const limit = Math.max(1, Math.min(50, Math.trunc(Number(args.limit) || 12)));
    if (!query) {
      return { ok: false, error: "query is required" };
    }
    const matches = files
      .filter((file) => {
        const path = this.sanitizeSkillRelativePath(file.path);
        return !root || path === root || path.startsWith(rootPrefix);
      })
      .map((file) => {
        const haystack = [
          file.path,
          file.title || "",
          file.kind || "",
          file.category || "",
          file.tool_id || "",
          file.skill_key || "",
          file.content_md || "",
        ]
          .join("\n")
          .toLowerCase();
        const index = haystack.indexOf(query);
        if (index < 0) return null;
        const content = file.content_md || "";
        const contentIndex = content.toLowerCase().indexOf(query);
        const snippet =
          contentIndex >= 0
            ? content.slice(Math.max(0, contentIndex - 180), Math.min(content.length, contentIndex + query.length + 360))
            : "";
        return {
          path: this.skillRelativeToVfsPath(file.path),
          kind: file.kind,
          title: file.title,
          category: file.category,
          tool_id: file.tool_id,
          source: file.source,
          skill_key: file.skill_key,
          snippet,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .slice(0, limit);
    return { ok: true, matches };
  }

  private buildAgentSystemPrompt(
    config: AgentConfig,
    skillFiles: AgentSkillFile[],
    runtimePayload: Record<string, unknown> = {}
  ): string {
    const rootSkillDocs = skillFiles
      .filter((file) => file.kind === "root" || file.path.endsWith("/SKILL.md"))
      .slice(0, 12)
      .map((file) => `## ${file.path}\n\n${this.truncateAgentText(file.content_md || "", 2400)}`);
    const skillIndex = skillFiles
      .map((file) => {
        const meta = [file.kind, file.category, file.tool_id].filter(Boolean).join(", ");
        return `- ${file.path}${meta ? ` (${meta})` : ""}${file.title ? ` - ${file.title}` : ""}`;
      })
      .slice(0, 220);
    const docBlocks = Object.values(config.docs)
      .map((doc) => `## ${doc.filename}\n\n${this.truncateAgentText(doc.content_md, 6000)}`)
      .join("\n\n");
    return [
      "You are the framework-level agent for this Telegram bot builder.",
      "Answer the user in the same language they use unless persona or memory says otherwise.",
      config.allow_node_execution
        ? "You can inspect and update agent markdown docs, inspect generated skills, and execute real workflow-node tools."
        : "You can inspect and update agent markdown docs, inspect generated skills, and run workflow-node previews.",
      config.allow_node_execution
        ? "The run_node tool performs real node execution and may cause Telegram/network side effects. Use it only when the user asked for that outcome."
        : "Do not claim that you executed real Telegram side effects. Real node execution is disabled; use run_node_preview only.",
      "Use native tool calls when you need exact persisted docs, skill details, node output, or node preview output.",
      "Do not print JSON tool requests in normal messages. Call the provided tools through the model's native tool/function interface.",
      "Skills are mounted as a virtual file system under `skills://`. Treat VFS reads as authoritative and load only the files needed for the current task.",
      "",
      "# Persistent Agent Docs",
      "",
      docBlocks,
      "",
      "# Tool Use Policy",
      "",
      "- Read only the smallest needed skill files with `vfs_list`, `vfs_read`, or `vfs_search`. Prefer root skill docs first, then category docs, then specific node docs.",
      "- Disabled skills are not present in this prompt and their node tools are blocked by the backend.",
      "- Use run_node_preview to inspect deterministic node output before using run_node for side-effecting work.",
      "- Workflow editing tools are versioned. Prefer one small workflow edit per tool call and inspect returned analysis before continuing.",
      "- If a tool result has `ok:false`, treat it as feedback from the runtime. Inspect `error`, `retryable`, and the original arguments; retry with corrected arguments when safe, or use another read/list/search tool before answering.",
      "- Do not stop just because one retryable tool failed. Try to recover within the available tool-step limit. If the error is blocked, unauthorized, disabled, or requires missing user configuration, explain that clearly instead of retrying blindly.",
      "- When Telegram runtime is attached, node params may use placeholders such as `{{ runtime.chat_id }}`. The backend also fills missing exact `chat_id`, `user_id`, `message_id`, and `thread_id` inputs from current runtime.",
      "When updating memory, only write stable facts or explicit user preferences. When updating tasks, keep concise checklists.",
      "Never store API keys, bot tokens, or secrets in agent docs.",
      "",
      "# Current Runtime Context",
      "",
      this.summarizeAgentRuntime(runtimePayload),
      "",
      "# Skill Root Docs",
      "",
      rootSkillDocs.length ? rootSkillDocs.join("\n\n") : "No skill root docs are available.",
      "",
      "# Skill File Index",
      "",
      skillIndex.length ? skillIndex.map((line) => line.replace(/^- /, "- skills://")).join("\n") : "No skill files are available.",
    ].join("\n");
  }

  private buildAgentToolDefinitions(
    config: AgentConfig,
    enabledSkillKeys: Set<string> = new Set(),
    mcpTools: LlmToolDefinition[] = []
  ): LlmToolDefinition[] {
    const stringSchema = (description: string) => ({ type: "string", description });
    const objectSchema = (
      properties: Record<string, Record<string, unknown>>,
      required: string[] = []
    ): Record<string, unknown> => ({
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    });
    const nodeParams = {
      action_id: stringSchema("Workflow node action id, for example json_parse, llm_generate, send_message."),
      tool_id: stringSchema("Alias for action_id."),
      params: { type: "object", description: "Node config/params object." },
      runtime: {
        type: "object",
        description:
          "Optional runtime override. If omitted, current Telegram chat_id/user_id/message_id/thread_id are injected automatically when available.",
      },
      button: { type: "object", description: "Optional current button context." },
      menu: { type: "object", description: "Optional current menu context." },
    };
    const tools: LlmToolDefinition[] = [
      {
        name: "list_agent_docs",
        description: "List persistent agent markdown documents and metadata.",
        parameters: objectSchema({}),
      },
      {
        name: "read_agent_doc",
        description: "Read one persistent agent markdown document.",
        parameters: objectSchema(
          {
            key: stringSchema("Document key such as persona, memory, tasks, instructions, or a custom key."),
          },
          ["key"]
        ),
      },
      {
        name: "write_agent_doc",
        description: "Replace a persistent agent markdown document with full content.",
        parameters: objectSchema(
          {
            key: stringSchema("Document key."),
            content_md: stringSchema("Full markdown content to write."),
            label: stringSchema("Optional display label."),
            description: stringSchema("Optional document description."),
            filename: stringSchema("Optional markdown filename."),
          },
          ["key", "content_md"]
        ),
      },
      {
        name: "append_agent_doc",
        description: "Append a section to a persistent agent markdown document.",
        parameters: objectSchema(
          {
            key: stringSchema("Document key."),
            heading: stringSchema("Optional heading for the appended section."),
            text: stringSchema("Markdown text to append."),
          },
          ["key", "text"]
        ),
      },
      {
        name: "vfs_list",
        description: "List entries in the enabled virtual file system. Skills are mounted under skills://.",
        parameters: objectSchema({
          path: stringSchema("Directory path to list, for example skills://, skills://workflow-nodes, or skills://custom/my_skill."),
          recursive: { type: "boolean", description: "Whether to include nested entries." },
          depth: { type: "integer", description: "Maximum recursive depth, 1 to 8." },
        }),
      },
      {
        name: "vfs_read",
        description: "Read one enabled virtual file by path.",
        parameters: objectSchema(
          {
            path: stringSchema("File path, for example skills://workflow-nodes/ai/llm_generate.md."),
          },
          ["path"]
        ),
      },
      {
        name: "vfs_search",
        description: "Search enabled virtual files by keyword.",
        parameters: objectSchema(
          {
            query: stringSchema("Search keyword."),
            path: stringSchema("Optional root path to search under, for example skills://workflow-nodes/ai."),
            limit: { type: "integer", description: "Maximum matches, 1 to 50." },
          },
          ["query"]
        ),
      },
      {
        name: "list_skill_files",
        description: "Deprecated compatibility alias for listing enabled skill files. Prefer vfs_list.",
        parameters: objectSchema({
          category: stringSchema("Optional skill/node category filter."),
          query: stringSchema("Optional path, title, category, or tool id filter."),
        }),
      },
      {
        name: "read_skill_file",
        description: "Deprecated compatibility alias for reading one enabled skill file. Prefer vfs_read.",
        parameters: objectSchema(
          {
            path: stringSchema("Skill file path, for example workflow-nodes/ai/llm_generate.md."),
          },
          ["path"]
        ),
      },
      {
        name: "search_skill_files",
        description: "Deprecated compatibility alias for searching enabled skill files. Prefer vfs_search.",
        parameters: objectSchema(
          {
            query: stringSchema("Search keyword."),
            limit: { type: "integer", description: "Maximum matches, 1 to 24." },
          },
          ["query"]
        ),
      },
      {
        name: "run_node_preview",
        description: "Preview one enabled workflow node without real side effects.",
        parameters: objectSchema(nodeParams, ["action_id"]),
      },
    ];
    if (this.isAgentWorkflowSkillEnabled(enabledSkillKeys)) {
      tools.push(
        {
          name: "list_workflows",
          description: "List saved workflows with summaries, trigger information, and issue counts.",
          parameters: objectSchema({
            query: stringSchema("Optional text filter for workflow id, name, description, actions, or triggers."),
            limit: { type: "integer", description: "Maximum workflows to return, 1 to 100." },
          }),
        },
        {
          name: "search_workflows",
          description: "Search saved workflows by keyword across names, descriptions, node actions, and trigger metadata.",
          parameters: objectSchema(
            {
              query: stringSchema("Search keyword."),
              limit: { type: "integer", description: "Maximum matches to return, 1 to 50." },
            },
            ["query"]
          ),
        },
        {
          name: "read_workflow",
          description: "Read one saved workflow structure. Sensitive fields are redacted.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              include_analysis: { type: "boolean", description: "Whether to include execution-plan analysis." },
            },
            ["workflow_id"]
          ),
        },
        {
          name: "analyze_workflow",
          description: "Analyze one saved workflow for execution order, trigger summary, missing inputs, risky nodes, and reference issues.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
            },
            ["workflow_id"]
          ),
        }
      );
    }
    if (this.isAgentWorkflowEditorSkillEnabled(enabledSkillKeys)) {
      tools.push(
        {
          name: "create_workflow",
          description: "Create a new empty workflow. The previous non-existence state is versioned for rollback.",
          parameters: objectSchema({
            workflow_id: stringSchema("Optional workflow id. If omitted, the backend generates one."),
            name: stringSchema("Workflow display name."),
            description: stringSchema("Optional workflow description."),
            reason: stringSchema("Short reason for the version history entry."),
          }),
        },
        {
          name: "update_workflow_meta",
          description: "Update workflow name or description with an automatic rollback snapshot.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              name: stringSchema("Optional new display name."),
              description: stringSchema("Optional new description."),
              reason: stringSchema("Short reason for the version history entry."),
            },
            ["workflow_id"]
          ),
        },
        {
          name: "upsert_workflow_node",
          description: "Create or update one workflow node with validated action_id and automatic rollback snapshot.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              node_id: stringSchema("Optional node id. If omitted when creating, the backend generates a numeric id."),
              action_id: stringSchema("Node action id. Required when creating a node or changing node type."),
              data: { type: "object", description: "Node configuration data." },
              position: { type: "object", description: "Node canvas position, for example { x: 200, y: 120 }." },
              merge_data: { type: "boolean", description: "When true, merge data into existing node data. Default true." },
              replace_data: { type: "boolean", description: "When true, replace existing node data instead of merging." },
              reason: stringSchema("Short reason for the version history entry."),
            },
            ["workflow_id"]
          ),
        },
        {
          name: "remove_workflow_node",
          description: "Remove one workflow node and its connected edges with an automatic rollback snapshot.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              node_id: stringSchema("Node id to remove."),
              remove_edges: { type: "boolean", description: "Remove connected edges. Defaults to true." },
              reason: stringSchema("Short reason for the version history entry."),
            },
            ["workflow_id", "node_id"]
          ),
        },
        {
          name: "connect_workflow_nodes",
          description: "Create or update one workflow edge with an automatic rollback snapshot.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              edge_id: stringSchema("Optional edge id. If omitted, the backend generates one."),
              source_node: stringSchema("Source node id."),
              source_output: stringSchema("Source output port. Defaults to __control__."),
              source_path: stringSchema("Optional source output path for data references."),
              target_node: stringSchema("Target node id."),
              target_input: stringSchema("Target input port. Defaults to __control__."),
              reason: stringSchema("Short reason for the version history entry."),
            },
            ["workflow_id", "source_node", "target_node"]
          ),
        },
        {
          name: "remove_workflow_edge",
          description: "Remove one workflow edge by edge id or source/target filter with an automatic rollback snapshot.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              edge_id: stringSchema("Optional edge id to remove."),
              source_node: stringSchema("Optional source node filter."),
              target_node: stringSchema("Optional target node filter."),
              reason: stringSchema("Short reason for the version history entry."),
            },
            ["workflow_id"]
          ),
        },
        {
          name: "delete_workflow",
          description: "Delete one workflow after saving a rollback snapshot.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              reason: stringSchema("Short reason for the version history entry."),
            },
            ["workflow_id"]
          ),
        },
        {
          name: "list_workflow_versions",
          description: "List rollback snapshots for one workflow.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              limit: { type: "integer", description: "Maximum versions to return, 1 to 80." },
            },
            ["workflow_id"]
          ),
        },
        {
          name: "read_workflow_version",
          description: "Read one rollback snapshot for a workflow. Sensitive fields are redacted.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              version_id: stringSchema("Version id."),
              include_analysis: { type: "boolean", description: "Whether to include execution-plan analysis for the snapshot." },
            },
            ["workflow_id", "version_id"]
          ),
        },
        {
          name: "rollback_workflow",
          description: "Rollback a workflow to a saved version. The current state is saved as a new version before rollback.",
          parameters: objectSchema(
            {
              workflow_id: stringSchema("Workflow id."),
              version_id: stringSchema("Version id to restore."),
              reason: stringSchema("Short reason for the rollback version history entry."),
            },
            ["workflow_id", "version_id"]
          ),
        }
      );
    }
    if (this.isAgentSkillEditorSkillEnabled(enabledSkillKeys)) {
      tools.push(
        {
          name: "list_skill_packs",
          description: "List generated and uploaded skill packs with metadata. Use before editing skills.",
          parameters: objectSchema({
            query: stringSchema("Optional search query."),
            include_generated: { type: "boolean", description: "Whether to include generated read-only skill packs. Default true." },
          }),
        },
        {
          name: "read_skill_pack",
          description: "Read one skill pack and its files. Uploaded packs can be edited; generated packs are read-only.",
          parameters: objectSchema(
            {
              key: stringSchema("Skill pack key."),
            },
            ["key"]
          ),
        },
        {
          name: "upsert_skill_pack",
          description: "Create or replace an uploaded custom skill pack. Cannot overwrite generated skill packs.",
          parameters: objectSchema(
            {
              key: stringSchema("Skill pack key."),
              label: stringSchema("Display label."),
              category: stringSchema("Skill category."),
              description: stringSchema("Short description."),
              tool_ids: { type: "array", items: { type: "string" }, description: "Existing workflow node ids referenced by this skill." },
              content_md: stringSchema("Optional root SKILL.md content."),
              files: {
                type: "array",
                description: "Optional skill files.",
                items: {
                  type: "object",
                  properties: {
                    path: stringSchema("Relative file path, for example SKILL.md or references/usage.md."),
                    content_md: stringSchema("Markdown content for the file."),
                    title: stringSchema("Optional file title."),
                    kind: stringSchema("Optional file kind such as root, reference, or tool."),
                    category: stringSchema("Optional file category."),
                    tool_id: stringSchema("Optional node tool id referenced by this file."),
                  },
                  required: ["path", "content_md"],
                },
              },
              reason: stringSchema("Short reason for the edit."),
            },
            ["key"]
          ),
        },
        {
          name: "upsert_skill_file",
          description: "Create or update one file inside an uploaded custom skill pack.",
          parameters: objectSchema(
            {
              key: stringSchema("Uploaded skill pack key."),
              path: stringSchema("Relative file path, for example SKILL.md or references/usage.md."),
              content_md: stringSchema("Markdown content for the file."),
              title: stringSchema("Optional file title."),
              kind: stringSchema("Optional file kind such as root, reference, or tool."),
              category: stringSchema("Optional category."),
              tool_id: stringSchema("Optional node tool id referenced by this file."),
              reason: stringSchema("Short reason for the edit."),
            },
            ["key", "path", "content_md"]
          ),
        },
        {
          name: "remove_skill_file",
          description: "Remove one non-root file from an uploaded custom skill pack.",
          parameters: objectSchema(
            {
              key: stringSchema("Uploaded skill pack key."),
              path: stringSchema("Relative file path to remove."),
              reason: stringSchema("Short reason for the edit."),
            },
            ["key", "path"]
          ),
        },
        {
          name: "delete_skill_pack",
          description: "Delete one uploaded custom skill pack. Generated skill packs cannot be deleted.",
          parameters: objectSchema(
            {
              key: stringSchema("Uploaded skill pack key."),
              reason: stringSchema("Short reason for the edit."),
            },
            ["key"]
          ),
        }
      );
    }
    if (config.allow_node_execution === true) {
      tools.push({
        name: "run_node",
        description: "Execute one enabled workflow node for real. This may cause Telegram/network/LLM side effects.",
        parameters: objectSchema(nodeParams, ["action_id"]),
      });
    }
    if (enabledSkillKeys.has("mcp-tools")) {
      tools.push(...mcpTools);
    }
    return tools;
  }

  private applyAgentRuntimeInputDefaults(
    action: ModularActionDefinition & Record<string, unknown>,
    params: Record<string, unknown>,
    runtime: RuntimeContext
  ): Record<string, unknown> {
    const inputs = Array.isArray(action.inputs) ? action.inputs : [];
    const inputNames = new Set(inputs.map((input) => String(input.name || "")).filter(Boolean));
    const defaults: Record<string, unknown> = {
      chat_id: runtime.chat_id && runtime.chat_id !== "0" ? runtime.chat_id : undefined,
      user_id: runtime.user_id,
      message_id: runtime.message_id,
      thread_id: runtime.thread_id,
    };
    const next = { ...params };
    for (const [key, value] of Object.entries(defaults)) {
      if (!inputNames.has(key)) {
        continue;
      }
      if (value === undefined || value === null || String(value).trim() === "") {
        continue;
      }
      if (next[key] === undefined || next[key] === null || String(next[key]).trim() === "") {
        next[key] = value;
      }
    }
    return next;
  }

  private isAgentSensitiveWorkflowKey(key: string): boolean {
    return /token|api[_-]?key|secret|password|authorization|bearer|cookie|credential/i.test(key);
  }

  private redactAgentWorkflowValue(value: unknown, keyPath: string[] = [], depth = 0): unknown {
    const currentKey = keyPath[keyPath.length - 1] || "";
    if (this.isAgentSensitiveWorkflowKey(currentKey)) {
      return "[redacted]";
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      return value.length > 6000 ? `${value.slice(0, 6000)}\n[truncated ${value.length - 6000} chars]` : value;
    }
    if (typeof value !== "object") {
      return value;
    }
    if (depth >= 8) {
      return "[truncated nested object]";
    }
    if (Array.isArray(value)) {
      return value.slice(0, 200).map((entry, index) => this.redactAgentWorkflowValue(entry, [...keyPath, String(index)], depth + 1));
    }
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(obj).map(([key, entry]) => [key, this.redactAgentWorkflowValue(entry, [...keyPath, key], depth + 1)])
    );
  }

  private buildAgentWorkflowTriggers(workflow: WorkflowDefinition): Array<Record<string, unknown>> {
    return Object.values(workflow.nodes || {})
      .filter((node) => String(node.action_id || "").startsWith("trigger_"))
      .map((node) => {
        const data = (node.data || {}) as Record<string, unknown>;
        return {
          node_id: node.id,
          type: String(node.action_id || "").replace(/^trigger_/, ""),
          enabled: data.enabled === undefined ? true : Boolean(data.enabled),
          priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : this.defaultTriggerPriority(String(node.action_id || "")),
          config: this.redactAgentWorkflowValue(data),
        };
      });
  }

  private buildAgentWorkflowActionMap(actions: Array<ModularActionDefinition & Record<string, unknown>>) {
    return new Map(actions.map((action) => [action.id, action]));
  }

  private summarizeAgentWorkflow(
    workflow: WorkflowDefinition,
    actions: Array<ModularActionDefinition & Record<string, unknown>>
  ): Record<string, unknown> {
    const actionMap = this.buildAgentWorkflowActionMap(actions);
    const nodes = Object.values(workflow.nodes || {});
    const actionIds = Array.from(new Set(nodes.map((node) => String(node.action_id || "")).filter(Boolean))).sort();
    const triggers = this.buildAgentWorkflowTriggers(workflow);
    let analysis: ReturnType<typeof analyzeWorkflowExecutionPlan> | null = null;
    try {
      analysis = analyzeWorkflowExecutionPlan(workflow);
    } catch {
      analysis = null;
    }
    const riskyNodes = nodes
      .map((node) => {
        const action = actionMap.get(String(node.action_id || ""));
        if (!action) {
          return null;
        }
        const risk = this.inferToolRiskLevel(action);
        const runtime = (action.runtime || {}) as Record<string, unknown>;
        if (risk === "safe" && !runtime.sideEffects && !runtime.allowNetwork) {
          return null;
        }
        return {
          node_id: node.id,
          action_id: node.action_id,
          risk_level: risk,
          side_effects: Boolean(runtime.sideEffects),
          allow_network: Boolean(runtime.allowNetwork),
        };
      })
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    return {
      id: workflow.id,
      name: workflow.name || workflow.id,
      description: workflow.description || "",
      node_count: nodes.length,
      edge_count: (workflow.edges || []).length,
      trigger_count: triggers.length,
      triggers: triggers.slice(0, 20),
      action_ids: actionIds.slice(0, 80),
      risky_nodes: riskyNodes.slice(0, 40),
      analysis: analysis
        ? {
            has_control_bus: analysis.has_control_bus,
            order: analysis.order,
            issue_count: analysis.issues.length,
            error_count: analysis.issues.filter((issue) => issue.level === "error").length,
            warning_count: analysis.issues.filter((issue) => issue.level === "warning").length,
          }
        : null,
    };
  }

  private findAgentWorkflow(state: ButtonsModel, rawWorkflowId: unknown): WorkflowDefinition | null {
    const workflowId = String(rawWorkflowId || "").trim();
    if (!workflowId) {
      return null;
    }
    return (state.workflows || {})[workflowId] || null;
  }

  private listAgentWorkflows(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const query = String(args.query || "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(args.limit) || 50)));
    const workflows = Object.values(state.workflows || {})
      .map((workflow) => this.summarizeAgentWorkflow(workflow, actions))
      .filter((summary) => {
        if (!query) {
          return true;
        }
        return JSON.stringify(summary).toLowerCase().includes(query);
      })
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
      .slice(0, limit);
    return { ok: true, workflows, total: Object.keys(state.workflows || {}).length };
  }

  private searchAgentWorkflows(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const query = String(args.query || "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(50, Math.trunc(Number(args.limit) || 12)));
    if (!query) {
      return { ok: false, error: "query is required" };
    }
    const matches = Object.values(state.workflows || {})
      .map((workflow) => {
        const summary = this.summarizeAgentWorkflow(workflow, actions);
        const nodeHaystack = Object.values(workflow.nodes || {})
          .map((node) => [node.id, node.action_id, JSON.stringify(this.redactAgentWorkflowValue(node.data || {}))].join(" "))
          .join("\n");
        const haystack = [JSON.stringify(summary), nodeHaystack, JSON.stringify(workflow.edges || [])].join("\n").toLowerCase();
        if (!haystack.includes(query)) {
          return null;
        }
        return summary;
      })
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .slice(0, limit);
    return { ok: true, matches };
  }

  private buildAgentWorkflowInputIssues(
    workflow: WorkflowDefinition,
    actions: Array<ModularActionDefinition & Record<string, unknown>>
  ): Array<Record<string, unknown>> {
    const actionMap = this.buildAgentWorkflowActionMap(actions);
    const edges = workflow.edges || [];
    const issues: Array<Record<string, unknown>> = [];
    for (const node of Object.values(workflow.nodes || {})) {
      const action = actionMap.get(String(node.action_id || ""));
      if (!action) {
        issues.push({
          level: "error",
          code: "UNKNOWN_ACTION",
          node_id: node.id,
          action_id: node.action_id,
          message: `Node ${node.id} references unknown action ${node.action_id}`,
        });
        continue;
      }
      const data = (node.data || {}) as Record<string, unknown>;
      const linkedInputs = new Set(edges.filter((edge) => edge.target_node === node.id).map((edge) => edge.target_input));
      for (const input of action.inputs || []) {
        if (!input.required) {
          continue;
        }
        const inputName = String(input.name || "");
        if (!inputName || inputName === CONTROL_PORT_NAME || inputName === LEGACY_CONTROL_PORT_NAME) {
          continue;
        }
        const value = data[inputName];
        const hasValue = value !== undefined && value !== null && String(value).trim() !== "";
        if (!hasValue && !linkedInputs.has(inputName)) {
          issues.push({
            level: "warning",
            code: "MISSING_REQUIRED_INPUT",
            node_id: node.id,
            action_id: node.action_id,
            input: inputName,
            message: `Node ${node.id} (${node.action_id}) is missing required input ${inputName}`,
          });
        }
      }
    }
    return issues;
  }

  private analyzeAgentWorkflow(
    workflow: WorkflowDefinition,
    actions: Array<ModularActionDefinition & Record<string, unknown>>
  ): Record<string, unknown> {
    const plan = analyzeWorkflowExecutionPlan(workflow);
    const inputIssues = this.buildAgentWorkflowInputIssues(workflow, actions);
    return {
      ok: true,
      workflow: this.summarizeAgentWorkflow(workflow, actions),
      execution_plan: plan,
      input_issues: inputIssues,
    };
  }

  private readAgentWorkflow(
    workflow: WorkflowDefinition,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    includeAnalysis: boolean
  ): Record<string, unknown> {
    const nodes = Object.fromEntries(
      Object.entries(workflow.nodes || {}).map(([nodeId, node]) => [
        nodeId,
        {
          id: node.id,
          action_id: node.action_id,
          position: node.position,
          data: this.redactAgentWorkflowValue(node.data || {}),
        },
      ])
    );
    return {
      ok: true,
      workflow: {
        id: workflow.id,
        name: workflow.name || workflow.id,
        description: workflow.description || "",
        nodes,
        edges: workflow.edges || [],
        summary: this.summarizeAgentWorkflow(workflow, actions),
      },
      ...(includeAnalysis ? { analysis: this.analyzeAgentWorkflow(workflow, actions) } : {}),
    };
  }

  private cloneWorkflowSnapshot(workflow: WorkflowDefinition | null | undefined): WorkflowDefinition | null {
    if (!workflow) {
      return null;
    }
    return JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition;
  }

  private workflowVersionsKey(workflowId: string): string {
    return `workflow_versions:${workflowId}`;
  }

  private normalizeWorkflowId(input: unknown): string {
    return String(input || "")
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96);
  }

  private normalizeWorkflowNodeId(input: unknown): string {
    return String(input || "")
      .trim()
      .replace(/[^A-Za-z0-9_.:-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96);
  }

  private async loadWorkflowVersions(workflowId: string): Promise<WorkflowVersionEntry[]> {
    const key = this.workflowVersionsKey(workflowId);
    const stored = (await this.state.storage.get<WorkflowVersionEntry[]>(key)) || [];
    return Array.isArray(stored)
      ? stored
          .filter((entry) => entry && typeof entry === "object" && String(entry.workflow_id || "") === workflowId)
          .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
      : [];
  }

  private async saveWorkflowVersions(workflowId: string, versions: WorkflowVersionEntry[]): Promise<void> {
    await this.state.storage.put(this.workflowVersionsKey(workflowId), versions.slice(0, 80));
  }

  private publicWorkflowVersion(entry: WorkflowVersionEntry): Record<string, unknown> {
    const snapshot = entry.snapshot;
    return {
      version_id: entry.version_id,
      workflow_id: entry.workflow_id,
      operation: entry.operation,
      reason: entry.reason,
      actor: entry.actor,
      created_at: entry.created_at,
      snapshot_exists: Boolean(snapshot),
      snapshot_name: snapshot?.name || "",
      snapshot_description: snapshot?.description || "",
      snapshot_node_count: snapshot ? Object.keys(snapshot.nodes || {}).length : 0,
      snapshot_edge_count: snapshot ? (snapshot.edges || []).length : 0,
    };
  }

  private async recordWorkflowVersion(args: {
    workflowId: string;
    workflow: WorkflowDefinition | null | undefined;
    operation: string;
    reason?: string;
    actor?: string;
  }): Promise<WorkflowVersionEntry> {
    const now = Date.now();
    const entry: WorkflowVersionEntry = {
      version_id: `${generateId("wv")}_${now}`,
      workflow_id: args.workflowId,
      operation: String(args.operation || "update_workflow"),
      reason: String(args.reason || args.operation || "workflow change").trim().slice(0, 240),
      actor: String(args.actor || "api").trim().slice(0, 80) || "api",
      snapshot: this.cloneWorkflowSnapshot(args.workflow || null),
      created_at: now,
    };
    const versions = await this.loadWorkflowVersions(args.workflowId);
    await this.saveWorkflowVersions(args.workflowId, [entry, ...versions]);
    return entry;
  }

  private buildAgentWorkflowEditResult(
    workflow: WorkflowDefinition | null,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    version: WorkflowVersionEntry,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> {
    if (!workflow) {
      return {
        ok: true,
        workflow_deleted: true,
        version_created: this.publicWorkflowVersion(version),
        ...extra,
      };
    }
    let analysis: Record<string, unknown> | null = null;
    try {
      analysis = this.analyzeAgentWorkflow(workflow, actions);
    } catch (error) {
      analysis = { ok: false, error: String(error) };
    }
    return {
      ok: true,
      workflow: this.summarizeAgentWorkflow(workflow, actions),
      analysis,
      version_created: this.publicWorkflowVersion(version),
      ...extra,
    };
  }

  private getWorkflowEditReason(args: Record<string, unknown>, fallback: string): string {
    return String(args.reason || fallback).trim().slice(0, 240) || fallback;
  }

  private normalizeWorkflowPosition(input: unknown, fallback: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const x = Number(raw.x);
    const y = Number(raw.y);
    return {
      x: Number.isFinite(x) ? Math.round(x) : fallback.x,
      y: Number.isFinite(y) ? Math.round(y) : fallback.y,
    };
  }

  private normalizeWorkflowNodeData(input: unknown): Record<string, unknown> {
    return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  }

  private findWorkflowVersion(versions: WorkflowVersionEntry[], versionId: unknown): WorkflowVersionEntry | null {
    const id = String(versionId || "").trim();
    if (!id) {
      return null;
    }
    return versions.find((version) => version.version_id === id) || null;
  }

  private async handleWorkflowVersionsList(workflowId: string, url: URL): Promise<Response> {
    const id = this.normalizeWorkflowId(workflowId);
    if (!id) {
      return jsonResponse({ error: "missing workflow_id" }, 400);
    }
    const limit = Math.max(1, Math.min(80, Math.trunc(Number(url.searchParams.get("limit")) || 30)));
    const versions = await this.loadWorkflowVersions(id);
    return jsonResponse({
      workflow_id: id,
      versions: versions.slice(0, limit).map((version) => this.publicWorkflowVersion(version)),
      total: versions.length,
    });
  }

  private async handleWorkflowVersionGet(workflowId: string, versionId: string): Promise<Response> {
    const id = this.normalizeWorkflowId(workflowId);
    const versions = await this.loadWorkflowVersions(id);
    const version = this.findWorkflowVersion(versions, versionId);
    if (!version) {
      return jsonResponse({ error: `workflow version not found: ${versionId}` }, 404);
    }
    return jsonResponse({
      version: this.publicWorkflowVersion(version),
      snapshot: version.snapshot,
    });
  }

  private async rollbackWorkflowToVersion(args: {
    workflowId: string;
    versionId: string;
    reason?: string;
    actor?: string;
  }): Promise<{ version?: WorkflowVersionEntry; workflow?: WorkflowDefinition | null; error?: string; status?: number }> {
    const workflowId = this.normalizeWorkflowId(args.workflowId);
    if (!workflowId) {
      return { error: "workflow_id is required", status: 400 };
    }
    const versions = await this.loadWorkflowVersions(workflowId);
    const target = this.findWorkflowVersion(versions, args.versionId);
    if (!target) {
      return { error: `workflow version not found: ${args.versionId}`, status: 404 };
    }
    const state = await this.loadState();
    state.workflows = state.workflows || {};
    const before = state.workflows[workflowId] || null;
    const rollbackVersion = await this.recordWorkflowVersion({
      workflowId,
      workflow: before,
      operation: "rollback_workflow",
      reason: args.reason || `rollback to ${target.version_id}`,
      actor: args.actor || "api",
    });
    if (target.snapshot) {
      state.workflows[workflowId] = this.cloneWorkflowSnapshot(target.snapshot) as WorkflowDefinition;
    } else {
      delete state.workflows[workflowId];
    }
    await this.saveState(state);
    return {
      version: rollbackVersion,
      workflow: state.workflows[workflowId] || null,
    };
  }

  private async handleWorkflowRollback(workflowId: string, request: Request): Promise<Response> {
    const payload = await parseJson<Record<string, unknown>>(request).catch(() => ({}));
    const result = await this.rollbackWorkflowToVersion({
      workflowId,
      versionId: String(payload.version_id || ""),
      reason: String(payload.reason || ""),
      actor: "api",
    });
    if (result.error) {
      return jsonResponse({ error: result.error }, result.status || 400);
    }
    return jsonResponse({
      status: "ok",
      workflow_id: this.normalizeWorkflowId(workflowId),
      workflow: result.workflow,
      version_created: result.version ? this.publicWorkflowVersion(result.version) : null,
    });
  }

  private async createAgentWorkflow(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    state.workflows = state.workflows || {};
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id) || generateId("workflow");
    if (state.workflows[workflowId]) {
      return { ok: false, error: `workflow already exists: ${workflowId}` };
    }
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow: null,
      operation: "create_workflow",
      reason: this.getWorkflowEditReason(args, "create workflow"),
      actor: "agent",
    });
    const workflow: WorkflowDefinition = {
      id: workflowId,
      name: String(args.name || workflowId).trim() || workflowId,
      description: String(args.description || "").trim(),
      nodes: {},
      edges: [],
    };
    state.workflows[workflowId] = workflow;
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(workflow, actions, version, { workflow_id: workflowId });
  }

  private async updateAgentWorkflowMeta(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const workflow = workflowId ? state.workflows?.[workflowId] : null;
    if (!workflow) {
      return { ok: false, error: `workflow not found: ${workflowId}` };
    }
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow,
      operation: "update_workflow_meta",
      reason: this.getWorkflowEditReason(args, "update workflow metadata"),
      actor: "agent",
    });
    if (args.name !== undefined) {
      workflow.name = String(args.name || workflowId).trim() || workflowId;
    }
    if (args.description !== undefined) {
      workflow.description = String(args.description || "").trim();
    }
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(workflow, actions, version);
  }

  private async upsertAgentWorkflowNode(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const workflow = workflowId ? state.workflows?.[workflowId] : null;
    if (!workflow) {
      return { ok: false, error: `workflow not found: ${workflowId}` };
    }
    const { nodes } = this.normalizeWorkflowShape(workflow);
    const requestedNodeId = this.normalizeWorkflowNodeId(args.node_id || args.id);
    const nodeId = requestedNodeId || this.nextWorkflowNodeId(workflow);
    const existing = nodes[nodeId] as WorkflowNode | undefined;
    const actionId = String(args.action_id || existing?.action_id || "").trim();
    if (!actionId) {
      return { ok: false, error: "action_id is required when creating a node" };
    }
    const action = actions.find((item) => item.id === actionId);
    if (!action) {
      return { ok: false, error: `unknown node action_id: ${actionId}` };
    }
    const dataInput = this.normalizeWorkflowNodeData(args.data);
    const replaceData = args.replace_data === true || args.merge_data === false;
    const fallbackPosition = existing?.position || { x: 0, y: 0 };
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow,
      operation: existing ? "update_workflow_node" : "add_workflow_node",
      reason: this.getWorkflowEditReason(args, existing ? `update node ${nodeId}` : `add node ${nodeId}`),
      actor: "agent",
    });
    nodes[nodeId] = {
      id: nodeId,
      action_id: actionId,
      position: this.normalizeWorkflowPosition(args.position, fallbackPosition),
      data: existing && !replaceData ? { ...(existing.data || {}), ...dataInput } : dataInput,
    };
    workflow.nodes = nodes as Record<string, WorkflowNode>;
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(workflow, actions, version, {
      node: {
        id: nodeId,
        action_id: actionId,
        risk_level: this.inferToolRiskLevel(action),
      },
    });
  }

  private async removeAgentWorkflowNode(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const workflow = workflowId ? state.workflows?.[workflowId] : null;
    const nodeId = this.normalizeWorkflowNodeId(args.node_id);
    if (!workflow || !nodeId || !workflow.nodes?.[nodeId]) {
      return { ok: false, error: `workflow node not found: ${workflowId}/${nodeId}` };
    }
    const connectedEdges = (workflow.edges || []).filter((edge) => edge.source_node === nodeId || edge.target_node === nodeId);
    if (connectedEdges.length > 0 && args.remove_edges === false) {
      return { ok: false, error: `node has ${connectedEdges.length} connected edges; set remove_edges=true` };
    }
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow,
      operation: "remove_workflow_node",
      reason: this.getWorkflowEditReason(args, `remove node ${nodeId}`),
      actor: "agent",
    });
    delete workflow.nodes[nodeId];
    workflow.edges = (workflow.edges || []).filter((edge) => edge.source_node !== nodeId && edge.target_node !== nodeId);
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(workflow, actions, version, {
      removed_node_id: nodeId,
      removed_edge_count: connectedEdges.length,
    });
  }

  private async connectAgentWorkflowNodes(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const workflow = workflowId ? state.workflows?.[workflowId] : null;
    if (!workflow) {
      return { ok: false, error: `workflow not found: ${workflowId}` };
    }
    const { nodes, edges } = this.normalizeWorkflowShape(workflow);
    const sourceNode = this.normalizeWorkflowNodeId(args.source_node);
    const targetNode = this.normalizeWorkflowNodeId(args.target_node);
    if (!sourceNode || !nodes[sourceNode]) {
      return { ok: false, error: `source node not found: ${sourceNode}` };
    }
    if (!targetNode || !nodes[targetNode]) {
      return { ok: false, error: `target node not found: ${targetNode}` };
    }
    const sourceOutput = String(args.source_output || CONTROL_PORT_NAME).trim() || CONTROL_PORT_NAME;
    const targetInput = String(args.target_input || CONTROL_PORT_NAME).trim() || CONTROL_PORT_NAME;
    const requestedEdgeId = this.normalizeWorkflowNodeId(args.edge_id);
    const existingIndex = requestedEdgeId
      ? edges.findIndex((edge) => String(edge.id || "") === requestedEdgeId)
      : edges.findIndex(
          (edge) =>
            String(edge.source_node || "") === sourceNode &&
            String(edge.target_node || "") === targetNode &&
            String(edge.source_output || "") === sourceOutput &&
            String(edge.target_input || "") === targetInput &&
            String(edge.source_path || "") === String(args.source_path || "")
        );
    const edgeId = requestedEdgeId || (existingIndex >= 0 ? String(edges[existingIndex].id || "") : this.nextWorkflowEdgeId(workflow, sourceNode, targetNode, sourceOutput));
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow,
      operation: existingIndex >= 0 ? "update_workflow_edge" : "connect_workflow_nodes",
      reason: this.getWorkflowEditReason(args, `connect ${sourceNode} to ${targetNode}`),
      actor: "agent",
    });
    const edge: WorkflowEdge = {
      id: edgeId,
      source_node: sourceNode,
      source_output: sourceOutput,
      ...(args.source_path !== undefined ? { source_path: String(args.source_path || "") } : {}),
      target_node: targetNode,
      target_input: targetInput,
    };
    if (existingIndex >= 0) {
      edges[existingIndex] = edge;
    } else {
      edges.push(edge);
    }
    workflow.edges = edges as WorkflowEdge[];
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(workflow, actions, version, { edge });
  }

  private async removeAgentWorkflowEdge(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const workflow = workflowId ? state.workflows?.[workflowId] : null;
    if (!workflow) {
      return { ok: false, error: `workflow not found: ${workflowId}` };
    }
    const edgeId = this.normalizeWorkflowNodeId(args.edge_id);
    const sourceNode = this.normalizeWorkflowNodeId(args.source_node);
    const targetNode = this.normalizeWorkflowNodeId(args.target_node);
    const matches = (workflow.edges || []).filter((edge) => {
      if (edgeId) return edge.id === edgeId;
      if (sourceNode && edge.source_node !== sourceNode) return false;
      if (targetNode && edge.target_node !== targetNode) return false;
      return Boolean(sourceNode || targetNode);
    });
    if (matches.length === 0) {
      return { ok: false, error: "no matching workflow edge found" };
    }
    const removeIds = new Set(matches.map((edge) => edge.id));
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow,
      operation: "remove_workflow_edge",
      reason: this.getWorkflowEditReason(args, `remove ${matches.length} edge(s)`),
      actor: "agent",
    });
    workflow.edges = (workflow.edges || []).filter((edge) => !removeIds.has(edge.id));
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(workflow, actions, version, {
      removed_edge_ids: Array.from(removeIds),
    });
  }

  private async deleteAgentWorkflow(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const workflow = workflowId ? state.workflows?.[workflowId] : null;
    if (!workflow) {
      return { ok: false, error: `workflow not found: ${workflowId}` };
    }
    const version = await this.recordWorkflowVersion({
      workflowId,
      workflow,
      operation: "delete_workflow",
      reason: this.getWorkflowEditReason(args, `delete workflow ${workflowId}`),
      actor: "agent",
    });
    delete state.workflows[workflowId];
    await this.saveState(state);
    return this.buildAgentWorkflowEditResult(null, actions, version, { workflow_id: workflowId });
  }

  private async listAgentWorkflowVersions(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    if (!workflowId) {
      return { ok: false, error: "workflow_id is required" };
    }
    const limit = Math.max(1, Math.min(80, Math.trunc(Number(args.limit) || 20)));
    const versions = await this.loadWorkflowVersions(workflowId);
    return {
      ok: true,
      workflow_id: workflowId,
      versions: versions.slice(0, limit).map((version) => this.publicWorkflowVersion(version)),
      total: versions.length,
    };
  }

  private async readAgentWorkflowVersion(
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const workflowId = this.normalizeWorkflowId(args.workflow_id || args.id);
    const versions = await this.loadWorkflowVersions(workflowId);
    const version = this.findWorkflowVersion(versions, args.version_id);
    if (!version) {
      return { ok: false, error: `workflow version not found: ${String(args.version_id || "")}` };
    }
    return {
      ok: true,
      version: this.publicWorkflowVersion(version),
      snapshot: version.snapshot ? this.readAgentWorkflow(version.snapshot, actions, args.include_analysis === true).workflow : null,
      ...(version.snapshot && args.include_analysis === true ? { analysis: this.analyzeAgentWorkflow(version.snapshot, actions) } : {}),
    };
  }

  private async rollbackAgentWorkflow(
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result = await this.rollbackWorkflowToVersion({
      workflowId: String(args.workflow_id || args.id || ""),
      versionId: String(args.version_id || ""),
      reason: this.getWorkflowEditReason(args, `rollback workflow to ${String(args.version_id || "")}`),
      actor: "agent",
    });
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return this.buildAgentWorkflowEditResult(result.workflow || null, actions, result.version as WorkflowVersionEntry, {
      rolled_back_to: String(args.version_id || ""),
    });
  }

  private publicAgentSkillPack(pack: Record<string, unknown>, includeFiles = false): Record<string, unknown> {
    const files = Array.isArray(pack.files) ? pack.files : [];
    return {
      key: pack.key,
      label: pack.label,
      category: pack.category,
      description: pack.description,
      custom: pack.custom === true,
      source: pack.source,
      tool_count: pack.tool_count,
      tool_ids: Array.isArray(pack.tool_ids) ? pack.tool_ids : [],
      filename: pack.filename,
      created_at: pack.created_at,
      updated_at: pack.updated_at,
      ...(includeFiles
        ? {
            content_md: pack.content_md,
            files,
            tools: Array.isArray(pack.tools) ? pack.tools : [],
          }
        : {
            file_count: files.length,
          }),
    };
  }

  private async listAgentSkillPacks(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const custom = await this.loadCustomSkillPacks();
    const packs = this.buildSkillPacks(actions, custom, state) as Array<Record<string, unknown>>;
    const query = String(args.query || "").trim().toLowerCase();
    const includeGenerated = args.include_generated !== false;
    const filtered = packs
      .filter((pack) => includeGenerated || pack.custom === true)
      .filter((pack) => {
        if (!query) return true;
        return [pack.key, pack.label, pack.category, pack.description, ...(Array.isArray(pack.tool_ids) ? pack.tool_ids : [])]
          .join("\n")
          .toLowerCase()
          .includes(query);
      })
      .map((pack) => this.publicAgentSkillPack(pack));
    return { ok: true, skill_packs: filtered, total: filtered.length };
  }

  private async readAgentSkillPack(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const key = this.normalizeSkillPackKey(args.key);
    const custom = await this.loadCustomSkillPacks();
    const packs = this.buildSkillPacks(actions, custom, state) as Array<Record<string, unknown>>;
    const pack = packs.find((entry) => this.normalizeSkillPackKey(entry.key) === key);
    if (!pack) {
      return { ok: false, error: `skill pack not found: ${String(args.key || "")}` };
    }
    return { ok: true, skill_pack: this.publicAgentSkillPack(pack, true) };
  }

  private async upsertAgentSkillPack(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const actionIds = new Set(actions.map((action) => action.id));
    const generatedKeys = new Set(this.buildGeneratedSkillPacks(actions, state).map((pack) => this.normalizeSkillPackKey(pack.key)));
    const key = this.normalizeSkillPackKey(args.key || args.id || args.name || args.label);
    if (!key) {
      return { ok: false, error: "skill key is required" };
    }
    if (generatedKeys.has(key)) {
      return { ok: false, error: `generated skill pack is read-only: ${key}` };
    }
    const custom = await this.loadCustomSkillPacks();
    const normalized = this.normalizeCustomSkillPack({ ...args, key }, custom[key], actionIds, generatedKeys);
    if (normalized.error || !normalized.pack) {
      return { ok: false, error: normalized.error || "invalid skill pack", details: normalized.details };
    }
    custom[normalized.pack.key] = normalized.pack;
    await this.saveCustomSkillPacks(custom);
    const packs = this.buildSkillPacks(actions, custom, state) as Array<Record<string, unknown>>;
    const pack = packs.find((entry) => this.normalizeSkillPackKey(entry.key) === normalized.pack?.key);
    return {
      ok: true,
      skill_pack: pack ? this.publicAgentSkillPack(pack, true) : normalized.pack,
      reason: String(args.reason || "").slice(0, 240),
    };
  }

  private async upsertAgentSkillFile(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const key = this.normalizeSkillPackKey(args.key);
    const custom = await this.loadCustomSkillPacks();
    const pack = custom[key];
    if (!pack) {
      return { ok: false, error: `uploaded skill pack not found: ${key}` };
    }
    const path = this.normalizeCustomSkillFilePath(key, args.path);
    if (!path) {
      return { ok: false, error: "skill file path is invalid" };
    }
    const content = String(args.content_md ?? args.markdown ?? args.content ?? "");
    if (content.length > 256 * 1024) {
      return { ok: false, error: "skill file is too large; maximum is 256KB" };
    }
    const now = Date.now();
    const files = this.ensureRootCustomSkillFile(key, pack.files || [], pack.content_md || "", now);
    const existingIndex = files.findIndex((file) => file.path === path);
    const nextFile: CustomSkillFile = {
      ...(existingIndex >= 0 ? files[existingIndex] : {}),
      path,
      content_md: content,
      content_type: "text/markdown",
      kind: typeof args.kind === "string" ? args.kind : path.endsWith("/SKILL.md") ? "root" : "reference",
      title: typeof args.title === "string" ? args.title : undefined,
      category: typeof args.category === "string" ? args.category : pack.category,
      tool_id: typeof args.tool_id === "string" ? args.tool_id : undefined,
      created_at: existingIndex >= 0 ? files[existingIndex].created_at : now,
      updated_at: now,
    };
    if (existingIndex >= 0) {
      files[existingIndex] = nextFile;
    } else {
      files.push(nextFile);
    }
    const actionIds = new Set(actions.map((action) => action.id));
    if (nextFile.tool_id && actionIds.has(nextFile.tool_id) && !pack.tool_ids.includes(nextFile.tool_id)) {
      pack.tool_ids = [...pack.tool_ids, nextFile.tool_id];
    }
    pack.files = this.ensureRootCustomSkillFile(key, files, pack.content_md || content, now);
    if (path === `custom/${key}/SKILL.md`) {
      pack.content_md = content;
    }
    pack.updated_at = now;
    custom[key] = pack;
    await this.saveCustomSkillPacks(custom);
    const packs = this.buildSkillPacks(actions, custom, state) as Array<Record<string, unknown>>;
    const builtPack = packs.find((entry) => this.normalizeSkillPackKey(entry.key) === key);
    return {
      ok: true,
      file: nextFile,
      skill_pack: builtPack ? this.publicAgentSkillPack(builtPack, true) : pack,
      reason: String(args.reason || "").slice(0, 240),
    };
  }

  private async removeAgentSkillFile(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const key = this.normalizeSkillPackKey(args.key);
    const custom = await this.loadCustomSkillPacks();
    const pack = custom[key];
    if (!pack) {
      return { ok: false, error: `uploaded skill pack not found: ${key}` };
    }
    const path = this.normalizeCustomSkillFilePath(key, args.path);
    if (!path) {
      return { ok: false, error: "skill file path is invalid" };
    }
    if (path === `custom/${key}/SKILL.md`) {
      return { ok: false, error: "root SKILL.md cannot be removed; update it instead" };
    }
    const before = pack.files || [];
    const files = before.filter((file) => file.path !== path);
    if (files.length === before.length) {
      return { ok: false, error: `skill file not found: ${path}` };
    }
    pack.files = this.ensureRootCustomSkillFile(key, files, pack.content_md || "", Date.now());
    pack.updated_at = Date.now();
    custom[key] = pack;
    await this.saveCustomSkillPacks(custom);
    const packs = this.buildSkillPacks(actions, custom, state) as Array<Record<string, unknown>>;
    const builtPack = packs.find((entry) => this.normalizeSkillPackKey(entry.key) === key);
    return {
      ok: true,
      removed_path: path,
      skill_pack: builtPack ? this.publicAgentSkillPack(builtPack, true) : pack,
      reason: String(args.reason || "").slice(0, 240),
    };
  }

  private async deleteAgentSkillPack(
    state: ButtonsModel,
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const key = this.normalizeSkillPackKey(args.key);
    const generatedKeys = new Set(this.buildGeneratedSkillPacks(actions, state).map((pack) => this.normalizeSkillPackKey(pack.key)));
    if (!key) {
      return { ok: false, error: "skill key is required" };
    }
    if (generatedKeys.has(key)) {
      return { ok: false, error: `generated skill pack cannot be deleted: ${key}` };
    }
    const custom = await this.loadCustomSkillPacks();
    if (!custom[key]) {
      return { ok: false, error: `uploaded skill pack not found: ${key}` };
    }
    delete custom[key];
    await this.saveCustomSkillPacks(custom);
    return { ok: true, deleted_key: key, reason: String(args.reason || "").slice(0, 240) };
  }

  private buildAgentUserPrompt(
    message: string,
    history: AgentChatMessage[],
    toolResults: Array<Record<string, unknown>>
  ): string {
    return [
      "# Recent Conversation",
      "",
      history.length
        ? history.map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`).join("\n\n")
        : "No previous messages.",
      "",
      "# Current User Message",
      "",
      message,
      "",
      "# Tool Results So Far",
      "",
      toolResults.length ? this.truncateAgentText(toolResults, 20000) : "No tool calls yet.",
      "",
      "Return strict JSON now. If enough information is available, return type=final. If one tool is needed, return type=tool.",
    ].join("\n");
  }

  private sanitizeAgentErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return this.truncateAgentText(
      raw.replace(/(bearer\s+)[^\s"'<>]+/gi, "$1[redacted]")
        .replace(/([?&](?:token|api[_-]?key|secret|password)=)[^&\s]+/gi, "$1[redacted]")
        .replace(/((?:token|api[_-]?key|secret|password|authorization)\s*[:=]\s*)[^\s"',}]+/gi, "$1[redacted]"),
      2000
    );
  }

  private isRetryableAgentToolError(errorMessage: string): boolean {
    const text = String(errorMessage || "").toLowerCase();
    if (!text) {
      return true;
    }
    if (
      /(disabled|blocked|forbidden|unauthorized|permission|not configured|missing bot token|missing api|invalid api key|quota|billing)/i.test(
        text
      )
    ) {
      return false;
    }
    return true;
  }

  private agentToolExceptionResult(toolCall: AgentToolCall, error: unknown): Record<string, unknown> {
    const errorMessage = this.sanitizeAgentErrorMessage(error);
    const retryable = this.isRetryableAgentToolError(errorMessage);
    return {
      ok: false,
      tool_error: true,
      retryable,
      tool: String(toolCall.name || "unknown_tool"),
      error: errorMessage || "tool execution failed",
      error_type: error instanceof Error && error.name ? error.name : "ToolExecutionError",
      hint: retryable
        ? "Review the tool arguments and previous tool results, then retry with corrected inputs or gather missing context first."
        : "Do not retry the same call blindly. Explain the blocked/missing configuration to the user or choose a different tool.",
    };
  }

  private async executeAgentToolSafely(
    toolCall: AgentToolCall,
    context: AgentToolExecutionContext
  ): Promise<Record<string, unknown>> {
    try {
      return await this.executeAgentTool(toolCall, context);
    } catch (error) {
      console.error("agent tool execution failed:", toolCall.name, this.sanitizeAgentErrorMessage(error));
      return this.agentToolExceptionResult(toolCall, error);
    }
  }

  private async executeAgentTool(
    toolCall: AgentToolCall,
    context: AgentToolExecutionContext
  ): Promise<Record<string, unknown>> {
    const name = String(toolCall.name || "").trim();
    const args = toolCall.arguments || {};
    const now = Date.now();
    if (!name) {
      return { ok: false, error: "missing tool name" };
    }

    if (context.mcpTools.has(name)) {
      if (!context.enabledSkillKeys.has("mcp-tools")) {
        return { ok: false, blocked: true, error: "MCP tools are disabled by skill settings" };
      }
      return await this.callMcpRuntimeTool(context.mcpTools.get(name) as McpRuntimeTool, args);
    }

    if (name === "list_agent_docs") {
      return {
        ok: true,
        docs: Object.values(context.config.docs).map((doc) => ({
          key: doc.key,
          filename: doc.filename,
          label: doc.label,
          description: doc.description,
          chars: doc.content_md.length,
          updated_at: doc.updated_at,
        })),
      };
    }

    if (name === "read_agent_doc") {
      const key = this.normalizeAgentDocKey(args.key);
      const doc = context.config.docs[key];
      return doc ? { ok: true, doc } : { ok: false, error: `agent doc not found: ${key}` };
    }

    if (name === "write_agent_doc") {
      const key = this.normalizeAgentDocKey(args.key);
      if (!key) {
        return { ok: false, error: "doc key is required" };
      }
      const fallback = context.config.docs[key];
      const doc = this.normalizeAgentDocument(key, args, fallback, now);
      if (!doc || !doc.content_md.trim()) {
        return { ok: false, error: "content_md is required" };
      }
      context.config.docs[doc.key] = doc;
      context.config.updated_at = now;
      await this.saveAgentConfig(context.config);
      return { ok: true, doc };
    }

    if (name === "append_agent_doc") {
      const key = this.normalizeAgentDocKey(args.key);
      const doc = context.config.docs[key];
      if (!doc) {
        return { ok: false, error: `agent doc not found: ${key}` };
      }
      const text = String(args.text || args.content_md || args.content || "").trim();
      if (!text) {
        return { ok: false, error: "append text is required" };
      }
      const heading = String(args.heading || new Date(now).toISOString()).trim();
      const nextDoc: AgentDocument = {
        ...doc,
        content_md: `${doc.content_md.trim()}\n\n## ${heading}\n\n${text}`.slice(0, 256 * 1024),
        updated_at: now,
      };
      context.config.docs[key] = nextDoc;
      context.config.updated_at = now;
      await this.saveAgentConfig(context.config);
      return { ok: true, doc: nextDoc };
    }

    if (name === "vfs_list") {
      return this.listSkillVfs(context.skillFiles, args.path || "skills://", {
        recursive: args.recursive === true,
        depth: Number(args.depth || 1),
      });
    }

    if (name === "vfs_read") {
      return this.readSkillVfsFile(context.skillFiles, args.path, 40000);
    }

    if (name === "vfs_search") {
      return this.searchSkillVfsFiles(context.skillFiles, {
        query: args.query,
        path: args.path || args.root,
        limit: args.limit,
      });
    }

    if (name === "list_skill_files") {
      const category = String(args.category || "").trim().toLowerCase();
      const query = String(args.query || "").trim().toLowerCase();
      const files = context.skillFiles
        .filter((file) => !category || String(file.category || "").toLowerCase() === category || file.path.includes(`/${category}/`))
        .filter((file) => {
          if (!query) return true;
          return [file.path, file.title || "", file.category || "", file.tool_id || ""].join("\n").toLowerCase().includes(query);
        })
        .map((file) => ({
          path: this.skillRelativeToVfsPath(file.path),
          kind: file.kind,
          title: file.title,
          category: file.category,
          tool_id: file.tool_id,
          source: file.source,
          skill_key: file.skill_key,
        }))
        .slice(0, 240);
      return { ok: true, files };
    }

    if (name === "read_skill_file") {
      return this.readSkillVfsFile(context.skillFiles, args.path, 20000);
    }

    if (name === "search_skill_files") {
      return this.searchSkillVfsFiles(context.skillFiles, {
        query: args.query,
        limit: Math.min(24, Number(args.limit || 8)),
      });
    }

    if (["list_workflows", "search_workflows", "read_workflow", "analyze_workflow"].includes(name)) {
      if (!this.isAgentWorkflowSkillEnabled(context.enabledSkillKeys)) {
        return {
          ok: false,
          blocked: true,
          error: "workflow tools are disabled by skill settings",
        };
      }
      if (name === "list_workflows") {
        return this.listAgentWorkflows(context.state, context.actions, args);
      }
      if (name === "search_workflows") {
        return this.searchAgentWorkflows(context.state, context.actions, args);
      }
      const workflowId = args.workflow_id || args.id;
      const workflow = this.findAgentWorkflow(context.state, workflowId);
      if (!workflow) {
        return { ok: false, error: `workflow not found: ${String(workflowId || "")}` };
      }
      if (name === "read_workflow") {
        return this.readAgentWorkflow(workflow, context.actions, args.include_analysis === true);
      }
      return this.analyzeAgentWorkflow(workflow, context.actions);
    }

    if (
      [
        "create_workflow",
        "update_workflow_meta",
        "upsert_workflow_node",
        "remove_workflow_node",
        "connect_workflow_nodes",
        "remove_workflow_edge",
        "delete_workflow",
        "list_workflow_versions",
        "read_workflow_version",
        "rollback_workflow",
      ].includes(name)
    ) {
      if (!this.isAgentWorkflowEditorSkillEnabled(context.enabledSkillKeys)) {
        return {
          ok: false,
          blocked: true,
          error: "workflow editor tools are disabled by skill settings",
        };
      }
      if (name === "create_workflow") {
        return await this.createAgentWorkflow(context.state, context.actions, args);
      }
      if (name === "update_workflow_meta") {
        return await this.updateAgentWorkflowMeta(context.state, context.actions, args);
      }
      if (name === "upsert_workflow_node") {
        return await this.upsertAgentWorkflowNode(context.state, context.actions, args);
      }
      if (name === "remove_workflow_node") {
        return await this.removeAgentWorkflowNode(context.state, context.actions, args);
      }
      if (name === "connect_workflow_nodes") {
        return await this.connectAgentWorkflowNodes(context.state, context.actions, args);
      }
      if (name === "remove_workflow_edge") {
        return await this.removeAgentWorkflowEdge(context.state, context.actions, args);
      }
      if (name === "delete_workflow") {
        return await this.deleteAgentWorkflow(context.state, context.actions, args);
      }
      if (name === "list_workflow_versions") {
        return await this.listAgentWorkflowVersions(args);
      }
      if (name === "read_workflow_version") {
        return await this.readAgentWorkflowVersion(context.actions, args);
      }
      return await this.rollbackAgentWorkflow(context.actions, args);
    }

    if (
      [
        "list_skill_packs",
        "read_skill_pack",
        "upsert_skill_pack",
        "upsert_skill_file",
        "remove_skill_file",
        "delete_skill_pack",
      ].includes(name)
    ) {
      if (!this.isAgentSkillEditorSkillEnabled(context.enabledSkillKeys)) {
        return {
          ok: false,
          blocked: true,
          error: "skill editor tools are disabled by skill settings",
        };
      }
      if (name === "list_skill_packs") {
        return await this.listAgentSkillPacks(context.state, context.actions, args);
      }
      if (name === "read_skill_pack") {
        return await this.readAgentSkillPack(context.state, context.actions, args);
      }
      if (name === "upsert_skill_pack") {
        return await this.upsertAgentSkillPack(context.state, context.actions, args);
      }
      if (name === "upsert_skill_file") {
        return await this.upsertAgentSkillFile(context.state, context.actions, args);
      }
      if (name === "remove_skill_file") {
        return await this.removeAgentSkillFile(context.state, context.actions, args);
      }
      return await this.deleteAgentSkillPack(context.state, context.actions, args);
    }

    if (name === "run_node" || name === "run_node_preview") {
      const preview = name === "run_node_preview";
      if (!preview && context.config.allow_node_execution !== true) {
        return {
          ok: false,
          blocked: true,
          error: "real node execution is disabled by the Skills page switch",
        };
      }
      const actionId = String(args.action_id || args.tool_id || "").trim();
      const action = context.actions.find((item) => item.id === actionId);
      if (!action) {
        return { ok: false, error: `node action not found: ${actionId}` };
      }
      if (!context.allowedNodeToolIds.has(actionId)) {
        return {
          ok: false,
          blocked: true,
          error: `node tool is disabled by skill settings: ${actionId}`,
        };
      }
      const params =
        args.params && typeof args.params === "object" && !Array.isArray(args.params)
          ? (args.params as Record<string, unknown>)
          : {};
      const runtimeOverride =
        args.runtime && typeof args.runtime === "object" && !Array.isArray(args.runtime)
          ? (args.runtime as Record<string, unknown>)
          : {};
      const runtimePayload = this.mergeAgentRuntimePayload(context.runtimePayload || {}, runtimeOverride);
      const runtime = buildRuntimeContext(runtimePayload, null);
      const result = await executeActionPreview({
        env: await this.getExecutionEnv(),
        state: context.state,
        action: {
          id: actionId,
          kind: "modular",
          config: this.applyAgentRuntimeInputDefaults(
            action,
            renderStructure(params, {
              action: { id: actionId, kind: "modular", config: params },
              button:
                args.button && typeof args.button === "object" && !Array.isArray(args.button)
                  ? (args.button as Record<string, unknown>)
                  : {},
              menu:
                args.menu && typeof args.menu === "object" && !Array.isArray(args.menu)
                  ? (args.menu as Record<string, unknown>)
                  : {},
              runtime,
              variables: runtime.variables || {},
              nodes: {},
            }) as Record<string, unknown>,
            runtime
          ),
        },
        button:
          args.button && typeof args.button === "object" && !Array.isArray(args.button)
            ? (args.button as Record<string, unknown>)
            : {},
        menu:
          args.menu && typeof args.menu === "object" && !Array.isArray(args.menu)
            ? (args.menu as Record<string, unknown>)
            : {},
        runtime,
        preview,
      });
      const nodeOk = result.success !== false;
      return {
        ok: nodeOk,
        preview,
        action_id: actionId,
        retryable: !nodeOk,
        error: nodeOk ? undefined : result.error || "node execution failed",
        result,
      };
    }

    return { ok: false, error: `unknown agent tool: ${name}` };
  }

  private async handleAgentChat(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }

    const message = String(payload.message || "").trim();
    if (!message) {
      return jsonResponse({ error: "message is required" }, 400);
    }

    const config = await this.loadAgentConfig();
    const modelId = String(payload.model_id || config.default_model_id || "").trim();
    const state = await this.loadState();
    const actions = await this.buildModularActionList(state);
    const customSkillPacks = await this.loadCustomSkillPacks().catch(() => ({}));
    const allSkillPacks = this.buildSkillPacks(actions, customSkillPacks, state) as Array<Record<string, unknown>>;
    const skillPacks = this.filterAgentSkillPacks(config, allSkillPacks);
    const skillFiles = this.collectAgentSkillFiles(skillPacks);
    const allowedNodeToolIds = this.collectAgentSkillToolIds(skillPacks);
    const enabledSkillKeys = this.collectAgentSkillPackKeys(skillPacks);
    const mcpRuntime = this.buildMcpRuntimeTools(await this.loadMcpConfig());
    const history = this.normalizeAgentChatHistory(payload.history);
    const runtimePayload = this.normalizeAgentRuntimePayload(payload.runtime_context || payload.runtime);
    const sessionId = this.normalizeAgentSessionId(payload.session_id);
    const maxSteps = this.clampAgentToolRounds(config.max_tool_rounds, 5);
    const toolResults: Array<Record<string, unknown>> = [];
    const transcript: Array<Record<string, unknown>> = [];
    const systemPrompt = this.buildAgentSystemPrompt(config, skillFiles, runtimePayload);
    const tools = this.buildAgentToolDefinitions(config, enabledSkillKeys, mcpRuntime.definitions);
    const preparedContext = await this.prepareAgentContext({
      config,
      modelId,
      sessionId,
      history,
      message,
      runtimePayload,
      systemPrompt,
      tools,
    });
    const messages: LlmNativeChatMessage[] = [...preparedContext.messages];

    try {
      for (let step = 0; step < maxSteps; step += 1) {
        const result = await callConfiguredLlmToolChat(await this.getExecutionEnv(), {
          modelId,
          systemPrompt,
          messages,
          tools,
          temperature: Number(payload.temperature ?? 0.2),
          maxTokens: Number(payload.max_tokens ?? 1600),
        });
        transcript.push({
          step,
          model: result.model,
          provider_id: result.provider_id,
          provider_type: result.provider_type,
          finish_reason: result.finish_reason,
          message: result.text,
          tool_calls: result.tool_calls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          })),
        });

        if (result.tool_calls.length === 0) {
          const answer = String(result.text || "").trim();
          const responseHistory = this.buildAgentResponseHistory(preparedContext.retainedHistory, message, answer);
          await this.saveAgentSessionAfterChat({
            sessionId,
            retainedHistory: preparedContext.retainedHistory,
            contextMeta: preparedContext.meta,
            toolResults,
            userMessage: message,
            assistantMessage: answer,
          });
          return jsonResponse({
            status: "ok",
            message: answer,
            model: result.model,
            provider_id: result.provider_id,
            provider_type: result.provider_type,
            usage: result.usage,
            steps: transcript,
            tool_results: toolResults,
            history: responseHistory,
            context: preparedContext.meta,
            config: this.publicAgentConfig(await this.loadAgentConfig()),
          });
        }

        messages.push(result.assistant_message);
        for (const toolCall of result.tool_calls) {
          const toolResult = await this.executeAgentToolSafely(toolCall, {
            config,
            skillFiles,
            allowedNodeToolIds,
            enabledSkillKeys,
            mcpTools: mcpRuntime.tools,
            runtimePayload,
            state,
            actions,
          });
          toolResults.push({
            tool_call_id: toolCall.id,
            tool: toolCall.name,
            arguments: toolCall.arguments || {},
            result: toolResult,
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(toolResult),
          });
        }
      }

      const limitMessage = "Agent stopped after reaching the tool-step limit. Please ask it to continue.";
      const responseHistory = this.buildAgentResponseHistory(preparedContext.retainedHistory, message, limitMessage);
      await this.saveAgentSessionAfterChat({
        sessionId,
        retainedHistory: preparedContext.retainedHistory,
        contextMeta: preparedContext.meta,
        toolResults,
        userMessage: message,
        assistantMessage: limitMessage,
      });
      return jsonResponse({
        status: "ok",
        message: limitMessage,
        steps: transcript,
        tool_results: toolResults,
        history: responseHistory,
        context: preparedContext.meta,
        config: this.publicAgentConfig(await this.loadAgentConfig()),
      });
    } catch (error) {
      return jsonResponse(
        {
          error: `agent chat failed: ${String(error)}`,
          steps: transcript,
          tool_results: toolResults,
          context: preparedContext.meta,
        },
        500
      );
    }
  }

  private agentTelegramHistoryKey(chatId: string, userId: string): string {
    return `agent:telegram:history:${chatId}:${userId || "anonymous"}`;
  }

  private agentTelegramSessionId(chatId: string, userId: string): string {
    return this.normalizeAgentSessionId(`telegram:${chatId}:${userId || "anonymous"}`);
  }

  private async loadAgentTelegramHistory(chatId: string, userId: string): Promise<AgentChatMessage[]> {
    const stored = await this.state.storage.get<AgentChatMessage[]>(this.agentTelegramHistoryKey(chatId, userId));
    return this.normalizeAgentChatHistory(stored);
  }

  private async saveAgentTelegramHistory(chatId: string, userId: string, history: AgentChatMessage[]): Promise<void> {
    await this.state.storage.put(this.agentTelegramHistoryKey(chatId, userId), this.normalizeAgentChatHistory(history));
  }

  private async clearAgentTelegramHistory(chatId: string, userId: string): Promise<void> {
    await this.state.storage.delete(this.agentTelegramHistoryKey(chatId, userId));
    await this.clearAgentSessionContext(this.agentTelegramSessionId(chatId, userId));
  }

  private async startTelegramTypingIndicator(chatId: string): Promise<{ stop: () => void }> {
    let stopped = false;
    const send = async () => {
      if (stopped || !chatId) {
        return;
      }
      try {
        await this.sendChatAction(chatId, "typing");
      } catch (error) {
        console.error("send typing action failed:", error);
      }
    };
    await send();
    const interval = setInterval(() => {
      void send();
    }, 4000);
    return {
      stop: () => {
        stopped = true;
        clearInterval(interval);
      },
    };
  }

  private extractTelegramAgentCommand(trimmed: string): string | null {
    if (!trimmed.startsWith("/")) {
      return null;
    }
    const firstToken = trimmed.split(/\s+/, 1)[0];
    const baseCommand = normalizeTelegramCommandName(firstToken);
    if (baseCommand !== "agent") {
      return null;
    }
    return trimmed.slice(firstToken.length).trim();
  }

  private extractTelegramAgentPrefix(trimmed: string, config: AgentConfig): string | null {
    const prefix = this.normalizeTelegramAgentPrefix(config.telegram_prefix_trigger, "");
    if (!prefix || !trimmed.startsWith(prefix)) {
      return null;
    }
    return trimmed.slice(prefix.length).trim();
  }

  private buildTelegramAgentRuntimePayload(args: {
    chatId: string;
    chatType: string;
    userId: string;
    username: string;
    fullName: string;
    messageId?: number;
    text: string;
    timestamp?: number;
    entry: AgentTelegramEntry;
  }): Record<string, unknown> {
    return this.normalizeAgentRuntimePayload({
      chat_id: args.chatId,
      chat_type: args.chatType,
      user_id: args.userId,
      username: args.username,
      full_name: args.fullName,
      message_id: args.messageId,
      variables: {
        agent_entry: args.entry,
        message_text: args.text,
        timestamp: args.timestamp,
      },
    });
  }

  private async handleTelegramAgentMessage(args: {
    chatId: string;
    chatType: string;
    userId: string;
    username: string;
    fullName: string;
    messageId?: number;
    timestamp?: number;
    text: string;
    entry: AgentTelegramEntry;
  }): Promise<boolean> {
    const config = await this.loadAgentConfig();
    if (config.enabled !== true) {
      if (args.entry === "command" || args.entry === "prefix") {
        await this.sendText(args.chatId, "Agent 未启用。请先在 WebUI 的 Agent 页面开启。", undefined);
        return true;
      }
      return false;
    }
    if (args.entry === "command" && config.telegram_command_enabled !== true) {
      return false;
    }
    if (args.entry === "private" && config.telegram_private_chat_enabled !== true) {
      return false;
    }
    if (args.entry === "prefix" && !this.normalizeTelegramAgentPrefix(config.telegram_prefix_trigger, "")) {
      return false;
    }

    const prompt = String(args.text || "").trim();
    if (!prompt) {
      const prefix = this.normalizeTelegramAgentPrefix(config.telegram_prefix_trigger, "*") || "*";
      const example =
        args.entry === "prefix"
          ? `请在 ${prefix} 后输入要对 Agent 说的话，例如：${prefix} 帮我总结当前任务`
          : "请在 /agent 后输入要对 Agent 说的话，例如：/agent 帮我总结当前任务";
      await this.sendText(args.chatId, example, undefined);
      return true;
    }
    if (/^(clear|reset|清空|重置)$/i.test(prompt)) {
      await this.clearAgentTelegramHistory(args.chatId, args.userId);
      await this.sendText(args.chatId, "已清空当前 Telegram 会话的 Agent 上下文。", undefined);
      return true;
    }

    const history = await this.loadAgentTelegramHistory(args.chatId, args.userId);
    const runtimeContext = this.buildTelegramAgentRuntimePayload({ ...args, text: prompt });
    const sessionId = this.agentTelegramSessionId(args.chatId, args.userId);
    const typing = await this.startTelegramTypingIndicator(args.chatId);
    let response: Response;
    let data: Record<string, unknown>;
    try {
      response = await this.handleAgentChat(
        new Request("https://internal.local/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: prompt,
            history,
            session_id: sessionId,
            runtime_context: runtimeContext,
            model_id: config.default_model_id || "",
          }),
        })
      );
      data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    } finally {
      typing.stop();
    }
    if (!response.ok || data.error) {
      await this.sendText(args.chatId, `Agent 执行失败: ${String(data.error || response.status)}`, undefined);
      return true;
    }

    const answer = String(data.message || "").trim() || "Agent 已完成，但没有返回文本。";
    const returnedHistory = this.normalizeAgentChatHistory(data.history);
    await this.saveAgentTelegramHistory(
      args.chatId,
      args.userId,
      returnedHistory.length
        ? returnedHistory
        : [
            ...history,
            { role: "user", content: prompt },
            { role: "assistant", content: this.truncateAgentText(answer, 2000) },
          ]
    );
    await this.sendText(args.chatId, answer.slice(0, 4096), undefined);
    return true;
  }

  private publicLlmConfig(config: LlmConfig) {
    const providers = Object.fromEntries(
      Object.entries(config.providers).map(([id, provider]) => [
        id,
        {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          base_url: provider.base_url,
          api_key: "",
          enabled: provider.enabled,
          has_api_key: Boolean(String(provider.api_key || "").trim()),
          created_at: provider.created_at || null,
          updated_at: provider.updated_at || null,
        },
      ])
    );
    return {
      providers,
      models: config.models,
      provider_types: LLM_PROVIDER_TYPES,
      default_base_urls: {
        openai: defaultBaseUrlForProvider("openai"),
        gemini: defaultBaseUrlForProvider("gemini"),
      },
    };
  }

  private async getExecutionEnv(): Promise<Record<string, unknown>> {
    const env = await this.getTelegramEnv();
    const llmConfig = await this.loadLlmConfig();
    return { ...env, [LLM_CONFIG_ENV_KEY]: llmConfig };
  }

  private async handleLlmProviderUpsert(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }

    const config = await this.loadLlmConfig();
    const id = String(payload.id || "").trim() || generateId("llm");
    const existing = config.providers[id];
    const type = this.normalizeLlmProviderType(payload.type || existing?.type);
    const now = Date.now();
    const name = String(payload.name || existing?.name || `${type} provider`).trim();
    const rawBaseUrl = typeof payload.base_url === "string" ? payload.base_url.trim() : "";
    const baseUrl =
      rawBaseUrl || (existing && existing.type === type ? existing.base_url : defaultBaseUrlForProvider(type));
    const apiKeyInput = typeof payload.api_key === "string" ? payload.api_key.trim() : "";

    config.providers[id] = {
      id,
      name: name || id,
      type,
      base_url: baseUrl,
      api_key: apiKeyInput || existing?.api_key || "",
      enabled: payload.enabled !== false,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await this.saveLlmConfig(config);
    return jsonResponse({ status: "ok", provider_id: id, config: this.publicLlmConfig(config) });
  }

  private async handleLlmProviderDelete(providerId: string): Promise<Response> {
    const config = await this.loadLlmConfig();
    if (!config.providers[providerId]) {
      return jsonResponse({ error: `provider not found: ${providerId}` }, 404);
    }
    delete config.providers[providerId];
    for (const [modelId, model] of Object.entries(config.models)) {
      if (model.provider_id === providerId) {
        delete config.models[modelId];
      }
    }
    await this.saveLlmConfig(config);
    return jsonResponse({ status: "ok", deleted_id: providerId, config: this.publicLlmConfig(config) });
  }

  private async handleLlmProviderFetchModels(providerId: string): Promise<Response> {
    const config = await this.loadLlmConfig();
    const provider = config.providers[providerId];
    if (!provider) {
      return jsonResponse({ error: `provider not found: ${providerId}` }, 404);
    }
    try {
      const remoteModels = await listProviderModels(provider);
      const now = Date.now();
      const fetchedModels = remoteModels.map((remoteModel) => {
        const id = this.buildLlmModelId(providerId, remoteModel.model);
        const existing = config.models[id];
        const model: LlmModelConfig = {
          id,
          provider_id: providerId,
          model: remoteModel.model,
          name: existing?.name || remoteModel.name || remoteModel.model,
          enabled: existing?.enabled === true,
          created_at: existing?.created_at || now,
          updated_at: now,
        };
        if (model.enabled) {
          config.models[id] = model;
        }
        return model;
      });
      await this.saveLlmConfig(config);
      return jsonResponse({
        status: "ok",
        provider_id: providerId,
        fetched: remoteModels.length,
        models: fetchedModels,
        config: this.publicLlmConfig(config),
      });
    } catch (error) {
      return jsonResponse({ error: `fetch models failed: ${String(error)}` }, 500);
    }
  }

  private async handleLlmModelsUpdate(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }

    const entries = Array.isArray(payload.models) ? payload.models : [];
    const config = await this.loadLlmConfig();
    const now = Date.now();
    let updated = 0;
    for (const entry of entries) {
      const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const existingId = String(item.id || "").trim();
      const existing = existingId ? config.models[existingId] : undefined;
      const providerId = String(item.provider_id || existing?.provider_id || "").trim();
      const modelName = String(item.model || existing?.model || "").trim();
      const id = existingId || (providerId && modelName ? this.buildLlmModelId(providerId, modelName) : "");
      if (!id) {
        continue;
      }
      if (item.enabled !== true) {
        delete config.models[id];
        updated += 1;
        continue;
      }
      if (!providerId || !config.providers[providerId] || !modelName) {
        continue;
      }
      config.models[id] = {
        id,
        provider_id: providerId,
        model: modelName,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : existing?.name || modelName,
        enabled: true,
        created_at: existing?.created_at || now,
        updated_at: now,
      };
      updated += 1;
    }
    await this.saveLlmConfig(config);
    return jsonResponse({ status: "ok", updated, config: this.publicLlmConfig(config) });
  }

  private async resolveTelegramToken(): Promise<{ token: string; source: "env" | "config" | "none" }> {
    const envToken = (this.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (envToken) {
      return { token: envToken, source: "env" };
    }
    const config = await this.loadBotConfig();
    const cfgToken = (config.token || "").trim();
    if (cfgToken) {
      return { token: cfgToken, source: "config" };
    }
    return { token: "", source: "none" };
  }

  private async getTelegramEnv(): Promise<Env> {
    const resolved = await this.resolveTelegramToken();
    return { ...this.env, TELEGRAM_BOT_TOKEN: resolved.token };
  }

  private async bindTelegramWebhook(
    webhookUrl: string,
    options?: {
      drop_pending_updates?: boolean;
      secret_token?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }
  ): Promise<Record<string, unknown>> {
    const url = String(webhookUrl || "").trim();
    if (!url) {
      return { ok: true, skipped: true };
    }
    if (!url.startsWith("https://")) {
      throw new Error("webhook_url must start with https://");
    }
    const resolved = await this.resolveTelegramToken();
    if (!resolved.token) {
      throw new Error("missing bot token");
    }
    const env = await this.getTelegramEnv();
    const payload: Record<string, unknown> = { url };
    if (options) {
      if (typeof options.drop_pending_updates === "boolean") {
        payload.drop_pending_updates = options.drop_pending_updates;
      }
      if (typeof options.secret_token === "string" && options.secret_token.trim()) {
        payload.secret_token = options.secret_token.trim();
      }
      if (typeof options.max_connections === "number" && Number.isFinite(options.max_connections)) {
        payload.max_connections = options.max_connections;
      }
    }
    if (Array.isArray(options?.allowed_updates)) {
      payload.allowed_updates = normalizeWebhookAllowedUpdates(options?.allowed_updates);
    } else {
      // Always include callback_query by default, otherwise button clicks can spin forever.
      payload.allowed_updates = [...DEFAULT_WEBHOOK_ALLOWED_UPDATES];
    }
    return await callTelegram(env, "setWebhook", payload);
  }

  private normalizeBotCommands(commands: unknown): BotCommand[] {
    const rawCommands = Array.isArray(commands) ? commands : [];
    return rawCommands
      .map((cmd) => {
        const item = (cmd || {}) as Record<string, unknown>;
        const rawMode = String(item.arg_mode || "").trim();
        const argMode: CommandArgMode = ["auto", "text", "kv", "json"].includes(rawMode)
          ? (rawMode as CommandArgMode)
          : "auto";
        return {
          command: String(item.command || "").trim().replace(/^\//, ""),
          description: String(item.description || "").trim(),
          workflow_id: String(item.workflow_id || "").trim(),
          arg_mode: argMode,
          args_schema: Array.isArray(item.args_schema)
            ? item.args_schema.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
            : String(item.args_schema || "")
              .split(",")
              .map((entry: string) => entry.trim())
              .filter(Boolean),
        };
      })
      .filter((cmd) => cmd.command);
  }

  private publicBotConfig(config: BotConfig, resolved: { source: "env" | "config" | "none" }) {
    const hasStoredToken = Boolean(String(config.token || "").trim());
    return {
      token: "",
      webhook_url: config.webhook_url || "",
      webhook_secret: config.webhook_secret || "",
      commands: config.commands || [],
      token_source: resolved.source,
      env_token_set: resolved.source === "env",
      token_configured: resolved.source !== "none",
      stored_token_set: hasStoredToken,
    };
  }

  private async syncTelegramCommands(commands: BotCommand[]): Promise<Record<string, unknown>> {
    const resolved = await this.resolveTelegramToken();
    if (!resolved.token) {
      return { ok: true, skipped: true, reason: "missing bot token" };
    }
    const env = await this.getTelegramEnv();
    const payloadCommands = this.normalizeBotCommands(commands).map((cmd) => ({
      command: cmd.command,
      description: cmd.description,
    }));
    if (payloadCommands.length === 0) {
      return await callTelegram(env, "deleteMyCommands", {});
    }
    return await callTelegram(env, "setMyCommands", { commands: payloadCommands });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return jsonResponse({ status: "ok" });
    }

    if (path === "/api/health") {
      return jsonResponse({ status: "ok" });
    }

    if (path === "/internal/telegram/process" && method === "POST") {
      return await this.handleInternalTelegramProcess(request);
    }

    const token = (this.env.WEBUI_AUTH_TOKEN || "").trim();
    if (path.startsWith("/api/") && token) {
      const provided = request.headers.get("X-Auth-Token") || "";
      if (provided !== token) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
    }

    if (path === "/api/state") {
      if (method === "GET") {
        return jsonResponse(await this.loadState());
      }
      if (method === "PUT") {
        try {
          const payload = await parseJson<ButtonsModel>(request);
          await this.saveState(payload);
          return jsonResponse(payload);
        } catch (error) {
          return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
        }
      }
    }

    if (path === "/api/llm/config" && method === "GET") {
      return jsonResponse(this.publicLlmConfig(await this.loadLlmConfig()));
    }

    if (path === "/api/llm/providers" && method === "POST") {
      return await this.handleLlmProviderUpsert(request);
    }

    if (path.startsWith("/api/llm/providers/") && path.endsWith("/fetch-models") && method === "POST") {
      const rawId = path.slice("/api/llm/providers/".length, path.length - "/fetch-models".length);
      const providerId = decodeURIComponent(rawId || "");
      if (!providerId) {
        return jsonResponse({ error: "missing provider_id" }, 400);
      }
      return await this.handleLlmProviderFetchModels(providerId);
    }

    if (path.startsWith("/api/llm/providers/") && method === "DELETE") {
      const providerId = decodeURIComponent(path.slice("/api/llm/providers/".length));
      if (!providerId) {
        return jsonResponse({ error: "missing provider_id" }, 400);
      }
      return await this.handleLlmProviderDelete(providerId);
    }

    if (path === "/api/llm/models" && method === "PUT") {
      return await this.handleLlmModelsUpdate(request);
    }

    if (path === "/api/mcp/config" && method === "GET") {
      return await this.handleMcpConfigGet();
    }

    if (path === "/api/mcp/servers" && (method === "POST" || method === "PUT")) {
      return await this.handleMcpServerUpsert(request);
    }

    if (path.startsWith("/api/mcp/servers/") && path.endsWith("/fetch-tools") && method === "POST") {
      const rawId = path.slice("/api/mcp/servers/".length, path.length - "/fetch-tools".length);
      return await this.handleMcpServerFetchTools(decodeURIComponent(rawId || ""));
    }

    if (path.startsWith("/api/mcp/servers/") && method === "DELETE") {
      const serverId = decodeURIComponent(path.slice("/api/mcp/servers/".length));
      return await this.handleMcpServerDelete(serverId);
    }

    if (path === "/api/agent/config") {
      if (method === "GET") {
        return jsonResponse(this.publicAgentConfig(await this.loadAgentConfig()));
      }
      if (method === "PUT") {
        return await this.handleAgentConfigUpdate(request);
      }
    }

    if (path === "/api/agent/chat" && method === "POST") {
      return await this.handleAgentChat(request);
    }

    if (path === "/api/agent/sessions" && method === "GET") {
      return await this.handleAgentSessionsList();
    }

    if (path.startsWith("/api/agent/session/")) {
      const rawSessionPath = path.slice("/api/agent/session/".length);
      const isPromoteMemory = rawSessionPath.endsWith("/promote-memory");
      const rawSessionId = decodeURIComponent(
        isPromoteMemory ? rawSessionPath.slice(0, -"/promote-memory".length) : rawSessionPath
      );
      if (isPromoteMemory && method === "POST") {
        return await this.handleAgentSessionPromoteMemory(rawSessionId, request);
      }
      if (method === "GET") {
        return await this.handleAgentSessionGet(rawSessionId);
      }
      if (method === "DELETE") {
        return await this.clearAgentSessionById(rawSessionId);
      }
    }

    if (path.startsWith("/api/agent/doc/")) {
      const rawDocPath = path.slice("/api/agent/doc/".length);
      const isAppend = rawDocPath.endsWith("/append");
      const rawKey = decodeURIComponent(isAppend ? rawDocPath.slice(0, -"/append".length) : rawDocPath);
      if (isAppend && method === "POST") {
        return await this.handleAgentDocAppend(rawKey, request);
      }
      if (method === "GET") {
        return await this.handleAgentDocGet(rawKey);
      }
      if (method === "PUT") {
        return await this.handleAgentDocUpdate(rawKey, request);
      }
      if (method === "DELETE") {
        return await this.handleAgentDocDelete(rawKey);
      }
    }

    if (path === "/api/vfs/list" && method === "GET") {
      try {
        return await this.handleVfsList(url);
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/vfs/file" && method === "GET") {
      try {
        return await this.handleVfsFile(url);
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/vfs/search" && method === "GET") {
      try {
        return await this.handleVfsSearch(url);
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/bot/config") {
      if (method === "GET") {
        const config = await this.loadBotConfig();
        const resolved = await this.resolveTelegramToken();
        return jsonResponse(this.publicBotConfig(config, resolved));
      }
      if (method === "PUT") {
        let payload: BotConfig;
        try {
          payload = await parseJson<BotConfig>(request);
        } catch (error) {
          return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
        }
        try {
          const stored = await this.loadBotConfig();
          const tokenInput = typeof payload.token === "string" ? payload.token.trim() : "";
          const commands = this.normalizeBotCommands(payload.commands);
          const nextConfig: BotConfig = {
            token: tokenInput ? tokenInput : stored.token || "",
            webhook_url: typeof payload.webhook_url === "string" ? payload.webhook_url : "",
            webhook_secret: typeof payload.webhook_secret === "string" ? payload.webhook_secret.trim() : "",
            commands,
          };
          await this.saveBotConfig(nextConfig);
          let webhookResult: Record<string, unknown> | null = null;
          if (nextConfig.webhook_url) {
            webhookResult = await this.bindTelegramWebhook(nextConfig.webhook_url, {
              secret_token: nextConfig.webhook_secret || undefined,
            });
          }
          const commandResult = await this.syncTelegramCommands(nextConfig.commands || []);
          const resolved = await this.resolveTelegramToken();
          return jsonResponse({
            status: "ok",
            config: this.publicBotConfig(nextConfig, resolved),
            webhook_result: webhookResult,
            command_result: commandResult,
          });
        } catch (error) {
          return jsonResponse({ error: `bind webhook failed: ${String(error)}` }, 500);
        }
      }
    }

    if (path === "/api/bot/commands/remote" && method === "GET") {
      try {
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const env = await this.getTelegramEnv();
        const remoteRes = await callTelegram(env, "getMyCommands", {});
        const remoteCommands = (remoteRes.result as any[]) || [];

        const localConfig = await this.loadBotConfig();
        const localMap = new Map<string, BotCommand>();
        (localConfig.commands || []).forEach((cmd) => localMap.set(cmd.command, cmd));

        const mergedCommands: BotCommand[] = remoteCommands.map((remoteCmd: any) => {
          const commandName = String(remoteCmd.command || "");
          const description = String(remoteCmd.description || "");
          const existing = localMap.get(commandName);

          return {
            command: commandName,
            description: description,
            workflow_id: existing?.workflow_id || "",
            arg_mode: existing?.arg_mode || "auto",
            args_schema: existing?.args_schema || [],
          };
        });

        return jsonResponse({ status: "ok", commands: mergedCommands });
      } catch (error) {
        return jsonResponse({ error: `sync commands failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/commands/register" && method === "POST") {
      try {
        const payload = await parseJson<BotConfig>(request).catch(() => ({} as BotConfig));
        const stored = await this.loadBotConfig();
        const rawCommands = Array.isArray(payload.commands) ? payload.commands : stored.commands || [];
        const commands = this.normalizeBotCommands(rawCommands);
        const result = await this.syncTelegramCommands(commands);
        return jsonResponse({ status: "ok", result });
      } catch (error) {
        return jsonResponse({ error: `register commands failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/webhook/set" && method === "POST") {
      try {
        const payload = await parseJson<Record<string, unknown>>(request);
        const stored = await this.loadBotConfig();
        const url = String(payload.url || stored.webhook_url || "").trim();
        if (!url) {
          return jsonResponse({ error: "missing webhook url" }, 400);
        }
        const secretInput = typeof payload.secret_token === "string" ? payload.secret_token.trim() : undefined;
        const tokenInput = typeof payload.token === "string" ? payload.token.trim() : "";
        const nextConfig: BotConfig = {
          ...stored,
          token: tokenInput ? tokenInput : stored.token || "",
          commands: Array.isArray(payload.commands)
            ? this.normalizeBotCommands(payload.commands)
            : stored.commands || [],
          webhook_url: url,
          webhook_secret: secretInput !== undefined ? secretInput : stored.webhook_secret || "",
        };
        await this.saveBotConfig(nextConfig);
        const result = await this.bindTelegramWebhook(url, {
          drop_pending_updates: Boolean(payload.drop_pending_updates),
          secret_token: secretInput,
          max_connections:
            payload.max_connections !== undefined ? Number(payload.max_connections) : undefined,
          allowed_updates: Array.isArray(payload.allowed_updates) ? payload.allowed_updates.map(String) : undefined,
        });
        const commandResult = await this.syncTelegramCommands(nextConfig.commands || []);
        return jsonResponse({ status: "ok", result, command_result: commandResult });
      } catch (error) {
        return jsonResponse({ error: `set webhook failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/webhook/info" && method === "GET") {
      try {
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const env = await this.getTelegramEnv();
        const response = await callTelegram(env, "getWebhookInfo", {});
        // Telegram API returns { ok: true, result: {...} }
        const webhookData = (response as any).result || response;
        return jsonResponse({ status: "ok", result: webhookData });
      } catch (error) {
        return jsonResponse({ error: `get webhook info failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/me" && method === "GET") {
      try {
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const env = await this.getTelegramEnv();
        const response = await callTelegram(env, "getMe", {});
        return jsonResponse({ status: "ok", result: (response as any).result || response });
      } catch (error) {
        return jsonResponse({ error: `get bot info failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/webhook/delete" && method === "POST") {
      try {
        const payload = await parseJson<Record<string, unknown>>(request).catch(() => ({}));
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const env = await this.getTelegramEnv();
        const response = await callTelegram(env, "deleteWebhook", {
          drop_pending_updates: Boolean(payload.drop_pending_updates),
        });
        const stored = await this.loadBotConfig();
        await this.saveBotConfig({
          ...stored,
          webhook_url: "",
        });
        return jsonResponse({ status: "ok", result: response });
      } catch (error) {
        return jsonResponse({ error: `delete webhook failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/profile" && method === "POST") {
      try {
        const payload = await parseJson<Record<string, unknown>>(request);
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const env = await this.getTelegramEnv();
        const languageCode = String(payload.language_code || "").trim();
        const results: Record<string, unknown> = {};
        if (typeof payload.description === "string") {
          const requestPayload: Record<string, unknown> = { description: payload.description };
          if (languageCode) requestPayload.language_code = languageCode;
          results.description = await callTelegram(env, "setMyDescription", requestPayload);
        }
        if (typeof payload.short_description === "string") {
          const requestPayload: Record<string, unknown> = { short_description: payload.short_description };
          if (languageCode) requestPayload.language_code = languageCode;
          results.short_description = await callTelegram(env, "setMyShortDescription", requestPayload);
        }
        if (!Object.keys(results).length) {
          return jsonResponse({ error: "nothing to update" }, 400);
        }
        return jsonResponse({ status: "ok", result: results });
      } catch (error) {
        return jsonResponse({ error: `set bot profile failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/bot/menu-button" && method === "POST") {
      try {
        const payload = await parseJson<Record<string, unknown>>(request);
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const type = String(payload.type || "commands").trim();
        let menuButton: Record<string, unknown>;
        if (type === "default") {
          menuButton = { type: "default" };
        } else if (type === "web_app") {
          const textValue = String(payload.text || "").trim();
          const webAppUrl = String(payload.web_app_url || payload.url || "").trim();
          if (!textValue || !webAppUrl) {
            return jsonResponse({ error: "text and web_app_url are required for web_app menu button" }, 400);
          }
          menuButton = {
            type: "web_app",
            text: textValue,
            web_app: { url: webAppUrl },
          };
        } else {
          menuButton = { type: "commands" };
        }
        const requestPayload: Record<string, unknown> = { menu_button: menuButton };
        const chatId = String(payload.chat_id || "").trim();
        if (chatId) {
          requestPayload.chat_id = chatId;
        }
        const env = await this.getTelegramEnv();
        const response = await callTelegram(env, "setChatMenuButton", requestPayload);
        return jsonResponse({ status: "ok", result: response });
      } catch (error) {
        return jsonResponse({ error: `set chat menu button failed: ${String(error)}` }, 500);
      }
    }

    if (path === "/api/workflows" && method === "GET") {
      const state = await this.loadState();
      return jsonResponse(state.workflows || {});
    }

    if (path.startsWith("/api/workflows/") && path.endsWith("/test") && method === "POST") {
      const rawId = path.slice("/api/workflows/".length, path.length - "/test".length);
      const workflowId = decodeURIComponent(rawId || "");
      return await this.handleWorkflowTest(workflowId, request);
    }

    if (path.startsWith("/api/workflows/") && path.endsWith("/analyze") && method === "GET") {
      const rawId = path.slice("/api/workflows/".length, path.length - "/analyze".length);
      const workflowId = decodeURIComponent(rawId || "");
      return await this.handleWorkflowAnalyze(workflowId);
    }

    if (path.startsWith("/api/workflows/") && path.includes("/versions") && method === "GET") {
      const rawPath = path.slice("/api/workflows/".length);
      const parts = rawPath.split("/");
      const workflowId = decodeURIComponent(parts[0] || "");
      if (parts[1] === "versions" && !parts[2]) {
        return await this.handleWorkflowVersionsList(workflowId, url);
      }
      if (parts[1] === "versions" && parts[2]) {
        return await this.handleWorkflowVersionGet(workflowId, decodeURIComponent(parts.slice(2).join("/")));
      }
    }

    if (path.startsWith("/api/workflows/") && path.endsWith("/rollback") && method === "POST") {
      const rawId = path.slice("/api/workflows/".length, path.length - "/rollback".length);
      const workflowId = decodeURIComponent(rawId || "");
      return await this.handleWorkflowRollback(workflowId, request);
    }

    if (path.startsWith("/api/workflows/")) {
      const workflowId = decodeURIComponent(path.slice("/api/workflows/".length));
      if (!workflowId) {
        return jsonResponse({ error: "missing workflow_id" }, 400);
      }
      const state = await this.loadState();
      if (method === "GET") {
        const workflow = state.workflows?.[workflowId];
        if (!workflow) {
          return jsonResponse({ error: `workflow not found: ${workflowId}` }, 404);
        }
        return jsonResponse(workflow);
      }
      if (method === "PUT") {
        try {
          const payload = await parseJson<Record<string, unknown>>(request);
          state.workflows = state.workflows || {};
          const version = await this.recordWorkflowVersion({
            workflowId,
            workflow: state.workflows[workflowId] || null,
            operation: state.workflows[workflowId] ? "api_replace_workflow" : "api_create_workflow",
            reason: "API workflow save",
            actor: "api",
          });
          state.workflows[workflowId] = payload as any;
          await this.saveState(state);
          return jsonResponse({ status: "ok", id: workflowId, version_created: this.publicWorkflowVersion(version) });
        } catch (error) {
          return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
        }
      }
      if (method === "DELETE") {
        if (state.workflows && state.workflows[workflowId]) {
          const version = await this.recordWorkflowVersion({
            workflowId,
            workflow: state.workflows[workflowId],
            operation: "api_delete_workflow",
            reason: "API workflow delete",
            actor: "api",
          });
          delete state.workflows[workflowId];
          await this.saveState(state);
          return jsonResponse({ status: "ok", id: workflowId, version_created: this.publicWorkflowVersion(version) });
        }
        return jsonResponse({ status: "ok", id: workflowId });
      }
    }

    if (path === "/api/actions/local/available" && method === "GET") {
      return jsonResponse({ actions: [] });
    }

    if (path === "/api/actions/modular/available" && method === "GET") {
      try {
        const state = await this.loadState();
        const actions = await this.buildModularActionList(state);
        const customSkillPacks = await this.loadCustomSkillPacks();
        return jsonResponse({
          actions,
          categories: this.buildActionCategories(actions),
          skill_packs: this.buildSkillPacks(actions, customSkillPacks, state),
          secure_upload_enabled: false,
        });
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/actions/skills/available" && method === "GET") {
      try {
        const state = await this.loadState();
        const actions = await this.buildModularActionList(state);
        const customSkillPacks = await this.loadCustomSkillPacks();
        return jsonResponse({
          categories: this.buildActionCategories(actions),
          skill_packs: this.buildSkillPacks(actions, customSkillPacks, state),
          custom_skill_packs: Object.values(customSkillPacks),
        });
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/actions/skills/upload" && method === "POST") {
      try {
        return await this.handleSkillPackUpload(request);
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/actions/skills/storage" && method === "GET") {
      try {
        return await this.handleSkillStorageStatus();
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/actions/skills/init" && method === "POST") {
      try {
        return await this.handleSkillStorageStatus(true);
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path.startsWith("/api/actions/skills/") && method === "DELETE") {
      const skillKey = decodeURIComponent(path.slice("/api/actions/skills/".length));
      if (!skillKey) {
        return jsonResponse({ error: "missing skill key" }, 400);
      }
      try {
        return await this.handleSkillPackDelete(skillKey);
      } catch (error) {
        return this.skillStorageErrorResponse(error);
      }
    }

    if (path === "/api/actions/modular/upload" && method === "POST") {
      return jsonResponse({ error: "modular upload not supported yet" }, 501);
    }

    if (path.startsWith("/api/actions/modular/download/") && method === "GET") {
      const actionId = decodeURIComponent(
        path.slice("/api/actions/modular/download/".length)
      );
      const actions = await this.loadUploadedModularActions();
      const action = actions[actionId];
      if (!action) {
        return jsonResponse({ error: `action not found: ${actionId}` }, 404);
      }
      return new Response(action.content, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename=\"${action.filename}\"`,
          ...CORS_HEADERS,
        },
      });
    }

    if (path.startsWith("/api/actions/modular/") && method === "DELETE") {
      const actionId = decodeURIComponent(
        path.slice("/api/actions/modular/".length)
      );
      const actions = await this.loadUploadedModularActions();
      if (actions[actionId]) {
        delete actions[actionId];
        await this.saveUploadedModularActions(actions);
      }
      return jsonResponse({ status: "ok", deleted_id: actionId });
    }

    if (path === "/api/actions/test" && method === "POST") {
      return await this.handleActionTest(request);
    }

    if (path === "/api/observability/config") {
      if (method === "GET") {
        return jsonResponse(await this.loadObservabilityConfig());
      }
      if (method === "PUT") {
        return await this.handleObservabilityConfigUpdate(request);
      }
    }

    if (path === "/api/observability/executions") {
      if (method === "GET") {
        return await this.handleObservabilityExecutionsList(url);
      }
      if (method === "DELETE") {
        return await this.handleObservabilityExecutionsClear();
      }
    }

    if (path.startsWith("/api/observability/executions/")) {
      const execId = decodeURIComponent(path.slice("/api/observability/executions/".length));
      if (method === "GET") {
        return await this.handleObservabilityExecutionGet(execId);
      }
      if (method === "DELETE") {
        return await this.handleObservabilityExecutionDelete(execId);
      }
    }

    if (path === "/api/util/ids" && method === "POST") {
      try {
        const payload = await parseJson<{ type?: string }>(request);
        const entityType = payload.type || "button";
        const prefix = this.mapIdPrefix(entityType);
        return jsonResponse({ id: generateId(prefix) });
      } catch (error) {
        return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
      }
    }

    if (path === "/telegram/webhook" && method === "POST") {
      return await this.handleTelegramWebhook(request);
    }

    return jsonResponse({ error: "not found" }, 404);
  }

  private async loadState(): Promise<ButtonsModel> {
    const stored = await this.state.storage.get<ButtonsModel>("state");
    const model = stored ?? defaultState();
    if (!model.menus) {
      model.menus = {};
    }
    if (!model.menus.root) {
      model.menus.root = {
        id: "root",
        name: "root",
        header: "请选择功能",
        items: [],
      };
    }
    model.buttons = model.buttons || {};
    model.actions = model.actions || {};
    model.web_apps = model.web_apps || {};
    model.workflows = model.workflows || {};
    return model;
  }

  private async saveState(state: ButtonsModel): Promise<void> {
    await this.state.storage.put("state", state);
  }

  private mapIdPrefix(entityType: string): string {
    switch (entityType) {
      case "button":
        return "btn";
      case "menu":
        return "menu";
      case "action":
        return "action";
      case "webapp":
      case "web_app":
        return "webapp";
      case "workflow":
        return "workflow";
      default:
        return entityType;
    }
  }

  private async loadUploadedModularActions(): Promise<Record<string, ModularActionFile>> {
    return (await this.state.storage.get<Record<string, ModularActionFile>>(
      "modular_actions"
    )) ?? {};
  }

  private async saveUploadedModularActions(
    actions: Record<string, ModularActionFile>
  ): Promise<void> {
    await this.state.storage.put("modular_actions", actions);
  }

  private getSkillsD1(): D1DatabaseLike | null {
    const db = this.env.SKILLS_DB;
    if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") {
      return null;
    }
    return db;
  }

  private async ensureSkillsD1Schema(db: D1DatabaseLike): Promise<void> {
    if (this.skillsD1Ready) {
      return;
    }
    const statements = [
      `CREATE TABLE IF NOT EXISTS skill_packs (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tool_ids_json TEXT NOT NULL,
        root_path TEXT NOT NULL,
        filename TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS skill_files (
        path TEXT PRIMARY KEY,
        skill_key TEXT NOT NULL,
        namespace TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text/markdown',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_skill_files_skill_key ON skill_files(skill_key)",
      "CREATE INDEX IF NOT EXISTS idx_skill_files_namespace ON skill_files(namespace)",
    ];
    for (const statement of statements) {
      await db.exec(statement);
    }
    this.skillsD1Ready = true;
  }

  private normalizeStoredCustomSkillPacks(
    stored: Record<string, Partial<CustomSkillPack>>
  ): Record<string, CustomSkillPack> {
    const normalized: Record<string, CustomSkillPack> = {};
    for (const [rawKey, rawPack] of Object.entries(stored)) {
      const pack = rawPack && typeof rawPack === "object" ? rawPack : null;
      if (!pack) continue;
      const key = this.normalizeSkillPackKey(pack.key || rawKey);
      const toolIds = Array.isArray(pack.tool_ids)
        ? Array.from(new Set(pack.tool_ids.map((id) => String(id || "").trim()).filter(Boolean)))
        : [];
      if (!key) continue;
      const label = String(pack.label || key).trim() || key;
      const category = String(pack.category || "custom").trim() || "custom";
      const description = String(pack.description || "").trim();
      const contentMd = String(
        pack.content_md ||
          (pack as Record<string, unknown>).markdown ||
          (pack as Record<string, unknown>).content ||
          ""
      ).trim();
      const rawFiles = Array.isArray((pack as Record<string, unknown>).files)
        ? ((pack as Record<string, unknown>).files as unknown[])
        : [];
      const files = this.ensureRootCustomSkillFile(
        key,
        rawFiles
          .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .map((entry) => ({
            path: String(entry.path || entry.filename || entry.name || "").trim(),
            content_md: String(entry.content_md || entry.markdown || entry.content || entry.md || ""),
            content_type: typeof entry.content_type === "string" ? entry.content_type : "text/markdown",
            kind: typeof entry.kind === "string" ? entry.kind : undefined,
            title: typeof entry.title === "string" ? entry.title : undefined,
            category: typeof entry.category === "string" ? entry.category : undefined,
            tool_id: typeof entry.tool_id === "string" ? entry.tool_id : undefined,
            created_at: Number(entry.created_at || pack.created_at || Date.now()),
            updated_at: Number(entry.updated_at || pack.updated_at || Date.now()),
          })),
        contentMd || this.buildSkillMarkdownDocument({
          key,
          label,
          category,
          description,
          tools: toolIds.map((id) => ({ id, name: id })),
        }),
        Number(pack.updated_at || Date.now())
      );
      const rootFile = files.find((file) => file.path === `custom/${key}/SKILL.md`) || files.find((file) => file.path.endsWith("/SKILL.md"));
      const normalizedContentMd = contentMd || rootFile?.content_md || "";
      normalized[key] = {
        key,
        label,
        category,
        description,
        tool_ids: toolIds,
        content_md: normalizedContentMd || this.buildSkillMarkdownDocument({
          key,
          label,
          category,
          description,
          tools: toolIds.map((id) => ({ id, name: id })),
        }),
        files,
        filename: typeof pack.filename === "string" ? pack.filename : undefined,
        created_at: Number(pack.created_at || Date.now()),
        updated_at: Number(pack.updated_at || Date.now()),
      };
    }
    return normalized;
  }

  private async loadDoCustomSkillPacks(): Promise<Record<string, CustomSkillPack>> {
    const stored =
      (await this.state.storage.get<Record<string, CustomSkillPack>>("custom_skill_packs")) ?? {};
    return this.normalizeStoredCustomSkillPacks(stored);
  }

  private async saveDoCustomSkillPacks(packs: Record<string, CustomSkillPack>): Promise<void> {
    await this.state.storage.put("custom_skill_packs", packs);
  }

  private async migrateDoSkillsToD1IfNeeded(db: D1DatabaseLike): Promise<void> {
    if (this.skillsD1MigrationChecked) {
      return;
    }
    await this.ensureSkillsD1Schema(db);
    const row = await db.prepare("SELECT COUNT(*) AS count FROM skill_packs").first<{ count: number }>();
    if (Number(row?.count || 0) === 0) {
      const existingDoPacks = await this.loadDoCustomSkillPacks();
      if (Object.keys(existingDoPacks).length > 0) {
        await this.saveD1CustomSkillPacks(existingDoPacks, db);
      }
    }
    this.skillsD1MigrationChecked = true;
  }

  private async loadD1CustomSkillPacks(db: D1DatabaseLike): Promise<Record<string, CustomSkillPack>> {
    await this.ensureSkillsD1Schema(db);
    await this.migrateDoSkillsToD1IfNeeded(db);
    const result = await db
      .prepare(
        `SELECT
          key,
          label,
          category,
          description,
          tool_ids_json,
          root_path,
          filename,
          created_at,
          updated_at
        FROM skill_packs
        ORDER BY key`
      )
      .all<D1SkillPackRow>();
    const fileResult = await db
      .prepare(
        `SELECT
          path,
          skill_key,
          namespace,
          content,
          content_type,
          created_at,
          updated_at
        FROM skill_files
        WHERE namespace = 'custom'
        ORDER BY path`
      )
      .all<D1SkillFileRow>();
    const filesByPack = new Map<string, CustomSkillFile[]>();
    for (const file of fileResult.results || []) {
      const key = String(file.skill_key || "").trim();
      if (!key) continue;
      const list = filesByPack.get(key) || [];
      list.push({
        path: file.path,
        content_md: file.content || "",
        content_type: file.content_type || "text/markdown",
        kind: file.path.endsWith("/SKILL.md") ? "root" : "reference",
        created_at: Number(file.created_at || Date.now()),
        updated_at: Number(file.updated_at || Date.now()),
      });
      filesByPack.set(key, list);
    }
    const stored: Record<string, Partial<CustomSkillPack>> = {};
    for (const row of result.results || []) {
      let toolIds: string[] = [];
      try {
        const parsed = JSON.parse(row.tool_ids_json || "[]");
        toolIds = Array.isArray(parsed) ? parsed.map((id) => String(id || "").trim()).filter(Boolean) : [];
      } catch {
        toolIds = [];
      }
      const files = filesByPack.get(row.key) || [];
      const rootContent = files.find((file) => file.path === row.root_path)?.content_md || files.find((file) => file.path.endsWith("/SKILL.md"))?.content_md || "";
      stored[row.key] = {
        key: row.key,
        label: row.label,
        category: row.category,
        description: row.description || "",
        tool_ids: toolIds,
        content_md: rootContent,
        files,
        filename: row.filename || undefined,
        created_at: Number(row.created_at || Date.now()),
        updated_at: Number(row.updated_at || Date.now()),
      };
    }
    return this.normalizeStoredCustomSkillPacks(stored);
  }

  private async saveD1CustomSkillPacks(
    packs: Record<string, CustomSkillPack>,
    db: D1DatabaseLike
  ): Promise<void> {
    await this.ensureSkillsD1Schema(db);
    const existingRows = await db.prepare("SELECT key FROM skill_packs").all<{ key: string }>();
    const nextKeys = new Set(Object.keys(packs));
    for (const row of existingRows.results || []) {
      if (!nextKeys.has(row.key)) {
        await db
          .prepare("DELETE FROM skill_files WHERE skill_key = ? AND namespace = 'custom'")
          .bind(row.key)
          .run();
        await db.prepare("DELETE FROM skill_packs WHERE key = ?").bind(row.key).run();
      }
    }

    for (const pack of Object.values(packs)) {
      const now = Date.now();
      const createdAt = Number(pack.created_at || now);
      const updatedAt = Number(pack.updated_at || now);
      const files = this.ensureRootCustomSkillFile(pack.key, pack.files || [], pack.content_md || "", updatedAt);
      const rootPath = this.resolveCustomSkillRootPath({ ...pack, files });
      await db
        .prepare(
          `INSERT INTO skill_packs (
            key, label, category, description, tool_ids_json, root_path, filename, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            label = excluded.label,
            category = excluded.category,
            description = excluded.description,
            tool_ids_json = excluded.tool_ids_json,
            root_path = excluded.root_path,
            filename = excluded.filename,
            updated_at = excluded.updated_at`
        )
        .bind(
          pack.key,
          pack.label,
          pack.category,
          pack.description || "",
          JSON.stringify(pack.tool_ids || []),
          rootPath,
          pack.filename || null,
          createdAt,
          updatedAt
        )
        .run();
      await db
        .prepare("DELETE FROM skill_files WHERE skill_key = ? AND namespace = 'custom'")
        .bind(pack.key)
        .run();
      for (const file of files) {
        await db
          .prepare(
            `INSERT INTO skill_files (
              path, skill_key, namespace, content, content_type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
              content = excluded.content,
              content_type = excluded.content_type,
              updated_at = excluded.updated_at`
          )
          .bind(
            file.path,
            pack.key,
            "custom",
            file.content_md || "",
            file.content_type || "text/markdown",
            Number(file.created_at || createdAt),
            Number(file.updated_at || updatedAt)
          )
          .run();
      }
    }
  }

  private async loadCustomSkillPacks(): Promise<Record<string, CustomSkillPack>> {
    const db = this.getSkillsD1();
    if (db) {
      return await this.loadD1CustomSkillPacks(db);
    }
    return await this.loadDoCustomSkillPacks();
  }

  private async saveCustomSkillPacks(packs: Record<string, CustomSkillPack>): Promise<void> {
    const db = this.getSkillsD1();
    if (db) {
      await this.saveD1CustomSkillPacks(packs, db);
      return;
    }
    await this.saveDoCustomSkillPacks(packs);
  }

  private async handleSkillStorageStatus(initialize = false): Promise<Response> {
    const db = this.getSkillsD1();
    if (!db) {
      const packs = await this.loadDoCustomSkillPacks();
      return jsonResponse({
        backend: "durable_object",
        d1_bound: false,
        initialized: true,
        custom_skill_count: Object.keys(packs).length,
      });
    }
    await this.ensureSkillsD1Schema(db);
    if (initialize) {
      await this.migrateDoSkillsToD1IfNeeded(db);
    }
    const row = await db.prepare("SELECT COUNT(*) AS count FROM skill_packs").first<{ count: number }>();
    return jsonResponse({
      backend: "d1",
      d1_bound: true,
      initialized: true,
      custom_skill_count: Number(row?.count || 0),
      tables: ["skill_packs", "skill_files"],
      migrated_from_durable_object: this.skillsD1MigrationChecked,
    });
  }

  private skillStorageErrorResponse(error: unknown): Response {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(
      {
        error: "skills storage operation failed",
        backend: this.getSkillsD1() ? "d1" : "durable_object",
        detail: message,
      },
      500
    );
  }

  private async loadAllSkillVfsFiles(): Promise<AgentSkillFile[]> {
    const state = await this.loadState();
    const actions = await this.buildModularActionList(state);
    const customSkillPacks = await this.loadCustomSkillPacks();
    const packs = this.buildSkillPacks(actions, customSkillPacks, state) as Array<Record<string, unknown>>;
    return this.collectAgentSkillFiles(packs);
  }

  private async handleVfsList(url: URL): Promise<Response> {
    const files = await this.loadAllSkillVfsFiles();
    const path = url.searchParams.get("path") || "skills://";
    const recursive = ["1", "true", "yes"].includes((url.searchParams.get("recursive") || "").toLowerCase());
    const depth = Number(url.searchParams.get("depth") || (recursive ? 3 : 1));
    return jsonResponse(this.listSkillVfs(files, path, { recursive, depth }));
  }

  private async handleVfsFile(url: URL): Promise<Response> {
    const files = await this.loadAllSkillVfsFiles();
    const path = url.searchParams.get("path") || "";
    const result = this.readSkillVfsFile(files, path, 256 * 1024);
    return jsonResponse(result, result.ok === false ? 404 : 200);
  }

  private async handleVfsSearch(url: URL): Promise<Response> {
    const files = await this.loadAllSkillVfsFiles();
    const result = this.searchSkillVfsFiles(files, {
      query: url.searchParams.get("query") || url.searchParams.get("q") || "",
      path: url.searchParams.get("path") || url.searchParams.get("root") || "",
      limit: url.searchParams.get("limit") || "20",
    });
    return jsonResponse(result, result.ok === false ? 400 : 200);
  }

  private normalizeSkillPackKey(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
  }

  private sanitizeSkillRelativePath(input: unknown): string {
    const raw = String(input || "")
      .replace(/\0/g, "")
      .replace(/\\/g, "/")
      .trim();
    const withoutScheme = raw
      .replace(/^skills:\/\//i, "")
      .replace(/^skills:\//i, "")
      .replace(/^\/+/, "");
    const parts = withoutScheme
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.some((part) => part === "." || part === "..")) {
      return "";
    }
    return parts.join("/").slice(0, 240);
  }

  private normalizeCustomSkillFilePath(packKey: string, input: unknown): string {
    const path = this.sanitizeSkillRelativePath(input);
    if (!path) {
      return "";
    }
    if (path === `custom/${packKey}`) {
      return `custom/${packKey}/SKILL.md`;
    }
    if (path.startsWith(`custom/${packKey}/`)) {
      return path;
    }
    if (path.startsWith(`${packKey}/`)) {
      return `custom/${path}`;
    }
    if (path.startsWith("custom/")) {
      return "";
    }
    return `custom/${packKey}/${path}`;
  }

  private ensureRootCustomSkillFile(
    packKey: string,
    files: CustomSkillFile[],
    rootContent: string,
    now = Date.now()
  ): CustomSkillFile[] {
    const rootPath = `custom/${packKey}/SKILL.md`;
    const normalized = files.map((file) => ({
      ...file,
      path: this.normalizeCustomSkillFilePath(packKey, file.path),
      content_md: String(file.content_md || ""),
      content_type: file.content_type || "text/markdown",
    })).filter((file) => file.path && file.content_md.length <= 256 * 1024);
    const hasRoot = normalized.some((file) => file.path === rootPath);
    if (!hasRoot) {
      normalized.unshift({
        path: rootPath,
        kind: "root",
        title: packKey,
        content_md: rootContent,
        content_type: "text/markdown",
        created_at: now,
        updated_at: now,
      });
    }
    return normalized.map((file) => ({
      ...file,
      kind: file.kind || (file.path.endsWith("/SKILL.md") ? "root" : "reference"),
      created_at: Number(file.created_at || now),
      updated_at: Number(file.updated_at || now),
    }));
  }

  private resolveCustomSkillRootPath(pack: CustomSkillPack): string {
    const files = Array.isArray(pack.files) ? pack.files : [];
    return (
      files.find((file) => file.path === `custom/${pack.key}/SKILL.md`)?.path ||
      files.find((file) => file.path.endsWith("/SKILL.md"))?.path ||
      `custom/${pack.key}/SKILL.md`
    );
  }

  private trimSkillScalar(input: string): string {
    const value = String(input || "").trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  private parseSkillListValue(input: string): string[] {
    const value = this.trimSkillScalar(input);
    if (!value) return [];
    const inlineList = value.match(/^\[(.*)\]$/);
    const rawItems = inlineList ? inlineList[1].split(",") : value.split(",");
    return rawItems.map((item) => this.trimSkillScalar(item)).filter(Boolean);
  }

  private parseSkillMarkdownFrontmatter(markdown: string): Record<string, unknown> {
    const text = String(markdown || "").replace(/^\uFEFF/, "");
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match) {
      return {};
    }
    const meta: Record<string, unknown> = {};
    let currentListKey = "";
    for (const rawLine of match[1].split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const listItem = line.match(/^-\s*(.+)$/);
      if (listItem && currentListKey) {
        const list = Array.isArray(meta[currentListKey]) ? (meta[currentListKey] as string[]) : [];
        list.push(this.trimSkillScalar(listItem[1]));
        meta[currentListKey] = list.filter(Boolean);
        continue;
      }
      const keyValue = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!keyValue) continue;
      const key = keyValue[1].trim();
      const value = keyValue[2].trim();
      if (!value) {
        meta[key] = [];
        currentListKey = key;
        continue;
      }
      currentListKey = "";
      meta[key] = key === "tool_ids" || key === "tools"
        ? this.parseSkillListValue(value)
        : this.trimSkillScalar(value);
    }
    return meta;
  }

  private stripSkillMarkdownFrontmatter(markdown: string): string {
    return String(markdown || "")
      .replace(/^\uFEFF/, "")
      .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "")
      .trim();
  }

  private extractSkillMarkdownTitle(markdown: string): string {
    const body = this.stripSkillMarkdownFrontmatter(markdown);
    const match = body.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : "";
  }

  private extractSkillMarkdownDescription(markdown: string): string {
    const body = this.stripSkillMarkdownFrontmatter(markdown);
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("- ") || line.startsWith("```")) {
        continue;
      }
      return line.slice(0, 240);
    }
    return "";
  }

  private extractSkillToolIds(payload: Record<string, unknown>): string[] {
    const rawToolIds = Array.isArray(payload.tool_ids) ? payload.tool_ids : payload.tools;
    if (!Array.isArray(rawToolIds)) {
      return [];
    }
    return Array.from(
      new Set(
        rawToolIds
          .map((entry) => {
            if (typeof entry === "string" || typeof entry === "number") {
              return String(entry).trim();
            }
            if (entry && typeof entry === "object") {
              return String((entry as Record<string, unknown>).id || "").trim();
            }
            return "";
          })
          .filter(Boolean)
      )
    );
  }

  private getSkillMarkdownFromPayload(payload: Record<string, unknown>): string {
    const candidate = payload.content_md ?? payload.markdown ?? payload.content ?? payload.md;
    return typeof candidate === "string" ? candidate.trim() : "";
  }

  private collectSkillFilesFromPayload(
    packKey: string,
    payload: Record<string, unknown>,
    rootContent: string,
    now = Date.now()
  ): { files?: CustomSkillFile[]; error?: string; details?: unknown } {
    const rawFiles = Array.isArray(payload.files) ? payload.files : [];
    const files: CustomSkillFile[] = [];
    for (const [index, entry] of rawFiles.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return { error: "skill files must be objects", details: { index } };
      }
      const file = entry as Record<string, unknown>;
      const rawPath = file.path || file.filename || file.name;
      const path = this.normalizeCustomSkillFilePath(packKey, rawPath);
      if (!path) {
        return { error: "skill file path is invalid", details: { index, path: rawPath } };
      }
      const content = String(file.content_md ?? file.markdown ?? file.content ?? file.md ?? "");
      if (content.length > 256 * 1024) {
        return { error: "skill file is too large; maximum is 256KB", details: { path } };
      }
      files.push({
        path,
        content_md: content,
        content_type: typeof file.content_type === "string" ? file.content_type : "text/markdown",
        kind: typeof file.kind === "string" ? file.kind : undefined,
        title: typeof file.title === "string" ? file.title : undefined,
        category: typeof file.category === "string" ? file.category : undefined,
        tool_id: typeof file.tool_id === "string" ? file.tool_id : undefined,
        created_at: now,
        updated_at: now,
      });
    }

    if (rootContent) {
      const rootPath = `custom/${packKey}/SKILL.md`;
      const existingRoot = files.find((file) => file.path === rootPath);
      if (existingRoot) {
        existingRoot.content_md = existingRoot.content_md || rootContent;
        existingRoot.kind = existingRoot.kind || "root";
      } else {
        files.unshift({
          path: rootPath,
          content_md: rootContent,
          content_type: "text/markdown",
          kind: "root",
          created_at: now,
          updated_at: now,
        });
      }
    }

    const deduped = new Map<string, CustomSkillFile>();
    for (const file of files) {
      deduped.set(file.path, file);
    }
    const normalized = Array.from(deduped.values()).sort((a, b) => {
      if (a.path.endsWith("/SKILL.md") && !b.path.endsWith("/SKILL.md")) return -1;
      if (!a.path.endsWith("/SKILL.md") && b.path.endsWith("/SKILL.md")) return 1;
      return a.path.localeCompare(b.path);
    });
    if (normalized.length > 80) {
      return { error: "skill package has too many files; maximum is 80" };
    }
    const totalSize = normalized.reduce((sum, file) => sum + file.content_md.length, 0);
    if (totalSize > 768 * 1024) {
      return { error: "skill package is too large; maximum is 768KB" };
    }
    return { files: this.ensureRootCustomSkillFile(packKey, normalized, rootContent, now) };
  }

  private buildSkillMarkdownDocument(input: {
    key: string;
    label: string;
    category: string;
    description?: string;
    tools: Array<Record<string, unknown>>;
  }): string {
    const toolIds = input.tools.map((tool) => String(tool.id || "").trim()).filter(Boolean);
    const toolDocs = input.tools.map((tool) => {
      const id = String(tool.id || "").trim();
      const name = String(tool.name || id).trim();
      const description = String(tool.description || "").trim();
      const risk = String(tool.risk_level || "safe").trim();
      return `### ${name}\n\n- id: \`${id}\`\n- risk: \`${risk}\`${description ? `\n- description: ${description}` : ""}`;
    });
    return [
      "---",
      `key: ${input.key}`,
      `label: ${input.label}`,
      `category: ${input.category}`,
      "tool_ids:",
      ...toolIds.map((id) => `  - ${id}`),
      "---",
      "",
      `# ${input.label}`,
      "",
      input.description || `Skill document for ${input.label}.`,
      "",
      "## Available Tools",
      "",
      ...(toolDocs.length ? toolDocs : ["No tools are attached to this skill."]),
      "",
      "## Usage Notes",
      "",
      "- Load this skill only when the task needs these tools.",
      "- Validate required inputs before calling tools with side effects.",
    ].join("\n");
  }

  private describeSkillCategory(category: string): string {
    const descriptions: Record<string, string> = {
      trigger: "Workflow entry points such as commands, keywords, buttons, and Telegram update events.",
      flow: "Execution control: branches, loops, sub-workflows, delays, and error handling.",
      message: "Telegram message and media operations such as send, edit, copy, forward, and delete.",
      telegram: "Telegram chat/member lookup, user input waits, payments, shipping, and admin operations.",
      navigation: "Menu and button navigation helpers.",
      ai: "LLM generation tools backed by enabled model providers.",
      data: "Local data processing such as math, arrays, and date/time operations.",
      integration: "External integration and file-cache helpers.",
      utility: "Common utilities for strings, JSON, variables, placeholders, and existing IDs.",
    };
    return descriptions[category] || `Workflow nodes in the ${category} category.`;
  }

  private buildWorkflowNodesSkillMarkdown(
    categoryGroups: Array<{
      key: string;
      tools: Array<Record<string, unknown>>;
    }>
  ): string {
    const categoryIndex = categoryGroups.map((group) => `- \`${group.key}/SKILL.md\` - ${this.describeSkillCategory(group.key)}`);
    return [
      "---",
      "name: workflow-nodes",
      "description: Workflow-node tool guide for building, inspecting, explaining, or executing Telegram bot workflows. Use for Telegram messaging, flow control, data transforms, integrations, and LLM node tools.",
      "---",
      "",
      "# Workflow Node Tools",
      "",
      "This skill is a virtual folder for workflow node tools. It does not contain every tool schema in this file.",
      "",
      "## Read Order",
      "",
      "1. Start here and choose the smallest relevant category.",
      "2. Open `<category>/SKILL.md` for category-level guidance.",
      "3. Open only the needed `<category>/<node_id>.md` files.",
      "4. Call node tools only after required inputs are known.",
      "",
      "## When To Use",
      "",
      "- Use for building, inspecting, explaining, or executing workflow-node operations.",
      "- Do not use for ordinary chat that does not need workflow nodes.",
      "",
      "## Safety Rules",
      "",
      "- Do not invent IDs such as `chat_id`, `message_id`, `user_id`, workflow IDs, or model IDs.",
      "- Treat `side_effect`, `network`, and `high` risk tools as requiring intent checks.",
      "- For workflows, data should pass by references; edges should express execution order.",
      "",
      "## Tool Calling Protocol",
      "",
      "- Treat each node `.md` file as the contract for one callable node tool.",
      "- Call the exact `tool_id` from the node document with JSON matching its input schema.",
      "- Use prior node outputs by reference instead of copying large values through edges.",
      "- Read additional node docs only when the current task actually needs them.",
      "",
      "## Categories",
      "",
      ...categoryIndex,
    ].join("\n");
  }

  private buildCategorySkillMarkdown(category: string, tools: Array<Record<string, unknown>>): string {
    return [
      "---",
      `name: ${category}`,
      `description: ${this.describeSkillCategory(category)}`,
      "---",
      "",
      `# ${category}`,
      "",
      this.describeSkillCategory(category),
      "",
      "## How To Use",
      "",
      "1. Pick only the node docs needed for the current task.",
      "2. Open the matching `<node_id>.md` file before calling that node tool.",
      "3. Check required inputs, outputs, and risk level in the node document.",
      "",
      "## Node Docs",
      "",
      ...tools.map((tool) => {
        const id = String(tool.id || "").trim();
        const name = String(tool.name || id).trim();
        const risk = String(tool.risk_level || "safe").trim();
        return `- \`${id}.md\` - ${name} (${risk})`;
      }),
    ].join("\n");
  }

  private buildNodeToolMarkdown(tool: Record<string, unknown>): string {
    const id = String(tool.id || "").trim();
    const name = String(tool.name || id).trim();
    const category = String(tool.category || "utility").trim();
    const description = String(tool.description || "").trim();
    const risk = String(tool.risk_level || "safe").trim();
    const sideEffects = Boolean(tool.side_effects);
    const allowNetwork = Boolean(tool.allow_network);
    return [
      `# ${name}`,
      "",
      description || `Node tool ${id}.`,
      "",
      "## Tool Metadata",
      "",
      `- tool_id: \`${id}\``,
      `- category: \`${category}\``,
      `- risk_level: \`${risk}\``,
      `- side_effects: \`${String(sideEffects)}\``,
      `- allow_network: \`${String(allowNetwork)}\``,
      "",
      "## Use When",
      "",
      `Use this node when the workflow needs \`${id}\` behavior in the \`${category}\` category.`,
      "",
      "## Before Calling",
      "",
      "- Fill every required input from workflow context, user input, or prior node outputs.",
      "- Do not guess Telegram IDs, workflow IDs, model IDs, or message IDs.",
      sideEffects || risk !== "safe" ? "- Confirm side effects are intended before calling." : "- This is a low-risk local/helper tool unless inputs reference side-effectful context.",
      "",
      "## Call Contract",
      "",
      `Call node tool \`${id}\` with an input object that matches the schema below.`,
      "Use workflow references for values produced by earlier nodes.",
      "Following nodes may reference the named outputs listed below.",
      "",
      "## Input Schema",
      "",
      "```json",
      JSON.stringify(tool.input_schema || { type: "object", properties: {}, required: [] }, null, 2),
      "```",
      "",
      "## Outputs",
      "",
      "```json",
      JSON.stringify(tool.outputs || [], null, 2),
      "```",
    ].join("\n");
  }

  private buildWorkflowManagementSkillPack(state?: ButtonsModel) {
    const workflowCount = Object.keys(state?.workflows || {}).length;
    const toolDocs = [
      {
        id: "list_workflows",
        title: "List Workflows",
        body: [
          "# list_workflows",
          "",
          "Use this tool first when the user asks what workflows exist or references a workflow by vague name.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify(
            {
              query: "optional text filter",
              limit: "optional number, default 50",
            },
            null,
            2
          ),
          "```",
        ].join("\n"),
      },
      {
        id: "search_workflows",
        title: "Search Workflows",
        body: [
          "# search_workflows",
          "",
          "Use this when looking for workflows by trigger, node action, name, or description.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ query: "required keyword", limit: "optional number, default 12" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "read_workflow",
        title: "Read Workflow",
        body: [
          "# read_workflow",
          "",
          "Use this before explaining or debugging a specific workflow. Sensitive fields are redacted by the backend.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required workflow id", include_analysis: "optional boolean" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "analyze_workflow",
        title: "Analyze Workflow",
        body: [
          "# analyze_workflow",
          "",
          "Use this when diagnosing execution order, missing inputs, branch/reference risks, or trigger structure.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required workflow id" }, null, 2),
          "```",
        ].join("\n"),
      },
    ];
    const rootContent = [
      "---",
      "name: workflows",
      "description: Read-only tools for inspecting saved workflows, triggers, execution plans, and workflow structure.",
      "---",
      "",
      "# Saved Workflows",
      "",
      `This skill exposes read-only workflow inspection tools. Current saved workflow count: ${workflowCount}.`,
      "",
      "## Read Order",
      "",
      "1. Use `list_workflows` or `search_workflows` to identify the workflow id.",
      "2. Use `read_workflow` for structure and sanitized node configuration.",
      "3. Use `analyze_workflow` for execution order, dependency issues, missing inputs, and risky nodes.",
      "",
      "## Boundaries",
      "",
      "- These tools do not modify workflows.",
      "- These tools do not execute workflows.",
      "- Sensitive workflow fields are redacted before being returned.",
      "- Do not invent workflow ids. Always list or search first if the id is uncertain.",
      "",
      "## Tool Files",
      "",
      ...toolDocs.map((tool) => `- \`tools/${tool.id}.md\` - ${tool.title}`),
    ].join("\n");
    return {
      key: "workflows",
      label: "Saved Workflows",
      category: "workflow",
      description: "Read-only skill for inspecting saved workflows and workflow analysis.",
      tool_count: toolDocs.length,
      tools: toolDocs.map((tool) => ({
        id: tool.id,
        name: tool.title,
        description: `Agent tool: ${tool.title}`,
        category: "workflow",
        risk_level: "safe",
        side_effects: false,
        allow_network: false,
      })),
      tool_ids: toolDocs.map((tool) => tool.id),
      files: [
        {
          path: "workflows/SKILL.md",
          kind: "root",
          title: "Saved Workflows",
          content_md: rootContent,
          source: "generated",
        },
        ...toolDocs.map((tool) => ({
          path: `workflows/tools/${tool.id}.md`,
          kind: "tool",
          category: "workflow",
          tool_id: tool.id,
          title: tool.title,
          content_md: tool.body,
          source: "generated",
        })),
      ],
      content_md: rootContent,
      format: "markdown",
      source: "generated",
    };
  }

  private buildWorkflowEditorSkillPack() {
    const toolDocs = [
      {
        id: "create_workflow",
        title: "Create Workflow",
        risk: "side_effect",
        body: [
          "# create_workflow",
          "",
          "Create a new empty workflow. A rollback version is recorded before creation, so rolling back this version deletes the newly created workflow.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "optional id", name: "optional name", description: "optional description", reason: "why this edit is needed" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "update_workflow_meta",
        title: "Update Workflow Metadata",
        risk: "side_effect",
        body: [
          "# update_workflow_meta",
          "",
          "Update workflow name or description. A rollback snapshot is saved before the change.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", name: "optional", description: "optional", reason: "why this edit is needed" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "upsert_workflow_node",
        title: "Upsert Workflow Node",
        risk: "side_effect",
        body: [
          "# upsert_workflow_node",
          "",
          "Create or update one node. The backend validates `action_id` against available node actions and saves a rollback snapshot first.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify(
            {
              workflow_id: "required",
              node_id: "optional; generated when omitted",
              action_id: "required for new nodes",
              data: "node config object",
              position: { x: 200, y: 120 },
              merge_data: "optional boolean; default true",
              replace_data: "optional boolean",
              reason: "why this edit is needed",
            },
            null,
            2
          ),
          "```",
        ].join("\n"),
      },
      {
        id: "remove_workflow_node",
        title: "Remove Workflow Node",
        risk: "high",
        body: [
          "# remove_workflow_node",
          "",
          "Remove one node and, by default, all connected edges. A rollback snapshot is saved first.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", node_id: "required", remove_edges: "optional boolean, default true", reason: "why this edit is needed" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "connect_workflow_nodes",
        title: "Connect Workflow Nodes",
        risk: "side_effect",
        body: [
          "# connect_workflow_nodes",
          "",
          "Create or update one edge. Use control ports for execution order and data ports/references for values.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify(
            {
              workflow_id: "required",
              edge_id: "optional",
              source_node: "required",
              source_output: "default __control__",
              source_path: "optional",
              target_node: "required",
              target_input: "default __control__",
              reason: "why this edit is needed",
            },
            null,
            2
          ),
          "```",
        ].join("\n"),
      },
      {
        id: "remove_workflow_edge",
        title: "Remove Workflow Edge",
        risk: "side_effect",
        body: [
          "# remove_workflow_edge",
          "",
          "Remove one or more edges by id or source/target filter. A rollback snapshot is saved first.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", edge_id: "optional", source_node: "optional", target_node: "optional", reason: "why this edit is needed" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "delete_workflow",
        title: "Delete Workflow",
        risk: "high",
        body: [
          "# delete_workflow",
          "",
          "Delete a workflow. The full workflow is saved as a rollback snapshot first.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", reason: "why this edit is needed" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "list_workflow_versions",
        title: "List Workflow Versions",
        risk: "safe",
        body: [
          "# list_workflow_versions",
          "",
          "List rollback snapshots for one workflow. Use this before rollback if the target version is unknown.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", limit: "optional number, default 20" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "read_workflow_version",
        title: "Read Workflow Version",
        risk: "safe",
        body: [
          "# read_workflow_version",
          "",
          "Read one rollback snapshot. Sensitive fields are redacted in Agent responses.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", version_id: "required", include_analysis: "optional boolean" }, null, 2),
          "```",
        ].join("\n"),
      },
      {
        id: "rollback_workflow",
        title: "Rollback Workflow",
        risk: "high",
        body: [
          "# rollback_workflow",
          "",
          "Restore a workflow to a saved version. The current state is saved as a new rollback snapshot before restoring.",
          "",
          "## Arguments",
          "",
          "```json",
          JSON.stringify({ workflow_id: "required", version_id: "required", reason: "why rollback is needed" }, null, 2),
          "```",
        ].join("\n"),
      },
    ];
    const rootContent = [
      "---",
      "name: workflow-editor",
      "description: Versioned workflow editing tools for creating, configuring, deleting, and rolling back saved workflows.",
      "---",
      "",
      "# Workflow Editor",
      "",
      "This skill allows the agent to modify saved workflows through small, versioned operations.",
      "",
      "## Required Procedure",
      "",
      "1. Use `list_workflows`, `search_workflows`, or `read_workflow` from the `workflows` skill before editing unless the workflow id is exact.",
      "2. Make the smallest possible edit: metadata, one node, or one edge per call.",
      "3. Provide a short `reason` for every write operation.",
      "4. Review the returned analysis after each write. Fix errors before adding more steps.",
      "5. Use `list_workflow_versions` and `rollback_workflow` when an edit needs to be reverted.",
      "",
      "## Versioning Rules",
      "",
      "- Every write saves the previous workflow as a rollback snapshot before changing state.",
      "- Rolling back also saves the current state first, so rollback itself can be undone.",
      "- Creating a workflow stores a snapshot representing non-existence; rolling back that version deletes the workflow.",
      "- Deleting a workflow stores the full workflow first; rolling back that version restores it.",
      "",
      "## Tool Files",
      "",
      ...toolDocs.map((tool) => `- \`tools/${tool.id}.md\` - ${tool.title}`),
    ].join("\n");
    return {
      key: "workflow-editor",
      label: "Workflow Editor",
      category: "workflow",
      description: "Versioned skill for creating, editing, deleting, and rolling back workflows.",
      tool_count: toolDocs.length,
      tools: toolDocs.map((tool) => ({
        id: tool.id,
        name: tool.title,
        description: `Agent tool: ${tool.title}`,
        category: "workflow",
        risk_level: tool.risk,
        side_effects: tool.risk !== "safe",
        allow_network: false,
      })),
      tool_ids: toolDocs.map((tool) => tool.id),
      files: [
        {
          path: "workflow-editor/SKILL.md",
          kind: "root",
          title: "Workflow Editor",
          content_md: rootContent,
          source: "generated",
        },
        ...toolDocs.map((tool) => ({
          path: `workflow-editor/tools/${tool.id}.md`,
          kind: "tool",
          category: "workflow",
          tool_id: tool.id,
          title: tool.title,
          content_md: tool.body,
          source: "generated",
        })),
      ],
      content_md: rootContent,
      format: "markdown",
      source: "generated",
    };
  }

  private buildMcpToolsSkillPack() {
    const rootContent = [
      "---",
      "name: mcp-tools",
      "description: Dynamic MCP tool access. Enable this skill to let the agent use configured HTTP MCP servers.",
      "---",
      "",
      "# MCP Tools",
      "",
      "This skill exposes tools discovered from configured MCP servers. MCP servers are configured in the MCP tab.",
      "",
      "## Rules",
      "",
      "- Only HTTP or Streamable HTTP MCP servers are supported in this Worker runtime.",
      "- Stdio MCP servers must be bridged through an external HTTP gateway before they can be used here.",
      "- The WebUI never receives stored MCP header values; it only sees header names.",
      "- Use the smallest MCP tool needed for the user request and explain side effects when the server/tool is not read-only.",
      "",
      "## Discovery",
      "",
      "1. Configure an MCP server endpoint and headers.",
      "2. Fetch tools from the MCP tab.",
      "3. Enable this skill and the desired MCP server.",
      "4. The agent will receive the discovered MCP tools as native model tool definitions.",
    ].join("\n");
    return {
      key: "mcp-tools",
      label: "MCP Tools",
      category: "integration",
      description: "Dynamic skill for using configured HTTP MCP server tools.",
      tool_count: 0,
      tools: [],
      tool_ids: [],
      files: [
        {
          path: "mcp-tools/SKILL.md",
          kind: "root",
          title: "MCP Tools",
          content_md: rootContent,
          source: "generated",
        },
      ],
      content_md: rootContent,
      format: "markdown",
      source: "generated",
    };
  }

  private buildSkillEditorSkillPack() {
    const toolDocs = [
      {
        id: "list_skill_packs",
        title: "List Skill Packs",
        risk: "safe",
        body: "# list_skill_packs\n\nList generated and uploaded skill packs. Generated packs are read-only; uploaded packs can be modified.",
      },
      {
        id: "read_skill_pack",
        title: "Read Skill Pack",
        risk: "safe",
        body: "# read_skill_pack\n\nRead one skill pack and its files before editing.",
      },
      {
        id: "upsert_skill_pack",
        title: "Upsert Skill Pack",
        risk: "side_effect",
        body: "# upsert_skill_pack\n\nCreate or replace an uploaded custom skill pack. Provide `key`, optional metadata, `tool_ids`, `content_md`, and/or `files`.",
      },
      {
        id: "upsert_skill_file",
        title: "Upsert Skill File",
        risk: "side_effect",
        body: "# upsert_skill_file\n\nCreate or update one file in an uploaded skill package. Use `SKILL.md` for the root file and subdirectories for references.",
      },
      {
        id: "remove_skill_file",
        title: "Remove Skill File",
        risk: "side_effect",
        body: "# remove_skill_file\n\nRemove a non-root file from an uploaded skill pack. Root `SKILL.md` cannot be removed; update it instead.",
      },
      {
        id: "delete_skill_pack",
        title: "Delete Skill Pack",
        risk: "high",
        body: "# delete_skill_pack\n\nDelete one uploaded custom skill pack. Generated skill packs cannot be deleted.",
      },
    ];
    const rootContent = [
      "---",
      "name: skill-editor",
      "description: Tools for creating and editing uploaded custom skills.",
      "---",
      "",
      "# Skill Editor",
      "",
      "This skill lets the agent manage uploaded custom skills. It cannot modify generated system skills.",
      "",
      "## Procedure",
      "",
      "1. Use `list_skill_packs` and `read_skill_pack` before editing.",
      "2. Use `upsert_skill_pack` for package-level changes.",
      "3. Use `upsert_skill_file` for small file-level edits.",
      "4. Do not store API keys, bot tokens, or MCP header values in skill files.",
      "5. Keep skills concise and directory-like: root `SKILL.md`, then focused reference files.",
      "",
      "## Tool Files",
      "",
      ...toolDocs.map((tool) => `- \`tools/${tool.id}.md\` - ${tool.title}`),
    ].join("\n");
    return {
      key: "skill-editor",
      label: "Skill Editor",
      category: "utility",
      description: "Generated skill for creating and editing uploaded custom skills.",
      tool_count: toolDocs.length,
      tools: toolDocs.map((tool) => ({
        id: tool.id,
        name: tool.title,
        description: `Agent tool: ${tool.title}`,
        category: "utility",
        risk_level: tool.risk,
        side_effects: tool.risk !== "safe",
        allow_network: false,
      })),
      tool_ids: toolDocs.map((tool) => tool.id),
      files: [
        {
          path: "skill-editor/SKILL.md",
          kind: "root",
          title: "Skill Editor",
          content_md: rootContent,
          source: "generated",
        },
        ...toolDocs.map((tool) => ({
          path: `skill-editor/tools/${tool.id}.md`,
          kind: "tool",
          category: "utility",
          tool_id: tool.id,
          title: tool.title,
          content_md: tool.body,
          source: "generated",
        })),
      ],
      content_md: rootContent,
      format: "markdown",
      source: "generated",
    };
  }

  private normalizeCustomSkillPack(
    payload: unknown,
    existing: CustomSkillPack | undefined,
    actionIds: Set<string>,
    reservedPackKeys: Set<string>
  ): { pack?: CustomSkillPack; error?: string; details?: unknown } {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { error: "skill pack must be an object" };
    }
    const body = payload as Record<string, unknown>;
    const directContentMd = this.getSkillMarkdownFromPayload(body);
    const fileRootContent = Array.isArray(body.files)
      ? body.files
          .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .find((entry) => {
            const path = this.sanitizeSkillRelativePath(entry.path || entry.filename || entry.name);
            return path === "SKILL.md" || path.endsWith("/SKILL.md");
          })
      : null;
    const contentMd = directContentMd || String(fileRootContent?.content_md ?? fileRootContent?.markdown ?? fileRootContent?.content ?? fileRootContent?.md ?? "").trim();
    if (contentMd.length > 256 * 1024) {
      return { error: "skill markdown is too large; maximum is 256KB" };
    }
    const markdownMeta = contentMd ? this.parseSkillMarkdownFrontmatter(contentMd) : {};
    const markdownTitle = contentMd ? this.extractSkillMarkdownTitle(contentMd) : "";
    const markdownDescription = contentMd ? this.extractSkillMarkdownDescription(contentMd) : "";
    const rawKey =
      body.key ||
      markdownMeta.key ||
      body.id ||
      body.name ||
      body.label ||
      markdownTitle ||
      body.filename;
    const key = this.normalizeSkillPackKey(rawKey);
    if (!key) {
      return { error: "skill pack key is required" };
    }
    if (reservedPackKeys.has(key)) {
      return { error: `skill pack key is reserved by generated pack: ${key}` };
    }

    const explicitToolIds = this.extractSkillToolIds(body);
    const markdownToolIds = this.extractSkillToolIds(markdownMeta);
    const toolIds = explicitToolIds.length > 0 ? explicitToolIds : markdownToolIds;
    if (toolIds.length > 100) {
      return { error: "tool_ids is too large; maximum is 100" };
    }
    const unknownToolIds = toolIds.filter((id) => !actionIds.has(id));
    if (unknownToolIds.length > 0) {
      return {
        error: "skill pack references unknown node ids",
        details: { unknown_tool_ids: unknownToolIds },
      };
    }

    const now = Date.now();
    const label = String(body.label || markdownMeta.label || body.name || markdownTitle || existing?.label || key).trim() || key;
    const category = String(body.category || markdownMeta.category || existing?.category || "custom").trim() || "custom";
    const description = String(
      body.description ||
        markdownMeta.description ||
        markdownDescription ||
        existing?.description ||
        ""
    ).trim();
    const rootContent = contentMd || existing?.content_md || this.buildSkillMarkdownDocument({
      key,
      label,
      category,
      description,
      tools: toolIds.map((id) => ({ id, name: id })),
    });
    const collectedFiles = this.collectSkillFilesFromPayload(key, body, rootContent, now);
    if (collectedFiles.error) {
      return collectedFiles;
    }
    return {
      pack: {
        key,
        label,
        category,
        description,
        tool_ids: toolIds,
        content_md: rootContent,
        files: collectedFiles.files || this.ensureRootCustomSkillFile(key, existing?.files || [], rootContent, now),
        filename: typeof body.filename === "string" ? body.filename : existing?.filename,
        created_at: existing?.created_at || now,
        updated_at: now,
      },
    };
  }

  private async handleSkillPackUpload(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      const contentType = request.headers.get("Content-Type") || "";
      if (contentType.includes("text/markdown") || contentType.includes("text/plain")) {
        payload = { content_md: await request.text() };
      } else {
        payload = await parseJson<unknown>(request);
      }
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }

    const state = await this.loadState();
    const actions = await this.buildModularActionList(state);
    const actionIds = new Set(actions.map((action) => action.id));
    const reservedPackKeys = new Set(this.buildGeneratedSkillPacks(actions, state).map((pack) => pack.key));
    const existing = await this.loadCustomSkillPacks();
    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(body.skills)
        ? body.skills
        : Array.isArray(body.skill_packs)
          ? body.skill_packs
          : [payload];

    const next = { ...existing };
    const saved: CustomSkillPack[] = [];
    for (const entry of entries) {
      const rawKey =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? this.normalizeSkillPackKey(
              (entry as Record<string, unknown>).key ||
                (entry as Record<string, unknown>).id ||
                (entry as Record<string, unknown>).name ||
                (entry as Record<string, unknown>).label
            )
          : "";
      const normalized = this.normalizeCustomSkillPack(
        entry,
        rawKey ? existing[rawKey] : undefined,
        actionIds,
        reservedPackKeys
      );
      if (normalized.error || !normalized.pack) {
        return jsonResponse(
          {
            error: normalized.error || "invalid skill pack",
            details: normalized.details,
          },
          400
        );
      }
      next[normalized.pack.key] = normalized.pack;
      saved.push(normalized.pack);
    }

    await this.saveCustomSkillPacks(next);
    return jsonResponse({
      status: "ok",
      saved,
      categories: this.buildActionCategories(actions),
      custom_skill_packs: Object.values(next),
      skill_packs: this.buildSkillPacks(actions, next, state),
    });
  }

  private async handleSkillPackDelete(skillKey: string): Promise<Response> {
    const key = this.normalizeSkillPackKey(skillKey);
    if (!key) {
      return jsonResponse({ error: "missing skill key" }, 400);
    }
    const packs = await this.loadCustomSkillPacks();
    if (!packs[key]) {
      return jsonResponse({ error: `uploaded skill pack not found: ${key}` }, 404);
    }
    delete packs[key];
    await this.saveCustomSkillPacks(packs);

    const state = await this.loadState();
    const actions = await this.buildModularActionList(state);
    return jsonResponse({
      status: "ok",
      deleted_key: key,
      categories: this.buildActionCategories(actions),
      custom_skill_packs: Object.values(packs),
      skill_packs: this.buildSkillPacks(actions, packs, state),
    });
  }

  private async buildModularActionList(state: ButtonsModel) {
    const actions: ModularActionDefinition[] = Object.values(BUILTIN_MODULAR_ACTIONS);
    const dynamicOptions = this.buildDynamicOptions(state, await this.loadLlmConfig());

    return actions.map((action) => {
      const inputs = action.inputs.map((input) => {
        const copy = { ...input };
        if (copy.options_source) {
          copy.options = dynamicOptions[copy.options_source] || [];
        }
        return copy;
      });
      const { id, name, description, outputs } = action;
      return {
        ...action,
        id,
        name,
        description,
        inputs,
        outputs,
        filename: `${action.id}.ts`,
      };
    });
  }

  private buildActionCategories(actions: Array<ModularActionDefinition & Record<string, unknown>>) {
    const categories = new Map<string, { key: string; label: string; count: number; order: number }>();
    for (const action of actions) {
      const key = String(action.category || action.ui?.group || "utility").trim() || "utility";
      const existing = categories.get(key);
      const order = Number(action.ui?.order);
      const resolvedOrder = Number.isFinite(order) ? order : getNodeCategoryPriority(key) * 1000;
      if (existing) {
        existing.count += 1;
        existing.order = Math.min(existing.order, resolvedOrder);
        continue;
      }
      categories.set(key, {
        key,
        label: key,
        count: 1,
        order: resolvedOrder,
      });
    }
    return Array.from(categories.values()).sort((a, b) => {
      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;
      return a.key.localeCompare(b.key);
    });
  }

  private buildSkillTool(action: ModularActionDefinition & Record<string, unknown>) {
    const category = String(action.category || action.ui?.group || "utility").trim() || "utility";
    const runtime = (action.runtime || {}) as Record<string, unknown>;
    const inputs = Array.isArray(action.inputs) ? action.inputs : [];
    const outputs = Array.isArray(action.outputs) ? action.outputs : [];
    return {
      id: action.id,
      name: action.name || action.id,
      description: action.description || "",
      category,
      risk_level: this.inferToolRiskLevel(action),
      side_effects: Boolean(runtime.sideEffects),
      allow_network: Boolean(runtime.allowNetwork),
      input_schema: {
        type: "object",
        properties: Object.fromEntries(
          inputs.map((input) => [
            input.name,
            {
              type: this.mapNodeInputTypeToJsonSchema(input.type),
              description: input.description || "",
              enum: input.enum || undefined,
              default: input.default,
            },
          ])
        ),
        required: inputs.filter((input) => input.required).map((input) => input.name),
      },
      outputs: outputs.map((output) => ({
        name: output.name,
        type: output.type,
        description: output.description || "",
      })),
    };
  }

  private buildGeneratedSkillPacks(actions: Array<ModularActionDefinition & Record<string, unknown>>, state?: ButtonsModel) {
    const groupedTools = new Map<string, Array<Record<string, unknown>>>();
    const tools: Array<Record<string, unknown>> = [];

    for (const action of actions) {
      const category = String(action.category || action.ui?.group || "utility").trim() || "utility";
      const tool = this.buildSkillTool(action);
      tools.push(tool);
      groupedTools.set(category, [...(groupedTools.get(category) || []), tool]);
    }

    const categoryGroups = Array.from(groupedTools.entries())
      .map(([key, groupTools]) => ({
        key,
        tools: groupTools.sort((a, b) => String(a.id || "").localeCompare(String(b.id || ""))),
      }))
      .sort((a, b) => {
        const orderDiff = getNodeCategoryPriority(a.key) - getNodeCategoryPriority(b.key);
        if (orderDiff !== 0) return orderDiff;
        return a.key.localeCompare(b.key);
      });
    const sortedTools = tools.sort((a, b) => {
      const categoryDiff =
        getNodeCategoryPriority(String(a.category || "utility")) -
        getNodeCategoryPriority(String(b.category || "utility"));
      if (categoryDiff !== 0) return categoryDiff;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    const rootContent = this.buildWorkflowNodesSkillMarkdown(categoryGroups);
    const files = [
      {
        path: "workflow-nodes/SKILL.md",
        kind: "root",
        title: "Workflow Node Tools",
        content_md: rootContent,
        source: "generated",
      },
      ...categoryGroups.map((group) => ({
        path: `workflow-nodes/${group.key}/SKILL.md`,
        kind: "category",
        category: group.key,
        title: `${group.key} category`,
        content_md: this.buildCategorySkillMarkdown(group.key, group.tools),
        source: "generated",
      })),
      ...categoryGroups.flatMap((group) =>
        group.tools.map((tool) => {
          const id = String(tool.id || "").trim();
          return {
            path: `workflow-nodes/${group.key}/${id}.md`,
            kind: "tool",
            category: group.key,
            tool_id: id,
            title: String(tool.name || id),
            content_md: this.buildNodeToolMarkdown(tool),
            source: "generated",
          };
        })
      ),
    ];

    return [
      {
        key: "workflow-nodes",
        label: "Workflow Node Tools",
        category: "workflow",
        description: "Root skill directory for all workflow node tools.",
        tool_count: sortedTools.length,
        tools: sortedTools,
        tool_ids: sortedTools.map((tool) => String(tool.id || "")).filter(Boolean),
        virtual_folders: categoryGroups.map((group) => ({
          path: `workflow-nodes/${group.key}`,
          category: group.key,
          tool_ids: group.tools.map((tool) => String(tool.id || "")).filter(Boolean),
        })),
        files,
        content_md: rootContent,
        format: "markdown",
        source: "generated",
      },
      this.buildWorkflowManagementSkillPack(state),
      this.buildWorkflowEditorSkillPack(),
      this.buildMcpToolsSkillPack(),
      this.buildSkillEditorSkillPack(),
    ];
  }

  private buildSkillPacks(
    actions: Array<ModularActionDefinition & Record<string, unknown>>,
    customPacks: Record<string, CustomSkillPack> = {},
    state?: ButtonsModel
  ) {
    const generated = this.buildGeneratedSkillPacks(actions, state);
    const generatedKeys = new Set(generated.map((pack) => pack.key));
    const actionMap = new Map(actions.map((action) => [action.id, action]));
    const uploaded = Object.values(customPacks)
      .filter((pack) => !generatedKeys.has(pack.key))
      .map((pack) => {
        const selectedActions = pack.tool_ids
          .map((toolId) => actionMap.get(toolId))
          .filter((action): action is ModularActionDefinition & Record<string, unknown> => Boolean(action));
        const contentMd = pack.content_md || this.buildSkillMarkdownDocument({
          key: pack.key,
          label: pack.label,
          category: pack.category,
          description: pack.description,
          tools: selectedActions.map((action) => this.buildSkillTool(action)),
        });
        const files = this.ensureRootCustomSkillFile(pack.key, pack.files || [], contentMd, pack.updated_at);
        return {
          key: pack.key,
          label: pack.label,
          category: pack.category,
          description: pack.description || `Uploaded skill pack: ${pack.label}`,
          tool_count: selectedActions.length,
          tools: selectedActions.map((action) => this.buildSkillTool(action)),
          tool_ids: selectedActions.map((action) => action.id),
          content_md: contentMd,
          files: files.map((file) => ({
            path: file.path,
            kind: file.kind || (file.path.endsWith("/SKILL.md") ? "root" : "reference"),
            title: file.title || (file.path.endsWith("/SKILL.md") ? pack.label : undefined),
            category: file.category || pack.category,
            tool_id: file.tool_id,
            content_md: file.content_md,
            content_type: file.content_type || "text/markdown",
            source: "uploaded",
          })),
          filename: pack.filename,
          format: "markdown",
          custom: true,
          source: "uploaded",
          created_at: pack.created_at,
          updated_at: pack.updated_at,
        };
      })
      .filter((pack): pack is NonNullable<typeof pack> => Boolean(pack));

    return [...generated, ...uploaded].sort((a, b) => {
      const orderDiff = getNodeCategoryPriority(a.category) - getNodeCategoryPriority(b.category);
      if (orderDiff !== 0) return orderDiff;
      const sourceDiff = Number(Boolean((a as Record<string, unknown>).custom)) - Number(Boolean((b as Record<string, unknown>).custom));
      if (sourceDiff !== 0) return sourceDiff;
      return a.key.localeCompare(b.key);
    });
  }

  private inferToolRiskLevel(action: ModularActionDefinition): string {
    const runtime = action.runtime || {};
    const category = String(action.category || action.ui?.group || "").toLowerCase();
    const actionId = String(action.id || "").toLowerCase();
    if (category === "telegram" && /(ban|unban|promote|restrict|pin|invoice|payment|shipping|pre_checkout)/.test(actionId)) {
      return "high";
    }
    if (runtime.sideEffects) {
      return "side_effect";
    }
    if (runtime.allowNetwork) {
      return "network";
    }
    return "safe";
  }

  private mapNodeInputTypeToJsonSchema(type: string): string {
    const normalized = String(type || "").toLowerCase();
    if (["integer", "number"].includes(normalized)) return "number";
    if (["boolean", "bool"].includes(normalized)) return "boolean";
    if (["array", "list"].includes(normalized)) return "array";
    if (["object", "record", "json"].includes(normalized)) return "object";
    return "string";
  }

  private buildDynamicOptions(state: ButtonsModel, llmConfig?: LlmConfig) {
    const menus = Object.values(state.menus || {}).map((menu) => {
      const label = menu.name && menu.name !== menu.id ? `${menu.name} (${menu.id})` : menu.id;
      return { value: menu.id, label };
    });

    const buttonLabels: Record<string, string[]> = {};
    for (const menu of Object.values(state.menus || {})) {
      const menuName = menu.name || menu.id;
      for (const btnId of menu.items || []) {
        const button = state.buttons?.[btnId];
        if (!button) {
          continue;
        }
        const buttonTitle = button.text || button.id;
        buttonLabels[btnId] = buttonLabels[btnId] || [];
        buttonLabels[btnId].push(`${menuName}-${buttonTitle}`);
      }
    }

    const buttons = Object.values(state.buttons || {}).map((button) => {
      const labels = buttonLabels[button.id];
      let label: string;
      if (labels && labels.length) {
        label = Array.from(new Set(labels)).join(" / ");
      } else {
        const buttonTitle = button.text || button.id;
        label = `未分配${buttonTitle}`;
      }
      return { value: button.id, label };
    });

    const webApps = Object.values(state.web_apps || {}).map((app) => {
      const label = app.name && app.name !== app.id ? `${app.name} (${app.id})` : app.id;
      return { value: app.id, label };
    });

    const localActions = Object.values(state.actions || {}).map((action) => {
      const label = action.name && action.name !== action.id ? `${action.name} (${action.kind})` : action.name;
      return { value: action.id, label };
    });

    const workflows = Object.values(state.workflows || {}).map((workflow) => {
      const label = workflow.name && workflow.name !== workflow.id ? `${workflow.name} (${workflow.id})` : workflow.id;
      return { value: workflow.id, label };
    });

    const llmModels = Object.values(llmConfig?.models || {})
      .filter((model) => model.enabled && llmConfig?.providers?.[model.provider_id]?.enabled !== false)
      .map((model) => {
        const provider = llmConfig?.providers?.[model.provider_id];
        const providerName = provider?.name || model.provider_id;
        const modelName = model.name || model.model;
        return {
          value: model.id,
          label: `${providerName} / ${modelName}`,
        };
      });

    return {
      menus,
      buttons,
      web_apps: webApps,
      local_actions: localActions,
      workflows,
      llm_models: llmModels,
    } as Record<string, { value: string; label: string }[]>;
  }

  private getTriggerIndex(state: ButtonsModel): TriggerIndex {
    const built = this.buildTriggerIndex(state);
    if (this.triggerIndexCache && this.triggerIndexCache.signature === built.signature) {
      return this.triggerIndexCache.index;
    }
    this.triggerIndexCache = { signature: built.signature, index: built.index };
    return built.index;
  }

  private buildTriggerIndex(state: ButtonsModel): { signature: string; index: TriggerIndex } {
    const index: TriggerIndex = {
      byCommand: new Map<string, TriggerEntry[]>(),
      byButton: new Map<string, TriggerEntry[]>(),
      byKeyword: [],
    };

    let hash = 2166136261;
    const updateHash = (value: string) => {
      hash = fnv1aUpdate(hash, value);
    };

    const workflows = state.workflows || {};
    for (const [workflowId, workflow] of Object.entries(workflows)) {
      const nodes = (workflow as any)?.nodes || {};
      for (const [nodeId, node] of Object.entries(nodes as Record<string, any>)) {
        const actionId = String(node?.action_id || "");
        if (!actionId.startsWith("trigger_")) {
          continue;
        }

        const data = (node?.data || {}) as Record<string, unknown>;
        const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
        const priorityRaw = Number(data.priority);
        const priority = Number.isFinite(priorityRaw) ? priorityRaw : this.defaultTriggerPriority(actionId);

        if (actionId === "trigger_command") {
          const command = normalizeTelegramCommandName(String(data.command || ""));
          if (!command) {
            continue;
          }
          const argsMode = String(data.args_mode || "auto").trim().toLowerCase();
          const entry: TriggerEntry = {
            type: "command",
            workflow_id: workflowId,
            node_id: String(nodeId),
            priority,
            enabled,
            config: { command, args_mode: argsMode },
          };
          const list = index.byCommand.get(command) || [];
          list.push(entry);
          index.byCommand.set(command, list);

          updateHash(`c|${workflowId}|${nodeId}|${enabled ? 1 : 0}|${priority}|${command}|${argsMode}`);
          continue;
        }

        if (actionId === "trigger_keyword") {
          const keywords = String(data.keywords || "").trim();
          if (!keywords) {
            continue;
          }
          const matchMode = String(data.match_mode || "contains").trim();
          const caseSensitive = Boolean(data.case_sensitive);
          const entry: TriggerEntry = {
            type: "keyword",
            workflow_id: workflowId,
            node_id: String(nodeId),
            priority,
            enabled,
            config: { keywords, match_mode: matchMode, case_sensitive: caseSensitive },
          };
          index.byKeyword.push(entry);

          updateHash(`k|${workflowId}|${nodeId}|${enabled ? 1 : 0}|${priority}|${keywords}|${matchMode}|${caseSensitive ? 1 : 0}`);
          continue;
        }

        if (actionId === "trigger_button") {
          const rawButtonId = String((data.button_id ?? data.target_button_id) || "").trim();
          const buttonId = normalizeButtonIdFromTriggerConfig(rawButtonId);
          if (!buttonId) {
            continue;
          }
          const rawMenuId = String(data.menu_id || "").trim();
          const menuId = rawMenuId.includes("{{") ? "" : rawMenuId;
          const entry: TriggerEntry = {
            type: "button",
            workflow_id: workflowId,
            node_id: String(nodeId),
            priority,
            enabled,
            config: { button_id: buttonId, menu_id: menuId },
          };
          const list = index.byButton.get(buttonId) || [];
          list.push(entry);
          index.byButton.set(buttonId, list);

          updateHash(`b|${workflowId}|${nodeId}|${enabled ? 1 : 0}|${priority}|${rawButtonId}|${buttonId}|${rawMenuId}|${menuId}`);
          continue;
        }
      }
    }

    const signature = `${state.version || 0}:${hash >>> 0}`;
    return { signature, index };
  }

  private defaultTriggerPriority(actionId: string): number {
    if (actionId === "trigger_keyword") {
      return 50;
    }
    if (actionId === "trigger_message") {
      return 10;
    }
    return 100;
  }

  private buildWorkflowTestTriggerCandidates(
    workflow: WorkflowDefinition,
    triggerMode: string,
    triggerNodeId: string
  ): WorkflowTestTriggerMatch[] {
    if (!triggerMode || triggerMode === "workflow") {
      return [];
    }
    const actionId = `trigger_${triggerMode}`;
    const nodes = (workflow.nodes || {}) as Record<string, any>;
    const candidates: WorkflowTestTriggerMatch[] = [];
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (String(node?.action_id || "") !== actionId) {
        continue;
      }
      if (triggerNodeId && String(nodeId) !== triggerNodeId) {
        continue;
      }
      const data = (node?.data || {}) as Record<string, unknown>;
      const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
      if (!enabled) {
        continue;
      }
      const priorityRaw = Number(data.priority);
      const priority = Number.isFinite(priorityRaw) ? priorityRaw : this.defaultTriggerPriority(actionId);
      candidates.push({
        type: triggerMode,
        node_id: String(nodeId),
        priority,
        config: { ...data },
      });
    }
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates;
  }

  private extractWorkflowForTrigger(workflow: WorkflowDefinition, entryNodeId: string): WorkflowDefinition {
    const nodes = workflow.nodes || {};
    const edges = workflow.edges || [];
    if (!entryNodeId || !nodes[entryNodeId]) {
      return workflow;
    }

    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const edge of edges) {
      const src = edge.source_node;
      const dst = edge.target_node;
      if (!outgoing.has(src)) {
        outgoing.set(src, []);
      }
      outgoing.get(src)!.push(dst);
      if (!incoming.has(dst)) {
        incoming.set(dst, []);
      }
      incoming.get(dst)!.push(src);
    }

    const isTriggerNode = (nodeId: string) => {
      const actionId = String(nodes[nodeId]?.action_id || "");
      return actionId.startsWith("trigger_");
    };

    const forward = new Set<string>();
    const queue: string[] = [entryNodeId];
    forward.add(entryNodeId);
    while (queue.length) {
      const current = queue.shift() as string;
      const next = outgoing.get(current) || [];
      for (const target of next) {
        if (forward.has(target)) {
          continue;
        }
        if (target !== entryNodeId && isTriggerNode(target)) {
          continue;
        }
        forward.add(target);
        queue.push(target);
      }
    }

    const closure = new Set<string>(forward);
    const backQueue: string[] = Array.from(forward);
    while (backQueue.length) {
      const current = backQueue.shift() as string;
      const prev = incoming.get(current) || [];
      for (const source of prev) {
        if (closure.has(source)) {
          continue;
        }
        if (source !== entryNodeId && isTriggerNode(source)) {
          continue;
        }
        closure.add(source);
        backQueue.push(source);
      }
    }

    const newNodes: Record<string, any> = {};
    for (const nodeId of closure) {
      if (nodes[nodeId]) {
        newNodes[nodeId] = nodes[nodeId];
      }
    }
    const newEdges = edges.filter((edge) => closure.has(edge.source_node) && closure.has(edge.target_node));

    return {
      ...workflow,
      nodes: newNodes as any,
      edges: newEdges,
    };
  }

  private async handleActionTest(request: Request): Promise<Response> {
    try {
      const payload = await parseJson<Record<string, unknown>>(request);
      const preview = Boolean(payload.preview);
      const state = await this.loadState();
      const actionPayload = payload.action as Record<string, unknown> | undefined;
      const actionId = payload.action_id as string | undefined;

      let action = actionPayload as any;
      if (!action && actionId) {
        const found = state.actions?.[actionId];
        if (!found) {
          return jsonResponse({ error: `action not found: ${actionId}` }, 404);
        }
        action = found;
      }
      if (!action) {
        return jsonResponse({ error: "missing action definition" }, 400);
      }

      const buttonPayload = payload.button as Record<string, unknown> | undefined;
      const buttonId = payload.button_id as string | undefined;
      let button = buttonPayload as any;
      if (!button && buttonId) {
        const found = state.buttons?.[buttonId];
        if (!found) {
          return jsonResponse({ error: `button not found: ${buttonId}` }, 404);
        }
        button = found;
      }
      if (!button) {
        button = {
          id: "test_button",
          text: "测试按钮",
          type: "action",
          payload: {},
        };
      }

      const menuPayload = payload.menu as Record<string, unknown> | undefined;
      const menuId = payload.menu_id as string | undefined;
      let menu = menuPayload as any;
      if (!menu && menuId) {
        const found = state.menus?.[menuId];
        if (!found) {
          return jsonResponse({ error: `menu not found: ${menuId}` }, 404);
        }
        menu = found;
      }
      if (!menu) {
        menu = {
          id: "test_menu",
          name: "测试菜单",
          items: [button.id],
          header: "测试",
        };
      }

      const runtimePayload = (payload.runtime || {}) as Record<string, unknown>;
      const runtime = buildRuntimeContext(runtimePayload, menuId || null);

      const result = await executeActionPreview({
        env: await this.getExecutionEnv(),
        state,
        action,
        button,
        menu,
        runtime,
        preview,
      });

      return jsonResponse({
        success: result.success,
        should_edit_message: result.should_edit_message || false,
        new_text: result.new_text || null,
        parse_mode: result.parse_mode || null,
        next_menu_id: result.next_menu_id || null,
        error: result.error || null,
        data: result.data || {},
        notification: result.notification || null,
        button_overrides: result.button_overrides || [],
        button_title: result.button_title || null,
        pending: result.pending || null,
      });
    } catch (error) {
      return jsonResponse({ error: `action test failed: ${String(error)}` }, 500);
    }
  }

  private observabilityConfigKey(): string {
    return "obs:config";
  }

  private async handleWorkflowAnalyze(workflowId: string): Promise<Response> {
    const id = String(workflowId || "").trim();
    if (!id) {
      return jsonResponse({ error: "missing workflow_id" }, 400);
    }
    const state = await this.loadState();
    const workflow = state.workflows?.[id];
    if (!workflow) {
      return jsonResponse({ error: `workflow not found: ${id}` }, 404);
    }
    const report = analyzeWorkflowExecutionPlan(workflow);
    return jsonResponse({ status: "ok", workflow_id: id, report });
  }

  private async handleWorkflowTest(workflowId: string, request: Request): Promise<Response> {
    const id = String(workflowId || "").trim();
    if (!id) {
      return jsonResponse({ error: "missing workflow_id" }, 400);
    }

    const state = await this.loadState();
    const workflow = state.workflows?.[id];
    if (!workflow) {
      return jsonResponse({ error: `workflow not found: ${id}` }, 404);
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJson<Record<string, unknown>>(request).catch(() => ({}));
    } catch {
      payload = {};
    }

    const preview = payload.preview === undefined ? true : Boolean(payload.preview);
    const modeRaw = String(payload.trigger_mode || "workflow").trim().toLowerCase();
    const triggerMode: WorkflowTestMode = modeRaw || "workflow";
    if (triggerMode !== "workflow" && !/^[a-z][a-z0-9_]*$/.test(triggerMode)) {
      return jsonResponse({ error: `invalid trigger_mode: ${modeRaw}` }, 400);
    }

    const runtimeInput = (payload.runtime || {}) as Partial<RuntimeContext>;
    const runtime = buildRuntimeContext(
      {
        chat_id: runtimeInput.chat_id || "0",
        chat_type: runtimeInput.chat_type,
        message_id: runtimeInput.message_id,
        thread_id: runtimeInput.thread_id,
        user_id: runtimeInput.user_id || "0",
        username: runtimeInput.username,
        full_name: runtimeInput.full_name,
        callback_data: runtimeInput.callback_data,
        variables: runtimeInput.variables || {},
      },
      String((runtimeInput.variables as any)?.menu_id || "root")
    );

    const rootMenu = (state.menus?.root as Record<string, unknown>) || {
      id: "root",
      name: "root",
      header: "请选择功能",
      items: [],
    };
    let testWorkflow: WorkflowDefinition = workflow;
    let button: Record<string, unknown> = {
      id: "workflow_test_button",
      text: "workflow_test",
      type: "workflow",
      payload: { workflow_id: id },
    };
    let menu: Record<string, unknown> = rootMenu;
    let triggerType = String(payload.trigger_type || "workflow_test").trim() || "workflow_test";
    let trigger: unknown =
      payload.trigger !== undefined
        ? payload.trigger
        : {
            type: "workflow_test",
            workflow_id: id,
            timestamp: Math.floor(Date.now() / 1000),
            source: "webui",
          };
    let triggerMatch: WorkflowTestTriggerMatch | null = null;
    let triggerCandidates = 0;

    if (triggerMode !== "workflow") {
      const triggerNodeId = String(payload.trigger_node_id || "").trim();
      const nowSec = Math.floor(Date.now() / 1000);

      if (triggerMode === "command") {
        const index = this.getTriggerIndex(state);
        const commandTextRaw = String(payload.command_text || payload.command || "").trim();
        if (!commandTextRaw) {
          return jsonResponse({ error: "missing command_text for command trigger test" }, 400);
        }
        const commandText = commandTextRaw.startsWith("/") ? commandTextRaw : `/${commandTextRaw}`;
        const firstToken = commandText.split(/\s+/, 1)[0];
        const commandName = normalizeTelegramCommandName(firstToken);
        if (!commandName) {
          return jsonResponse({ error: `invalid command text: ${commandText}` }, 400);
        }

        let candidates = (index.byCommand.get(commandName) || [])
          .filter((entry) => entry.workflow_id === id)
          .filter((entry) => entry.enabled);
        if (triggerNodeId) {
          candidates = candidates.filter((entry) => entry.node_id === triggerNodeId);
        }
        triggerCandidates = candidates.length;
        if (!candidates.length) {
          return jsonResponse({ error: `no command trigger matched: ${commandName}` }, 400);
        }
        candidates.sort((a, b) => b.priority - a.priority);
        const matchedEntry = candidates[0];
        triggerMatch = {
          type: matchedEntry.type,
          node_id: matchedEntry.node_id,
          priority: matchedEntry.priority,
          config: { ...matchedEntry.config },
        };

        const rest = commandText.slice(firstToken.length).trim();
        const argsModeRaw = String(matchedEntry.config.args_mode || "auto").toLowerCase();
        const argsMode: CommandArgMode = ["auto", "text", "kv", "json"].includes(argsModeRaw)
          ? (argsModeRaw as CommandArgMode)
          : "auto";
        const parsed = parseCommandArgs(rest, argsMode, []);
        runtime.callback_data = commandText;
        runtime.variables = {
          ...(runtime.variables || {}),
          command: commandName,
          command_text: commandText,
          command_args: parsed.args,
          command_params: parsed.params,
        };

        triggerType = "command";
        trigger = {
          type: "command",
          node_id: matchedEntry.node_id,
          workflow_id: id,
          command: commandName,
          command_text: commandText,
          raw_args: rest,
          args: parsed,
          timestamp: nowSec,
          source: "workflow_test",
          raw_event: { message: { text: commandText } },
        };
        testWorkflow = this.extractWorkflowForTrigger(workflow, matchedEntry.node_id);
      } else if (triggerMode === "keyword") {
        const index = this.getTriggerIndex(state);
        const text = String(payload.message_text || payload.text || "").trim();
        if (!text) {
          return jsonResponse({ error: "missing message_text for keyword trigger test" }, 400);
        }

        let candidates = index.byKeyword
          .filter((entry) => entry.workflow_id === id)
          .filter((entry) => entry.enabled)
          .map((entry) => ({
            entry,
            matchedKeyword: this.matchKeywordTrigger(text, entry),
          }))
          .filter((item) => Boolean(item.matchedKeyword));
        if (triggerNodeId) {
          candidates = candidates.filter((item) => item.entry.node_id === triggerNodeId);
        }
        triggerCandidates = candidates.length;
        if (!candidates.length) {
          return jsonResponse({ error: `no keyword trigger matched text: ${text}` }, 400);
        }
        candidates.sort((a, b) => b.entry.priority - a.entry.priority);
        const chosen = candidates[0];
        const matchedEntry = chosen.entry;
        triggerMatch = {
          type: matchedEntry.type,
          node_id: matchedEntry.node_id,
          priority: matchedEntry.priority,
          config: { ...matchedEntry.config },
        };
        const matchedKeyword = String(chosen.matchedKeyword || "");

        runtime.callback_data = text;
        runtime.variables = {
          ...(runtime.variables || {}),
          text,
          matched_keyword: matchedKeyword,
        };

        triggerType = "keyword";
        trigger = {
          type: "keyword",
          node_id: matchedEntry.node_id,
          workflow_id: id,
          text,
          matched_keyword: matchedKeyword,
          timestamp: nowSec,
          source: "workflow_test",
          raw_event: { message: { text } },
        };
        testWorkflow = this.extractWorkflowForTrigger(workflow, matchedEntry.node_id);
      } else if (triggerMode === "button") {
        const index = this.getTriggerIndex(state);
        let buttonId = normalizeButtonIdFromTriggerConfig(String(payload.button_id || payload.target_button_id || ""));
        const callbackDataRaw = String(payload.callback_data || "").trim();
        if (!buttonId && callbackDataRaw) {
          buttonId = normalizeButtonIdFromTriggerConfig(callbackDataRaw);
        }

        let explicitMenuId = String(payload.menu_id || "").trim();
        if (!buttonId && triggerNodeId) {
          const node = (workflow.nodes?.[triggerNodeId] as any) || null;
          if (node && String(node.action_id || "") === "trigger_button") {
            buttonId = normalizeButtonIdFromTriggerConfig(String((node.data?.button_id ?? node.data?.target_button_id) || ""));
            if (!explicitMenuId) {
              const nodeMenuId = String(node.data?.menu_id || "").trim();
              if (nodeMenuId && !nodeMenuId.includes("{{")) {
                explicitMenuId = nodeMenuId;
              }
            }
          }
        }
        if (!buttonId) {
          for (const node of Object.values((workflow.nodes || {}) as Record<string, any>)) {
            if (String(node?.action_id || "") !== "trigger_button") {
              continue;
            }
            const fallback = normalizeButtonIdFromTriggerConfig(
              String((node?.data?.button_id ?? node?.data?.target_button_id) || "")
            );
            if (fallback) {
              buttonId = fallback;
              if (!explicitMenuId) {
                const nodeMenuId = String(node?.data?.menu_id || "").trim();
                if (nodeMenuId && !nodeMenuId.includes("{{")) {
                  explicitMenuId = nodeMenuId;
                }
              }
              break;
            }
          }
        }
        if (!buttonId) {
          return jsonResponse({ error: "missing button_id for button trigger test" }, 400);
        }

        let menuForRuntime: Record<string, unknown> | undefined =
          (explicitMenuId ? (state.menus?.[explicitMenuId] as Record<string, unknown> | undefined) : undefined) ||
          (findMenuForButton(state, buttonId) as Record<string, unknown> | undefined) ||
          rootMenu;
        const menuId = String((menuForRuntime as any)?.id || "root");

        let candidates = (index.byButton.get(buttonId) || [])
          .filter((entry) => entry.workflow_id === id)
          .filter((entry) => entry.enabled)
          .filter((entry) => {
            const requiredMenuId = String(entry.config.menu_id || "").trim();
            return !requiredMenuId || requiredMenuId === menuId;
          });
        if (triggerNodeId) {
          candidates = candidates.filter((entry) => entry.node_id === triggerNodeId);
        }
        triggerCandidates = candidates.length;
        if (!candidates.length) {
          return jsonResponse({ error: `no button trigger matched: ${buttonId}` }, 400);
        }
        candidates.sort((a, b) => b.priority - a.priority);
        const matchedEntry = candidates[0];
        triggerMatch = {
          type: matchedEntry.type,
          node_id: matchedEntry.node_id,
          priority: matchedEntry.priority,
          config: { ...matchedEntry.config },
        };

        button = (state.buttons?.[buttonId] as Record<string, unknown>) || {
          id: buttonId,
          text: buttonId,
          type: "workflow",
          payload: { workflow_id: id },
        };
        menuForRuntime = menuForRuntime || rootMenu;
        menu = menuForRuntime;

        const buttonType = String((button as any).type || "").toLowerCase();
        let defaultCallbackData = `${CALLBACK_PREFIX_ACTION}${buttonId}`;
        if (buttonType === "workflow") {
          defaultCallbackData = `${CALLBACK_PREFIX_WORKFLOW}${buttonId}`;
        } else if (buttonType === "command") {
          defaultCallbackData = `${CALLBACK_PREFIX_COMMAND}${buttonId}`;
        }
        const callbackData = callbackDataRaw || defaultCallbackData;
        runtime.callback_data = callbackData;
        runtime.variables = {
          ...(runtime.variables || {}),
          menu_id: String((menu as any)?.id || "root"),
          menu_name: String((menu as any)?.name || ""),
          button_id: String((button as any).id || buttonId),
          button_text: String((button as any).text || ""),
        };

        triggerType = "button";
        trigger = {
          type: "button",
          node_id: matchedEntry.node_id,
          workflow_id: id,
          button_id: buttonId,
          button_text: String((button as any).text || ""),
          callback_data: callbackData,
          timestamp: nowSec,
          source: "workflow_test",
          raw_event: { callback_query: { data: callbackData } },
        };
        testWorkflow = this.extractWorkflowForTrigger(workflow, matchedEntry.node_id);
      } else {
        const candidates = this.buildWorkflowTestTriggerCandidates(workflow, triggerMode, triggerNodeId);
        triggerCandidates = candidates.length;
        if (!candidates.length) {
          return jsonResponse({ error: `no ${triggerMode} trigger matched` }, 400);
        }
        triggerMatch = candidates[0];

        const callbackData = String(payload.callback_data || runtime.callback_data || "").trim();
        if (callbackData) {
          runtime.callback_data = callbackData;
        }
        runtime.variables = {
          ...(runtime.variables || {}),
          trigger_mode: triggerMode,
        };

        triggerType = triggerMode;
        const extraTriggerPayload =
          payload.trigger_payload && typeof payload.trigger_payload === "object"
            ? (payload.trigger_payload as Record<string, unknown>)
            : {};
        trigger = {
          ...extraTriggerPayload,
          type: triggerMode,
          node_id: triggerMatch.node_id,
          workflow_id: id,
          timestamp: nowSec,
          source: "workflow_test",
        };
        testWorkflow = this.extractWorkflowForTrigger(workflow, triggerMatch.node_id);
      }
    }

    runtime.variables = { ...(runtime.variables || {}), __trigger__: trigger };
    const analysis = analyzeWorkflowExecutionPlan(testWorkflow);

    const result = await this.executeWorkflowWithObservability({
      state,
      workflow: testWorkflow,
      runtime,
      button,
      menu,
      preview,
      trigger_type: triggerType,
      trigger,
    });

    const obsExecutionId =
      result.pending?.obs_execution_id || String((result as any).obs_execution_id || "").trim() || undefined;
    const trace = obsExecutionId ? await this.loadObservabilityExecution(obsExecutionId) : null;
    const config = await this.loadObservabilityConfig().catch(() => DEFAULT_OBSERVABILITY_CONFIG);

    return jsonResponse({
      status: "ok",
      workflow_id: id,
      workflow_name: workflow.name,
      preview,
      trigger_mode: triggerMode,
      trigger_match: triggerMatch
        ? {
            type: triggerMatch.type,
            node_id: triggerMatch.node_id,
            priority: triggerMatch.priority,
            config: triggerMatch.config,
          }
        : null,
      trigger_candidates: triggerCandidates,
      observability_enabled: config.enabled,
      obs_execution_id: obsExecutionId || null,
      analysis,
      result,
      trace: trace || null,
    });
  }

  private observabilityIndexKey(): string {
    return "obs:index";
  }

  private observabilityExecutionKey(execId: string): string {
    return `obs:exec:${execId}`;
  }

  private async loadObservabilityConfig(): Promise<ObservabilityConfig> {
    const stored = await this.state.storage.get<ObservabilityConfig>(this.observabilityConfigKey());
    return normalizeObservabilityConfig(stored || DEFAULT_OBSERVABILITY_CONFIG);
  }

  private async saveObservabilityConfig(config: ObservabilityConfig): Promise<void> {
    await this.state.storage.put(this.observabilityConfigKey(), config);
  }

  private normalizeObservabilitySummary(raw: unknown): ObsExecutionSummary | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const entry = raw as Record<string, unknown>;
    const id = String(entry.id || "").trim();
    const workflowId = String(entry.workflow_id || "").trim();
    if (!id || !workflowId) {
      return null;
    }
    const statusRaw = String(entry.status || "error").trim();
    const status: ObsExecutionStatus = ["success", "pending", "error"].includes(statusRaw)
      ? (statusRaw as ObsExecutionStatus)
      : "error";
    const startedAtRaw = Number(entry.started_at);
    const startedAt = Number.isFinite(startedAtRaw) ? Math.floor(startedAtRaw) : Date.now();
    const finishedAtRaw = Number(entry.finished_at);
    const durationRaw = Number(entry.duration_ms);
    return {
      id,
      workflow_id: workflowId,
      workflow_name: entry.workflow_name ? String(entry.workflow_name) : undefined,
      status,
      started_at: startedAt,
      finished_at: Number.isFinite(finishedAtRaw) ? Math.floor(finishedAtRaw) : undefined,
      duration_ms: Number.isFinite(durationRaw) ? Math.floor(durationRaw) : undefined,
      trigger_type: entry.trigger_type ? String(entry.trigger_type) : undefined,
      chat_id: entry.chat_id !== undefined && entry.chat_id !== null ? String(entry.chat_id) : undefined,
      user_id: entry.user_id !== undefined && entry.user_id !== null ? String(entry.user_id) : undefined,
      error: entry.error ? String(entry.error) : undefined,
      await_node_id: entry.await_node_id ? String(entry.await_node_id) : undefined,
    };
  }

  private async loadObservabilityIndex(): Promise<ObsExecutionSummary[]> {
    const stored = await this.state.storage.get<unknown>(this.observabilityIndexKey());
    const list = Array.isArray(stored)
      ? stored
      : stored && typeof stored === "object"
        ? Object.values(stored as Record<string, unknown>)
        : [];
    const normalized: ObsExecutionSummary[] = [];
    for (const item of list) {
      const summary = this.normalizeObservabilitySummary(item);
      if (summary) {
        normalized.push(summary);
      }
    }
    return normalized;
  }

  private async saveObservabilityIndex(index: ObsExecutionSummary[]): Promise<void> {
    await this.state.storage.put(this.observabilityIndexKey(), index);
  }

  private async loadObservabilityExecution(execId: string): Promise<ObsExecutionTrace | null> {
    return (await this.state.storage.get<ObsExecutionTrace>(this.observabilityExecutionKey(execId))) || null;
  }

  private async saveObservabilityExecution(trace: ObsExecutionTrace): Promise<void> {
    await this.state.storage.put(this.observabilityExecutionKey(trace.id), trace);
  }

  private async deleteObservabilityExecution(execId: string): Promise<void> {
    await this.state.storage.delete(this.observabilityExecutionKey(execId));
  }

  private async upsertObservabilitySummary(summary: ObsExecutionSummary, keep: number): Promise<void> {
    const existing = await this.loadObservabilityIndex();
    const next = existing.filter((entry) => entry && entry.id !== summary.id);
    next.unshift(summary);
    const keepCount = Math.min(Math.max(Math.floor(keep || DEFAULT_OBSERVABILITY_CONFIG.keep), 1), 500);
    const trimmed = next.slice(0, keepCount);
    const removed = next.slice(keepCount);
    await this.saveObservabilityIndex(trimmed);
    for (const entry of removed) {
      await this.deleteObservabilityExecution(entry.id);
    }
  }

  private buildObservabilityStats(entries: ObsExecutionSummary[]): ObsExecutionStats {
    const successCount = entries.filter((entry) => entry.status === "success").length;
    const errorCount = entries.filter((entry) => entry.status === "error").length;
    const pendingCount = entries.filter((entry) => entry.status === "pending").length;
    const completedCount = successCount + errorCount;
    const successRate = completedCount > 0 ? Number(((successCount / completedCount) * 100).toFixed(2)) : null;

    const durations = entries
      .map((entry) => Number(entry.duration_ms))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const avgDurationMs =
      durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;

    const now = Date.now();
    const last24Start = now - 24 * 60 * 60 * 1000;
    const prev24Start = now - 48 * 60 * 60 * 1000;
    const failuresLast24h = entries.filter((entry) => entry.status === "error" && entry.started_at >= last24Start).length;
    const failuresPrev24h = entries.filter(
      (entry) => entry.status === "error" && entry.started_at >= prev24Start && entry.started_at < last24Start
    ).length;
    const failureDelta = failuresLast24h - failuresPrev24h;
    const failureTrend: "up" | "down" | "flat" = failureDelta > 0 ? "up" : failureDelta < 0 ? "down" : "flat";

    return {
      scope_total: entries.length,
      success_count: successCount,
      error_count: errorCount,
      pending_count: pendingCount,
      success_rate: successRate,
      avg_duration_ms: avgDurationMs,
      failures_last_24h: failuresLast24h,
      failures_prev_24h: failuresPrev24h,
      failure_trend: failureTrend,
      failure_delta: failureDelta,
    };
  }

  private observabilityResultPayload(result: ActionExecutionResult): Record<string, unknown> {
    if (!result.pending) {
      return result as any;
    }
    return {
      ...result,
      pending: {
        workflow_id: result.pending.workflow_id,
        node_id: result.pending.node_id,
        await: result.pending.await,
        obs_execution_id: result.pending.obs_execution_id,
      },
    } as any;
  }

  private async executeWorkflowWithObservability(args: {
    state: ButtonsModel;
    workflow: WorkflowDefinition;
    runtime: RuntimeContext;
    button: Record<string, unknown>;
    menu: Record<string, unknown>;
    preview: boolean;
    resume?: ResumeState;
    obs_execution_id?: string;
    trigger_type?: string;
    trigger?: unknown;
  }): Promise<ActionExecutionResult> {
    let config = DEFAULT_OBSERVABILITY_CONFIG;
    try {
      config = await this.loadObservabilityConfig();
    } catch (error) {
      console.error("load observability config failed:", error);
    }

    let env: Record<string, unknown> = this.env as unknown as Record<string, unknown>;
    try {
      env = await this.getExecutionEnv();
    } catch (error) {
      console.error("resolve execution env failed:", error);
    }

    const execute = async (tracer?: ExecutionTracer): Promise<ActionExecutionResult> => {
      try {
        return await executeWorkflowWithResume(
          {
            env,
            state: args.state,
            button: args.button,
            menu: args.menu,
            runtime: args.runtime,
            preview: Boolean(args.preview),
            tracer,
          },
          args.workflow,
          args.resume
        );
      } catch (error) {
        return { success: false, error: String(error) };
      }
    };

    if (!config.enabled) {
      const plain = await execute();
      (plain as any).obs_execution_id = undefined;
      return plain;
    }

    const execId = args.obs_execution_id || generateId("run");
    let existing: ObsExecutionTrace | null = null;
    if (args.obs_execution_id) {
      try {
        existing = await this.loadObservabilityExecution(execId);
      } catch (error) {
        console.error("load observability execution failed:", error);
        existing = null;
      }
    }
    const startedAt = existing?.started_at ?? Date.now();

    const tracer = new ObsTraceCollector(config, existing?.nodes || []);
    const result = await execute(tracer);

    if (result.pending) {
      result.pending.obs_execution_id = execId;
    }

    const finishedAt = Date.now();
    const status: ObsExecutionStatus = result.pending ? "pending" : result.success ? "success" : "error";
    const error = status === "error" ? String(result.error || "error") : undefined;
    const duration = Math.max(0, finishedAt - startedAt);

    const safeSanitize = (value: unknown): unknown => {
      try {
        return sanitizeForObs(value);
      } catch {
        return "[Unserializable]";
      }
    };

    const nodes = tracer.getNodes();
    const latestErrorNode = [...nodes].reverse().find((node) => node.status === "error");
    let failureSnapshot: ObsFailureSnapshot | undefined;
    if (status === "error") {
      if (latestErrorNode) {
        failureSnapshot = {
          source: "node",
          node_id: latestErrorNode.node_id,
          action_id: latestErrorNode.action_id,
          action_kind: latestErrorNode.action_kind,
          node_status: latestErrorNode.status,
          error: String(latestErrorNode.error || error || "error"),
          at: Number.isFinite(latestErrorNode.finished_at) ? latestErrorNode.finished_at : finishedAt,
          rendered_params: config.include_inputs ? safeSanitize(latestErrorNode.rendered_params) : undefined,
          node_result: config.include_outputs ? safeSanitize(latestErrorNode.result) : undefined,
          runtime: config.include_runtime ? safeSanitize(args.runtime) : undefined,
          trigger: config.include_runtime ? safeSanitize(args.trigger) : undefined,
        };
      } else {
        failureSnapshot = {
          source: "workflow",
          error: String(error || "error"),
          at: finishedAt,
          runtime: config.include_runtime ? safeSanitize(args.runtime) : undefined,
          trigger: config.include_runtime ? safeSanitize(args.trigger) : undefined,
        };
      }
    }

    const trace: ObsExecutionTrace = {
      id: execId,
      workflow_id: args.workflow.id,
      workflow_name: args.workflow.name,
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: duration,
      trigger_type: args.trigger_type || undefined,
      trigger: config.include_runtime ? safeSanitize(args.trigger) : existing?.trigger,
      runtime: config.include_runtime ? safeSanitize(args.runtime) : existing?.runtime,
      nodes,
      final_result: config.include_outputs ? safeSanitize(this.observabilityResultPayload(result)) : undefined,
      error,
      await_node_id: result.pending ? result.pending.node_id : undefined,
      failure_snapshot: failureSnapshot,
    };

    const summary: ObsExecutionSummary = {
      id: execId,
      workflow_id: trace.workflow_id,
      workflow_name: trace.workflow_name,
      status: trace.status,
      started_at: trace.started_at,
      finished_at: trace.finished_at,
      duration_ms: trace.duration_ms,
      trigger_type: trace.trigger_type,
      chat_id: args.runtime.chat_id,
      user_id: args.runtime.user_id,
      error: trace.error,
      await_node_id: trace.await_node_id,
    };

    try {
      await this.saveObservabilityExecution(trace);
    } catch (error) {
      console.error("save observability execution failed:", error);
      // Storage can fail due to large payloads; retry with a slimmed trace.
      try {
        const slim: ObsExecutionTrace = {
          ...trace,
          trigger: undefined,
          runtime: undefined,
          final_result: undefined,
          failure_snapshot: trace.failure_snapshot
            ? {
                ...trace.failure_snapshot,
                runtime: undefined,
                trigger: undefined,
              }
            : undefined,
          nodes: trace.nodes.map((node) => ({
            ...node,
            rendered_params: undefined,
            result: undefined,
          })),
        };
        await this.saveObservabilityExecution(slim);
      } catch (retryError) {
        console.error("save observability execution retry failed:", retryError);
      }
    }

    try {
      await this.upsertObservabilitySummary(summary, config.keep);
    } catch (error) {
      console.error("save observability summary failed:", error);
    }

    (result as any).obs_execution_id = execId;
    return result;
  }

  private async handleObservabilityConfigUpdate(request: Request): Promise<Response> {
    let payload: Partial<ObservabilityConfig>;
    try {
      payload = await parseJson<Partial<ObservabilityConfig>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const nextConfig = normalizeObservabilityConfig(payload);
    await this.saveObservabilityConfig(nextConfig);
    return jsonResponse(nextConfig);
  }

  private async handleObservabilityExecutionsList(url: URL): Promise<Response> {
    const index = await this.loadObservabilityIndex();
    const workflowId = String(url.searchParams.get("workflow_id") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const limitRaw = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 500) : 100;

    let scoped = index;
    if (workflowId) {
      scoped = scoped.filter((entry) => entry.workflow_id === workflowId);
    }
    if (query) {
      scoped = scoped.filter((entry) => {
        return (
          String(entry.id || "").toLowerCase().includes(query) ||
          String(entry.workflow_id || "").toLowerCase().includes(query) ||
          String(entry.workflow_name || "").toLowerCase().includes(query) ||
          String(entry.error || "").toLowerCase().includes(query) ||
          String(entry.chat_id || "").toLowerCase().includes(query) ||
          String(entry.user_id || "").toLowerCase().includes(query)
        );
      });
    }

    const stats = this.buildObservabilityStats(scoped);
    let filtered = scoped;
    if (status && ["success", "error", "pending"].includes(status)) {
      filtered = filtered.filter((entry) => entry.status === (status as any));
    }

    const total = filtered.length;
    return jsonResponse({
      total,
      stats,
      executions: filtered.slice(0, limit),
    });
  }

  private async handleObservabilityExecutionsClear(): Promise<Response> {
    const index = await this.loadObservabilityIndex();
    for (const entry of index) {
      await this.deleteObservabilityExecution(entry.id);
    }
    await this.state.storage.delete(this.observabilityIndexKey());
    return jsonResponse({ status: "ok", cleared: index.length });
  }

  private async handleObservabilityExecutionGet(execId: string): Promise<Response> {
    const id = String(execId || "").trim();
    if (!id) {
      return jsonResponse({ error: "missing id" }, 400);
    }
    const trace = await this.loadObservabilityExecution(id);
    if (!trace) {
      return jsonResponse({ error: "not found" }, 404);
    }
    return jsonResponse(trace);
  }

  private async handleObservabilityExecutionDelete(execId: string): Promise<Response> {
    const id = String(execId || "").trim();
    if (!id) {
      return jsonResponse({ error: "missing id" }, 400);
    }
    await this.deleteObservabilityExecution(id);
    const index = await this.loadObservabilityIndex();
    const next = index.filter((entry) => entry.id !== id);
    await this.saveObservabilityIndex(next);
    return jsonResponse({ status: "ok", deleted_id: id });
  }

  private getWebhookRateLimitConfig(): { limitPerWindow: number; windowMs: number } {
    const limitRaw = Number(this.env.WEBHOOK_RATE_LIMIT_PER_MINUTE || 60);
    const windowRaw = Number(this.env.WEBHOOK_RATE_LIMIT_WINDOW_SECONDS || 60);
    const limitPerWindow = Number.isFinite(limitRaw) ? Math.max(0, Math.floor(limitRaw)) : 60;
    const windowSeconds = Number.isFinite(windowRaw) ? Math.max(1, Math.floor(windowRaw)) : 60;
    return {
      limitPerWindow,
      windowMs: windowSeconds * 1000,
    };
  }

  private extractWebhookClientIp(request: Request): string {
    const cfIp = String(request.headers.get("CF-Connecting-IP") || "").trim();
    if (cfIp) {
      return cfIp;
    }
    const forwarded = String(request.headers.get("X-Forwarded-For") || "").trim();
    if (forwarded) {
      return forwarded.split(",")[0].trim() || "unknown";
    }
    const realIp = String(request.headers.get("X-Real-IP") || "").trim();
    if (realIp) {
      return realIp;
    }
    return "unknown";
  }

  private checkWebhookRateLimit(request: Request): Response | null {
    const cfg = this.getWebhookRateLimitConfig();
    if (cfg.limitPerWindow <= 0) {
      return null;
    }
    const now = Date.now();
    const ip = this.extractWebhookClientIp(request);
    const key = `webhook:${ip}`;
    const current = this.webhookRateLimitMap.get(key);
    if (!current || now >= current.resetAt) {
      this.webhookRateLimitMap.set(key, { count: 1, resetAt: now + cfg.windowMs });
      return null;
    }
    if (current.count >= cfg.limitPerWindow) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      const response = jsonResponse({ error: "rate_limited", retry_after: retryAfterSec }, 429);
      response.headers.set("Retry-After", String(retryAfterSec));
      return response;
    }
    current.count += 1;
    this.webhookRateLimitMap.set(key, current);

    // Best-effort cleanup to avoid unbounded memory growth.
    if (this.webhookRateLimitMap.size > 2000) {
      for (const [entryKey, entryValue] of this.webhookRateLimitMap.entries()) {
        if (entryValue.resetAt <= now) {
          this.webhookRateLimitMap.delete(entryKey);
        }
      }
    }
    return null;
  }

  private async verifyWebhookSecret(request: Request): Promise<Response | null> {
    const config = await this.loadBotConfig();
    const expected = String(config.webhook_secret || "").trim();
    if (!expected) {
      return null;
    }
    const provided = String(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "").trim();
    if (provided && provided === expected) {
      return null;
    }
    return jsonResponse({ error: "forbidden" }, 403);
  }

  private async processTelegramUpdate(update: Record<string, unknown>): Promise<void> {
    if (update?.message) {
      await this.handleTelegramMessage(update.message as Record<string, unknown>);
    } else if (update?.callback_query) {
      await this.handleTelegramCallbackQuery(update.callback_query as Record<string, unknown>);
    } else if (update?.inline_query) {
      await this.handleTelegramInlineQuery(update.inline_query as Record<string, unknown>);
    } else if (update?.chat_member) {
      await this.handleTelegramChatMemberUpdate("chat_member", update.chat_member as Record<string, unknown>);
    } else if (update?.my_chat_member) {
      await this.handleTelegramChatMemberUpdate("my_chat_member", update.my_chat_member as Record<string, unknown>);
    } else if (update?.pre_checkout_query) {
      await this.handleTelegramPaymentQuery("pre_checkout_query", update.pre_checkout_query as Record<string, unknown>);
    } else if (update?.shipping_query) {
      await this.handleTelegramPaymentQuery("shipping_query", update.shipping_query as Record<string, unknown>);
    } else if (update?.channel_post) {
      await this.handleTelegramChannelPost("channel_post", update.channel_post as Record<string, unknown>);
    } else if (update?.edited_channel_post) {
      await this.handleTelegramChannelPost("edited_channel_post", update.edited_channel_post as Record<string, unknown>);
    }
  }

  private buildTelegramUpdateWorkflowId(update: Record<string, unknown>): string {
    const rawUpdateId = String((update as any)?.update_id || "").trim();
    if (rawUpdateId) {
      return `${TELEGRAM_UPDATE_WORKFLOW_ID_PREFIX}-${rawUpdateId}`.slice(0, 100);
    }
    return `${TELEGRAM_UPDATE_WORKFLOW_ID_PREFIX}-${crypto.randomUUID()}`.slice(0, 100);
  }

  private isDuplicateWorkflowInstanceError(error: unknown): boolean {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return message.includes("already") || message.includes("exists") || message.includes("duplicate");
  }

  private async enqueueTelegramUpdateWorkflow(update: Record<string, unknown>): Promise<{
    queued: boolean;
    duplicate?: boolean;
    instance_id?: string;
    error?: string;
  }> {
    const binding = this.env.TELEGRAM_UPDATE_WORKFLOW;
    if (!binding || typeof binding.create !== "function") {
      return { queued: false };
    }
    const instanceId = this.buildTelegramUpdateWorkflowId(update);
    try {
      const instance = await binding.create({
        id: instanceId,
        params: {
          update,
          received_at: Date.now(),
        },
      });
      return { queued: true, instance_id: instance?.id || instanceId };
    } catch (error) {
      if (this.isDuplicateWorkflowInstanceError(error)) {
        return { queued: true, duplicate: true, instance_id: instanceId };
      }
      return { queued: false, error: String(error) };
    }
  }

  private async handleInternalTelegramProcess(request: Request): Promise<Response> {
    if (request.headers.get(INTERNAL_WORKFLOW_HEADER) !== "workflow") {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    let payload: TelegramUpdateWorkflowPayload | Record<string, unknown>;
    try {
      payload = await parseJson<TelegramUpdateWorkflowPayload | Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const update =
      payload && typeof payload === "object" && "update" in payload
        ? ((payload as TelegramUpdateWorkflowPayload).update || {})
        : (payload as Record<string, unknown>);
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      return jsonResponse({ error: "missing update" }, 400);
    }
    await this.processTelegramUpdate(update as Record<string, unknown>);
    return jsonResponse({
      status: "ok",
      update_id: (update as any).update_id ?? null,
      processed_at: Date.now(),
    });
  }

  private async handleTelegramWebhook(request: Request): Promise<Response> {
    const secretError = await this.verifyWebhookSecret(request);
    if (secretError) {
      return secretError;
    }
    const rateLimitError = this.checkWebhookRateLimit(request);
    if (rateLimitError) {
      return rateLimitError;
    }

    let update: Record<string, unknown> | null = null;
    try {
      update = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      // Return 200 to prevent Telegram retry storm on bad payloads.
      return jsonResponse({ status: "ok" });
    }

    const queued = await this.enqueueTelegramUpdateWorkflow(update);
    if (queued.queued) {
      return jsonResponse({
        status: "ok",
        background: "cloudflare_workflows",
        instance_id: queued.instance_id,
        duplicate: Boolean(queued.duplicate),
      });
    }
    if (queued.error) {
      console.error("telegram workflow enqueue failed, falling back to waitUntil:", queued.error);
    }

    const task = this.processTelegramUpdate(update).catch((error) => {
      console.error("telegram webhook handling failed:", error);
    });
    this.state.waitUntil(task);
    return jsonResponse({
      status: "ok",
      background: "waitUntil",
      workflow_error: queued.error || undefined,
    });
  }

  private matchKeywordTrigger(text: string, entry: TriggerEntry): string | null {
    const keywords = String(entry.config.keywords || "").trim();
    if (!keywords) {
      return null;
    }
    const matchMode = String(entry.config.match_mode || "contains").trim();
    const caseSensitive = Boolean(entry.config.case_sensitive);

    const haystack = caseSensitive ? text : text.toLowerCase();
    const list = keywords
      .split(",")
      .map((kw) => kw.trim())
      .filter(Boolean);

    for (const keyword of list) {
      const needle = caseSensitive ? keyword : keyword.toLowerCase();
      if (matchMode === "equals") {
        if (haystack === needle) {
          return keyword;
        }
        continue;
      }
      if (matchMode === "startsWith") {
        if (haystack.startsWith(needle)) {
          return keyword;
        }
        continue;
      }
      if (matchMode === "regex") {
        try {
          const re = new RegExp(keyword, caseSensitive ? "" : "i");
          if (re.test(text)) {
            return keyword;
          }
        } catch {
          // ignore invalid regex
        }
        continue;
      }
      // default: contains
      if (haystack.includes(needle)) {
        return keyword;
      }
    }
    return null;
  }

  private collectEventTriggerEntries(state: ButtonsModel, type: EventTriggerType): EventTriggerEntry[] {
    const actionId = `trigger_${type}`;
    const entries: EventTriggerEntry[] = [];
    for (const [workflowId, workflow] of Object.entries(state.workflows || {})) {
      const nodes = (workflow?.nodes || {}) as Record<string, any>;
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (String(node?.action_id || "") !== actionId) {
          continue;
        }
        const data = (node?.data || {}) as Record<string, unknown>;
        const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
        const priorityRaw = Number(data.priority);
        const priority = Number.isFinite(priorityRaw) ? priorityRaw : 100;
        entries.push({
          type,
          workflow_id: workflowId,
          node_id: String(nodeId),
          priority,
          enabled,
          config: data,
        });
      }
    }
    entries.sort((a, b) => b.priority - a.priority);
    return entries;
  }

  private matchInlineQueryTrigger(queryText: string, entry: EventTriggerEntry): boolean {
    const pattern = String(entry.config.query_pattern || "").trim();
    if (!pattern) {
      return true;
    }
    return this.matchTextPattern(queryText, pattern, entry);
  }

  private matchTextPattern(value: string, pattern: string, entry: EventTriggerEntry): boolean {
    const matchMode = String(entry.config.match_mode || "contains").trim();
    const caseSensitive = Boolean(entry.config.case_sensitive);
    const haystack = caseSensitive ? value : value.toLowerCase();
    const needle = caseSensitive ? pattern : pattern.toLowerCase();

    if (matchMode === "equals") {
      return haystack === needle;
    }
    if (matchMode === "startsWith") {
      return haystack.startsWith(needle);
    }
    if (matchMode === "regex") {
      try {
        const re = new RegExp(pattern, caseSensitive ? "" : "i");
        return re.test(value);
      } catch {
        return false;
      }
    }
    return haystack.includes(needle);
  }

  private matchPaymentTrigger(payload: Record<string, unknown>, entry: EventTriggerEntry): boolean {
    const invoicePayload = String((payload as any).invoice_payload || (payload as any).payload || "");
    const payloadPattern = String(entry.config.payload_pattern || "").trim();
    if (payloadPattern && !this.matchTextPattern(invoicePayload, payloadPattern, entry)) {
      return false;
    }
    const currency = String(entry.config.currency || "").trim().toUpperCase();
    if (currency && currency !== String((payload as any).currency || "").trim().toUpperCase()) {
      return false;
    }
    const countryCode = String(entry.config.country_code || "").trim().toUpperCase();
    const shippingCountry = String(((payload as any).shipping_address || {}).country_code || "").trim().toUpperCase();
    if (countryCode && countryCode !== shippingCountry) {
      return false;
    }
    return true;
  }

  private matchChannelPostTrigger(message: Record<string, unknown>, entry: EventTriggerEntry, chatId: string): boolean {
    const requiredChatId = String(entry.config.chat_id || "").trim();
    if (requiredChatId && requiredChatId !== chatId) {
      return false;
    }
    const pattern = String(entry.config.text_pattern || "").trim();
    if (!pattern) {
      return true;
    }
    const text = String((message as any).text || (message as any).caption || "");
    return this.matchTextPattern(text, pattern, entry);
  }

  private normalizeChatMemberStatus(status: unknown): string {
    const raw = String(status || "").trim().toLowerCase();
    if (raw === "creator") {
      return "owner";
    }
    return raw;
  }

  private matchChatMemberTrigger(
    entry: EventTriggerEntry,
    oldStatus: string,
    newStatus: string,
    chatType: string
  ): boolean {
    const fromStatus = this.normalizeChatMemberStatus(entry.config.from_status);
    const toStatus = this.normalizeChatMemberStatus(entry.config.to_status);
    const requiredChatType = String(entry.config.chat_type || "").trim().toLowerCase();
    if (fromStatus && fromStatus !== oldStatus) {
      return false;
    }
    if (toStatus && toStatus !== newStatus) {
      return false;
    }
    if (requiredChatType && requiredChatType !== String(chatType || "").trim().toLowerCase()) {
      return false;
    }
    return true;
  }

  private async executeEventTriggerWorkflow(
    state: ButtonsModel,
    entry: EventTriggerEntry,
    runtimeInput: Partial<RuntimeContext>,
    triggerInfo: Record<string, unknown>,
    extraVariables: Record<string, unknown>
  ): Promise<void> {
    const workflow = state.workflows?.[entry.workflow_id];
    if (!workflow) {
      return;
    }
    const runtime = buildRuntimeContext(
      {
        chat_id: runtimeInput.chat_id ?? "",
        chat_type: runtimeInput.chat_type,
        message_id: runtimeInput.message_id,
        thread_id: runtimeInput.thread_id,
        user_id: runtimeInput.user_id,
        username: runtimeInput.username,
        full_name: runtimeInput.full_name,
        callback_data: runtimeInput.callback_data,
        variables: {
          ...(runtimeInput.variables || {}),
          ...extraVariables,
          __trigger__: triggerInfo,
        },
      },
      String((runtimeInput.variables as any)?.menu_id || "root")
    );

    const button = { id: "runtime_button", text: "runtime", type: "workflow", payload: {} };
    const menu = { id: "root", name: "root", items: [], header: "请选择功能" };

    try {
      const subWorkflow = this.extractWorkflowForTrigger(workflow, entry.node_id);
      const result = await this.executeWorkflowWithObservability({
        state,
        workflow: subWorkflow,
        runtime,
        button,
        menu,
        preview: false,
        trigger_type: entry.type,
        trigger: triggerInfo,
      });
      await this.handleWorkflowResult(result, runtime, entry.workflow_id);
    } catch (error) {
      if (runtime.chat_id) {
        await this.sendText(runtime.chat_id, `执行失败: ${String(error)}`, undefined);
      }
    }
  }

  private async executeMessageTrigger(
    state: ButtonsModel,
    entry: TriggerEntry,
    runtimeInput: Partial<RuntimeContext>,
    meta: Record<string, unknown>,
    rawMessage: Record<string, unknown>,
    timestamp?: number
  ): Promise<void> {
    const workflow = state.workflows?.[entry.workflow_id];
    if (!workflow) {
      return;
    }

    const triggerInfo: Record<string, unknown> = {
      type: entry.type,
      node_id: entry.node_id,
      workflow_id: entry.workflow_id,
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
      raw_event: { message: rawMessage },
      ...meta,
    };

    const extraVars: Record<string, unknown> = {};
    if (entry.type === "command") {
      extraVars.command = meta.command;
      extraVars.command_text = meta.command_text;
      extraVars.command_args = (meta.args as any)?.args || [];
      extraVars.command_params = (meta.args as any)?.params || {};
    } else if (entry.type === "keyword") {
      extraVars.text = meta.text;
      extraVars.matched_keyword = meta.matched_keyword;
    }

    const runtime: RuntimeContext = {
      chat_id: String(runtimeInput.chat_id || "0"),
      chat_type: runtimeInput.chat_type,
      message_id: runtimeInput.message_id,
      thread_id: runtimeInput.thread_id,
      user_id: runtimeInput.user_id,
      username: runtimeInput.username,
      full_name: runtimeInput.full_name,
      callback_data: typeof rawMessage.text === "string" ? String(rawMessage.text) : undefined,
      variables: { ...extraVars, __trigger__: triggerInfo },
    };

    const button = { id: "runtime_button", text: "runtime", type: "workflow", payload: {} };
    const menu = { id: "root", name: "root", items: [], header: "请选择功能" };

    try {
      const subWorkflow = this.extractWorkflowForTrigger(workflow, entry.node_id);
      const result = await this.executeWorkflowWithObservability({
        state,
        workflow: subWorkflow,
        runtime,
        button,
        menu,
        preview: false,
        trigger_type: entry.type,
        trigger: triggerInfo,
      });
      await this.handleWorkflowResult(result, runtime, entry.workflow_id);
    } catch (error) {
      await this.sendText(runtime.chat_id, `执行失败: ${String(error)}`, undefined);
    }
  }

  private normalizeWorkflowShape(workflow: WorkflowDefinition): {
    nodes: Record<string, any>;
    edges: Array<Record<string, unknown>>;
  } {
    const raw = workflow as unknown as Record<string, unknown>;
    if (!raw.nodes || typeof raw.nodes !== "object" || Array.isArray(raw.nodes)) {
      raw.nodes = {};
    }
    if (!Array.isArray(raw.edges)) {
      raw.edges = [];
    }
    return {
      nodes: raw.nodes as Record<string, any>,
      edges: raw.edges as Array<Record<string, unknown>>,
    };
  }

  private isTriggerNode(node: Record<string, unknown> | undefined): boolean {
    const actionId = String((node as any)?.action_id || "").trim();
    return actionId.startsWith("trigger_");
  }

  private getTriggerButtonId(node: Record<string, unknown> | undefined): string {
    const data = ((node as any)?.data || {}) as Record<string, unknown>;
    return normalizeButtonIdFromTriggerConfig(String((data.button_id ?? data.target_button_id) || ""));
  }

  private nextWorkflowNodeId(workflow: WorkflowDefinition): string {
    const { nodes } = this.normalizeWorkflowShape(workflow);
    const used = new Set(Object.keys(nodes));
    const numeric = Array.from(used)
      .map((id) => Number(id))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (numeric.length > 0) {
      let candidate = Math.max(...numeric) + 1;
      while (used.has(String(candidate))) {
        candidate += 1;
      }
      return String(candidate);
    }
    let fallback = 1;
    while (used.has(String(fallback))) {
      fallback += 1;
    }
    return String(fallback);
  }

  private nextWorkflowEdgeId(
    workflow: WorkflowDefinition,
    sourceNode: string,
    targetNode: string,
    sourceOutput: string
  ): string {
    const { edges } = this.normalizeWorkflowShape(workflow);
    const edgeIds = new Set(edges.map((edge) => String((edge as any).id || "")));
    const output = sourceOutput || CONTROL_PORT_NAME;
    let idx = 1;
    let candidate = `edge-${sourceNode}-${targetNode}-${output}-${idx}`;
    while (edgeIds.has(candidate)) {
      idx += 1;
      candidate = `edge-${sourceNode}-${targetNode}-${output}-${idx}`;
    }
    return candidate;
  }

  private resolveNewTriggerPosition(workflow: WorkflowDefinition): { x: number; y: number } {
    const { nodes } = this.normalizeWorkflowShape(workflow);
    const entries = Object.values(nodes || {});
    if (!entries.length) {
      return { x: 80, y: 80 };
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const node of entries) {
      const x = Number((node as any)?.position?.x || 0);
      const y = Number((node as any)?.position?.y || 0);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
    const triggerCount = entries.filter((node) => this.isTriggerNode(node as Record<string, unknown>)).length;
    return {
      x: Math.round(minX - 260),
      y: Math.round(minY + triggerCount * 92),
    };
  }

  private ensureTriggerNodeConnections(workflow: WorkflowDefinition, triggerNodeId: string): boolean {
    const { nodes, edges } = this.normalizeWorkflowShape(workflow);
    if (!triggerNodeId || !nodes[triggerNodeId]) {
      return false;
    }
    const hasOutgoingControl = edges.some((edge) => {
      const sourceNode = String((edge as any).source_node || "").trim();
      if (sourceNode !== triggerNodeId) return false;
      const targetInput = String((edge as any).target_input || "").trim();
      return CONTROL_INPUT_NAMES.has(targetInput);
    });
    if (hasOutgoingControl) {
      return false;
    }

    let changed = false;
    const templateTriggerNodeIds = Object.values(nodes)
      .filter((node) => String((node as any)?.id || "") !== triggerNodeId && this.isTriggerNode(node as any))
      .map((node) => String((node as any)?.id || "").trim())
      .filter(Boolean);
    const templateTargets = new Set<string>();
    for (const edge of edges) {
      const sourceNode = String((edge as any).source_node || "").trim();
      if (!templateTriggerNodeIds.includes(sourceNode)) continue;
      const targetNode = String((edge as any).target_node || "").trim();
      if (!targetNode || !nodes[targetNode]) continue;
      if (this.isTriggerNode(nodes[targetNode] as any)) continue;
      const targetInputRaw = String((edge as any).target_input || "").trim();
      if (!CONTROL_INPUT_NAMES.has(targetInputRaw)) continue;
      const sourceOutput = String((edge as any).source_output || CONTROL_PORT_NAME).trim() || CONTROL_PORT_NAME;
      const targetInput = targetInputRaw || CONTROL_PORT_NAME;
      const key = `${targetNode}|${sourceOutput}|${targetInput}`;
      if (templateTargets.has(key)) continue;
      templateTargets.add(key);
      const exists = edges.some((item) => {
        return (
          String((item as any).source_node || "") === triggerNodeId &&
          String((item as any).target_node || "") === targetNode &&
          String((item as any).source_output || "") === sourceOutput &&
          String((item as any).target_input || "") === targetInput
        );
      });
      if (exists) continue;
      edges.push({
        id: this.nextWorkflowEdgeId(workflow, triggerNodeId, targetNode, sourceOutput),
        source_node: triggerNodeId,
        source_output: sourceOutput,
        target_node: targetNode,
        target_input: targetInput,
      });
      changed = true;
    }

    if (changed) {
      return true;
    }

    const nonTriggerNodes = Object.values(nodes)
      .filter((node) => String((node as any)?.id || "").trim() !== triggerNodeId && !this.isTriggerNode(node as any))
      .sort((a, b) => {
        const ay = Number((a as any)?.position?.y || 0);
        const by = Number((b as any)?.position?.y || 0);
        if (ay !== by) return ay - by;
        const ax = Number((a as any)?.position?.x || 0);
        const bx = Number((b as any)?.position?.x || 0);
        return ax - bx;
      });
    const hasIncomingControl = (nodeId: string): boolean => {
      return edges.some((edge) => {
        const targetNode = String((edge as any).target_node || "").trim();
        if (targetNode !== nodeId) return false;
        const targetInput = String((edge as any).target_input || "").trim();
        return CONTROL_INPUT_NAMES.has(targetInput);
      });
    };
    const target = nonTriggerNodes.find((node) => !hasIncomingControl(String((node as any)?.id || ""))) || nonTriggerNodes[0];
    if (!target) {
      return false;
    }
    const targetId = String((target as any).id || "").trim();
    if (!targetId) {
      return false;
    }
    edges.push({
      id: this.nextWorkflowEdgeId(workflow, triggerNodeId, targetId, CONTROL_PORT_NAME),
      source_node: triggerNodeId,
      source_output: CONTROL_PORT_NAME,
      target_node: targetId,
      target_input: CONTROL_PORT_NAME,
    });
    return true;
  }

  private ensureWorkflowButtonTriggerBinding(state: ButtonsModel, buttonId: string): { bound: boolean; changed: boolean } {
    const button = state.buttons?.[buttonId];
    if (!button) {
      return { bound: false, changed: false };
    }
    if (String((button as any).type || "").trim().toLowerCase() !== "workflow") {
      return { bound: false, changed: false };
    }
    const workflowId = String(((button as any).payload?.workflow_id as string) || "").trim();
    if (!workflowId) {
      return { bound: false, changed: false };
    }
    const workflow = state.workflows?.[workflowId];
    if (!workflow) {
      return { bound: false, changed: false };
    }
    const { nodes } = this.normalizeWorkflowShape(workflow);

    let changed = false;
    const duplicateNodes: Array<Record<string, unknown>> = [];
    let existingNode: Record<string, unknown> | null = null;
    for (const [wfId, wf] of Object.entries(state.workflows || {})) {
      const wfNodes = this.normalizeWorkflowShape(wf).nodes;
      for (const node of Object.values(wfNodes)) {
        const nodeRecord = node as Record<string, unknown>;
        if (String((nodeRecord as any).action_id || "").trim() !== "trigger_button") {
          continue;
        }
        if (this.getTriggerButtonId(nodeRecord) !== buttonId) {
          continue;
        }
        if (wfId === workflowId && !existingNode) {
          existingNode = nodeRecord;
          continue;
        }
        duplicateNodes.push(nodeRecord);
      }
    }

    let ensuredNodeId = "";
    if (existingNode) {
      const nodeData = ((existingNode as any).data || {}) as Record<string, unknown>;
      const priorityRaw = Number(nodeData.priority);
      const priority = Number.isFinite(priorityRaw) ? priorityRaw : 100;
      const nextData = {
        ...nodeData,
        enabled: true,
        priority,
        button_id: buttonId,
      } as Record<string, unknown>;
      if ("target_button_id" in nextData) {
        delete (nextData as any).target_button_id;
      }
      const before = JSON.stringify(nodeData);
      const after = JSON.stringify(nextData);
      if (before !== after) {
        changed = true;
      }
      (existingNode as any).data = nextData;
      ensuredNodeId = String((existingNode as any).id || "").trim();
    } else {
      const nodeId = this.nextWorkflowNodeId(workflow);
      nodes[nodeId] = {
        id: nodeId,
        action_id: "trigger_button",
        position: this.resolveNewTriggerPosition(workflow),
        data: {
          enabled: true,
          priority: 100,
          button_id: buttonId,
          menu_id: "",
        },
      } as any;
      ensuredNodeId = nodeId;
      changed = true;
    }

    if (ensuredNodeId) {
      if (this.ensureTriggerNodeConnections(workflow, ensuredNodeId)) {
        changed = true;
      }
    }

    for (const node of duplicateNodes) {
      const nodeData = ((node as any).data || {}) as Record<string, unknown>;
      if (nodeData.enabled !== false) {
        (node as any).data = {
          ...nodeData,
          enabled: false,
        };
        changed = true;
      }
    }

    return { bound: true, changed };
  }

  private async ensureWorkflowButtonTriggerBindingAndPersist(state: ButtonsModel, buttonId: string): Promise<boolean> {
    const result = this.ensureWorkflowButtonTriggerBinding(state, buttonId);
    if (!result.bound || !result.changed) {
      return false;
    }
    await this.saveState(state);
    return true;
  }

  private async tryHandleButtonTriggers(
    state: ButtonsModel,
    buttonId: string,
    chatId: string,
    messageId: number,
    userId: string,
    query: Record<string, unknown>,
    redirectMeta: RedirectMeta | null
  ): Promise<boolean> {
    if (!buttonId) {
      return false;
    }
    const button = state.buttons?.[buttonId];
    if (!button) {
      return false;
    }

    const index = this.getTriggerIndex(state);
    const candidates = index.byButton.get(buttonId) || [];
    if (!candidates.length) {
      return false;
    }

    let menuForRuntime = findMenuForButton(state, buttonId) || state.menus?.root;
    if (redirectMeta?.source_menu_id && !redirectMeta.locate_target_menu) {
      menuForRuntime = state.menus?.[redirectMeta.source_menu_id] || menuForRuntime;
    }
    const menuId = menuForRuntime?.id ? String(menuForRuntime.id) : "";

    const matches = candidates
      .filter((entry) => entry.enabled)
      .filter((entry) => {
        const requiredMenuId = String(entry.config.menu_id || "").trim();
        return !requiredMenuId || requiredMenuId === menuId;
      })
      .sort((a, b) => b.priority - a.priority);

    if (!matches.length) {
      return false;
    }

    for (let i = 0; i < matches.length; i += 1) {
      const entry = matches[i];
      const forceAckEarly = i > 0;
      await this.executeButtonTrigger(
        state,
        entry,
        button,
        menuForRuntime as any,
        chatId,
        messageId,
        userId,
        query,
        redirectMeta,
        forceAckEarly
      );
    }

    return true;
  }

  private async executeButtonTrigger(
    state: ButtonsModel,
    entry: TriggerEntry,
    button: Record<string, unknown>,
    menuForRuntime: Record<string, unknown> | undefined,
    chatId: string,
    messageId: number,
    userId: string,
    query: Record<string, unknown>,
    redirectMeta: RedirectMeta | null,
    forceAckEarly: boolean
  ): Promise<void> {
    const workflow = state.workflows?.[entry.workflow_id];
    if (!workflow) {
      return;
    }

    const triggerInfo: Record<string, unknown> = {
      type: entry.type,
      node_id: entry.node_id,
      workflow_id: entry.workflow_id,
      timestamp: Math.floor(Date.now() / 1000),
      raw_event: { callback_query: query, redirect: redirectMeta },
      button_id: String((button as any).id || ""),
      button_text: String((button as any).text || ""),
      callback_data: typeof query.data === "string" ? String(query.data) : "",
    };

    const runtime = buildRuntimeContext(
      {
        chat_id: chatId,
        message_id: messageId,
        user_id: userId,
        callback_data: query.data as string,
        variables: {
          menu_id: (menuForRuntime as any)?.id,
          menu_name: (menuForRuntime as any)?.name,
          button_id: (button as any).id,
          button_text: (button as any).text,
          menu_header_text: (query.message as Record<string, unknown>)?.text,
          redirect_original_button_id: redirectMeta?.source_button_id,
          redirect_original_menu_id: redirectMeta?.source_menu_id,
          redirect_target_button_id: (button as any).id,
          redirect_target_menu_id: (menuForRuntime as any)?.id,
          redirect_target_callback_data: redirectMeta?.target_data,
          redirect_locate_target_menu: redirectMeta?.locate_target_menu,
          __trigger__: triggerInfo,
        },
      },
      (menuForRuntime as any)?.id
    );

    const subWorkflow = this.extractWorkflowForTrigger(workflow, entry.node_id);
    const ackEarly = forceAckEarly ? true : !this.workflowHasNotification(subWorkflow);
    if (!forceAckEarly && ackEarly) {
      await this.answerCallbackQuery(query.id as string);
    }

    try {
      const result = await this.executeWorkflowWithObservability({
        state,
        workflow: subWorkflow,
        runtime,
        button,
        menu: menuForRuntime || (state.menus?.root as any),
        preview: false,
        trigger_type: entry.type,
        trigger: triggerInfo,
      });

      await this.applyExecutionResult(
        result,
        state,
        button,
        menuForRuntime,
        chatId,
        messageId,
        query,
        redirectMeta,
        ackEarly
      );
    } catch (error) {
      try {
        await this.answerCallbackQuery(query.id as string, `执行失败: ${String(error)}`, true);
      } catch (callbackError) {
        console.error("callback error after trigger failure:", callbackError);
      }
    }
  }

  private async handleTelegramMessage(message: Record<string, unknown>): Promise<void> {
    const chat = message.chat as Record<string, unknown> | undefined;
    const from = message.from as Record<string, unknown> | undefined;
    const chatId = chat?.id ? String(chat.id) : "";
    if (!chatId) {
      return;
    }
    const userId = from?.id ? String(from.id) : "";
    const text = typeof message.text === "string" ? message.text : "";
    const messageId = message.message_id ? Number(message.message_id) : undefined;
    const timestamp = message.date ? Number(message.date) : undefined;
    const chatType = chat?.type ? String(chat.type) : "";
    const username = from?.username ? String(from.username) : "";
    const firstName = from?.first_name ? String(from.first_name) : "";
    const lastName = from?.last_name ? String(from.last_name) : "";
    const fullName = `${firstName}${firstName && lastName ? " " : ""}${lastName}`.trim();

    const awaitId = await this.findAwaitExecutionId(chatId, userId);
    if (awaitId) {
      const record = await this.loadExecution(awaitId);
      if (record) {
        await this.resumeExecution(record, {
          text,
          message_id: messageId,
          timestamp,
        });
        return;
      }
    }

    const trimmed = text.trim();
    if (trimmed === "/menu" || trimmed === "/start") {
      const state = await this.loadState();
      await this.sendMenuMessage(chatId, "root", state);
      return;
    }

    const workflowId = parseWorkflowCommand(trimmed);
    if (workflowId) {
      await this.startWorkflowExecution(workflowId, {
        chat_id: chatId,
        user_id: userId,
        message_id: messageId,
        callback_data: undefined,
        variables: {},
      });
      return;
    }

    const agentCommandText = this.extractTelegramAgentCommand(trimmed);
    if (agentCommandText !== null) {
      const handled = await this.handleTelegramAgentMessage({
        chatId,
        chatType,
        userId,
        username,
        fullName,
        messageId,
        timestamp,
        text: agentCommandText,
        entry: "command",
      });
      if (handled) {
        return;
      }
    }

    if (text && !trimmed.startsWith("/")) {
      const agentConfig = await this.loadAgentConfig();
      const agentPrefixText = this.extractTelegramAgentPrefix(trimmed, agentConfig);
      if (agentPrefixText !== null) {
        const handled = await this.handleTelegramAgentMessage({
          chatId,
          chatType,
          userId,
          username,
          fullName,
          messageId,
          timestamp,
          text: agentPrefixText,
          entry: "prefix",
        });
        if (handled) {
          return;
        }
      }
    }

    const state = await this.loadState();
    const index = this.getTriggerIndex(state);

    const matches: Array<{ entry: TriggerEntry; meta: Record<string, unknown> }> = [];

    if (trimmed.startsWith("/")) {
      const firstToken = trimmed.split(/\s+/, 1)[0];
      const baseCommand = normalizeTelegramCommandName(firstToken);
      if (baseCommand && !["menu", "start", "run", "workflow"].includes(baseCommand)) {
        const candidates = index.byCommand.get(baseCommand) || [];
        const rest = trimmed.slice(firstToken.length).trim();
        for (const entry of candidates) {
          const argsMode = String(entry.config.args_mode || "auto").toLowerCase() as CommandArgMode;
          const parsed = parseCommandArgs(rest, argsMode, []);
          matches.push({
            entry,
            meta: {
              command: baseCommand,
              command_text: trimmed,
              raw_args: rest,
              args: parsed,
            },
          });
        }
      }
    }

    if (text) {
      for (const entry of index.byKeyword) {
        const matchedKeyword = this.matchKeywordTrigger(text, entry);
        if (!matchedKeyword) {
          continue;
        }
        matches.push({
          entry,
          meta: {
            text,
            matched_keyword: matchedKeyword,
          },
        });
      }
    }

    matches.sort((a, b) => b.entry.priority - a.entry.priority);
    for (const match of matches) {
      if (!match.entry.enabled) {
        continue;
      }
      await this.executeMessageTrigger(
        state,
        match.entry,
        {
          chat_id: chatId,
          chat_type: chatType,
          user_id: userId,
          username,
          full_name: fullName,
          message_id: messageId,
        },
        match.meta,
        message,
        timestamp
      );
    }
    if (matches.length > 0) {
      return;
    }

    if (text && !trimmed.startsWith("/") && chatType === "private") {
      const handled = await this.handleTelegramAgentMessage({
        chatId,
        chatType,
        userId,
        username,
        fullName,
        messageId,
        timestamp,
        text,
        entry: "private",
      });
      if (handled) {
        return;
      }
    }

    if (trimmed.startsWith("/")) {
      const handled = await this.handleCommandText(trimmed, chatId, userId, messageId, state);
      if (!handled) {
        await this.sendText(chatId, `未支持的指令: ${trimmed}`, undefined);
      }
    }
  }

  private async handleTelegramInlineQuery(inlineQuery: Record<string, unknown>): Promise<void> {
    const queryId = inlineQuery.id ? String(inlineQuery.id) : "";
    if (!queryId) {
      return;
    }
    const from = (inlineQuery.from || {}) as Record<string, unknown>;
    const userId = from.id ? String(from.id) : "";
    const username = from.username ? String(from.username) : "";
    const firstName = from.first_name ? String(from.first_name) : "";
    const lastName = from.last_name ? String(from.last_name) : "";
    const fullName = `${firstName}${firstName && lastName ? " " : ""}${lastName}`.trim();
    const queryText = inlineQuery.query ? String(inlineQuery.query) : "";
    const offset = inlineQuery.offset ? String(inlineQuery.offset) : "";
    const timestamp = Math.floor(Date.now() / 1000);

    const state = await this.loadState();
    const matches = this.collectEventTriggerEntries(state, "inline_query").filter(
      (entry) => entry.enabled && this.matchInlineQueryTrigger(queryText, entry)
    );
    if (!matches.length) {
      return;
    }

    for (const entry of matches) {
      const triggerInfo: Record<string, unknown> = {
        type: "inline_query",
        node_id: entry.node_id,
        workflow_id: entry.workflow_id,
        inline_query_id: queryId,
        query: queryText,
        offset,
        timestamp,
        raw_event: { inline_query: inlineQuery },
      };
      await this.executeEventTriggerWorkflow(
        state,
        entry,
        {
          chat_id: "",
          user_id: userId,
          username,
          full_name: fullName,
        },
        triggerInfo,
        {
          inline_query_id: queryId,
          inline_query: inlineQuery,
          query: queryText,
          offset,
        }
      );
    }
  }

  private async handleTelegramChatMemberUpdate(
    updateType: "chat_member" | "my_chat_member",
    payload: Record<string, unknown>
  ): Promise<void> {
    const chat = (payload.chat || {}) as Record<string, unknown>;
    const from = (payload.from || {}) as Record<string, unknown>;
    const oldChatMember = (payload.old_chat_member || {}) as Record<string, unknown>;
    const newChatMember = (payload.new_chat_member || {}) as Record<string, unknown>;
    const chatId = chat.id ? String(chat.id) : "";
    if (!chatId) {
      return;
    }
    const chatType = chat.type ? String(chat.type) : "";
    const oldStatus = this.normalizeChatMemberStatus((oldChatMember as any).status);
    const newStatus = this.normalizeChatMemberStatus((newChatMember as any).status);
    const actorUserId = from.id ? String(from.id) : "";
    const memberUserId = ((newChatMember as any).user || (oldChatMember as any).user || {})?.id
      ? String(((newChatMember as any).user || (oldChatMember as any).user || {})?.id)
      : "";
    const timestamp = payload.date ? Number(payload.date) : Math.floor(Date.now() / 1000);

    const state = await this.loadState();
    const entries = this.collectEventTriggerEntries(state, updateType).filter(
      (entry) => entry.enabled && this.matchChatMemberTrigger(entry, oldStatus, newStatus, chatType)
    );
    if (!entries.length) {
      return;
    }

    for (const entry of entries) {
      const triggerInfo: Record<string, unknown> = {
        type: updateType,
        node_id: entry.node_id,
        workflow_id: entry.workflow_id,
        old_status: oldStatus,
        new_status: newStatus,
        actor_user_id: actorUserId,
        member_user_id: memberUserId,
        timestamp,
        raw_event: { [updateType]: payload },
      };
      await this.executeEventTriggerWorkflow(
        state,
        entry,
        {
          chat_id: chatId,
          chat_type: chatType,
          user_id: actorUserId,
        },
        triggerInfo,
        {
          [updateType]: payload,
          old_status: oldStatus,
          new_status: newStatus,
          actor_user_id: actorUserId,
          member_user_id: memberUserId,
          chat_id: chatId,
          chat_type: chatType,
        }
      );
    }
  }

  private async handleTelegramPaymentQuery(
    updateType: "pre_checkout_query" | "shipping_query",
    payload: Record<string, unknown>
  ): Promise<void> {
    const queryId = payload.id ? String(payload.id) : "";
    if (!queryId) {
      return;
    }
    const from = (payload.from || {}) as Record<string, unknown>;
    const userId = from.id ? String(from.id) : "";
    const username = from.username ? String(from.username) : "";
    const firstName = from.first_name ? String(from.first_name) : "";
    const lastName = from.last_name ? String(from.last_name) : "";
    const fullName = `${firstName}${firstName && lastName ? " " : ""}${lastName}`.trim();
    const invoicePayload = String((payload as any).invoice_payload || "");
    const currency = String((payload as any).currency || "");
    const totalAmount = Number((payload as any).total_amount || 0);
    const timestamp = Math.floor(Date.now() / 1000);

    const state = await this.loadState();
    const entries = this.collectEventTriggerEntries(state, updateType).filter(
      (entry) => entry.enabled && this.matchPaymentTrigger(payload, entry)
    );
    if (!entries.length) {
      return;
    }

    for (const entry of entries) {
      const triggerInfo: Record<string, unknown> = {
        type: updateType,
        node_id: entry.node_id,
        workflow_id: entry.workflow_id,
        query_id: queryId,
        invoice_payload: invoicePayload,
        currency,
        total_amount: totalAmount,
        timestamp,
        raw_event: { [updateType]: payload },
      };
      await this.executeEventTriggerWorkflow(
        state,
        entry,
        {
          chat_id: "",
          user_id: userId,
          username,
          full_name: fullName,
        },
        triggerInfo,
        {
          [`${updateType}_id`]: queryId,
          query_id: queryId,
          invoice_payload: invoicePayload,
          currency,
          total_amount: totalAmount,
          shipping_address: (payload as any).shipping_address || null,
          order_info: (payload as any).order_info || null,
          [updateType]: payload,
        }
      );
    }
  }

  private async handleTelegramChannelPost(
    updateType: "channel_post" | "edited_channel_post",
    message: Record<string, unknown>
  ): Promise<void> {
    const chat = (message.chat || {}) as Record<string, unknown>;
    const chatId = chat.id ? String(chat.id) : "";
    if (!chatId) {
      return;
    }
    const chatType = chat.type ? String(chat.type) : "";
    const messageId = message.message_id ? Number(message.message_id) : undefined;
    const text = String((message as any).text || (message as any).caption || "");
    const timestamp = message.date ? Number(message.date) : Math.floor(Date.now() / 1000);

    const state = await this.loadState();
    const entries = this.collectEventTriggerEntries(state, updateType).filter(
      (entry) => entry.enabled && this.matchChannelPostTrigger(message, entry, chatId)
    );
    if (!entries.length) {
      return;
    }

    for (const entry of entries) {
      const triggerInfo: Record<string, unknown> = {
        type: updateType,
        node_id: entry.node_id,
        workflow_id: entry.workflow_id,
        chat_id: chatId,
        chat_type: chatType,
        message_id: messageId,
        text,
        timestamp,
        raw_event: { [updateType]: message },
      };
      await this.executeEventTriggerWorkflow(
        state,
        entry,
        {
          chat_id: chatId,
          chat_type: chatType,
          message_id: messageId,
        },
        triggerInfo,
        {
          [updateType]: message,
          chat_id: chatId,
          chat_type: chatType,
          message_id: messageId,
          text,
        }
      );
    }
  }

  private async handleTelegramCallbackQuery(query: Record<string, unknown>): Promise<void> {
    const data = typeof query.data === "string" ? query.data : "";
    const message = query.message as Record<string, unknown> | undefined;
    const chat = message?.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id ? String(chat.id) : "";
    const messageId = message?.message_id ? Number(message.message_id) : undefined;
    const from = query.from as Record<string, unknown> | undefined;
    const userId = from?.id ? String(from.id) : "";

    if (!data || !chatId || !messageId) {
      return;
    }

    let redirectMeta: RedirectMeta | null = null;
    let actualData = data;
    if (actualData.startsWith(CALLBACK_PREFIX_REDIRECT)) {
      redirectMeta = parseRedirect(actualData);
      if (!redirectMeta) {
        await this.answerCallbackQuery(query.id as string, "无效的重定向数据", true);
        return;
      }
      actualData = redirectMeta.target_data;
    }

    const state = await this.loadState();

    if (actualData.startsWith(CALLBACK_PREFIX_MENU)) {
      const menuId = actualData.slice(CALLBACK_PREFIX_MENU.length) || "root";
      await this.showMenu(chatId, messageId, menuId, state);
      await this.answerCallbackQuery(query.id as string);
      return;
    }

    if (actualData.startsWith(CALLBACK_PREFIX_BACK)) {
      const menuId = actualData.slice(CALLBACK_PREFIX_BACK.length) || "root";
      await this.showMenu(chatId, messageId, menuId, state);
      await this.answerCallbackQuery(query.id as string);
      return;
    }

    if (actualData.startsWith(CALLBACK_PREFIX_ACTION)) {
      const buttonId = actualData.slice(CALLBACK_PREFIX_ACTION.length);
      let handled = await this.tryHandleButtonTriggers(
        state,
        buttonId,
        chatId,
        messageId,
        userId,
        query,
        redirectMeta
      );
      if (!handled && redirectMeta?.source_button_id && redirectMeta.source_button_id !== buttonId) {
        handled = await this.tryHandleButtonTriggers(
          state,
          redirectMeta.source_button_id,
          chatId,
          messageId,
          userId,
          query,
          redirectMeta
        );
      }
      if (handled) {
        return;
      }
      await this.executeButtonAction(
        state,
        buttonId,
        chatId,
        messageId,
        query,
        redirectMeta,
        "action"
      );
      return;
    }

    if (actualData.startsWith(CALLBACK_PREFIX_WORKFLOW)) {
      const buttonId = actualData.slice(CALLBACK_PREFIX_WORKFLOW.length);
      let handled = await this.tryHandleButtonTriggers(
        state,
        buttonId,
        chatId,
        messageId,
        userId,
        query,
        redirectMeta
      );
      if (!handled && redirectMeta?.source_button_id && redirectMeta.source_button_id !== buttonId) {
        handled = await this.tryHandleButtonTriggers(
          state,
          redirectMeta.source_button_id,
          chatId,
          messageId,
          userId,
          query,
          redirectMeta
        );
      }
      if (!handled) {
        try {
          const repaired = await this.ensureWorkflowButtonTriggerBindingAndPersist(state, buttonId);
          if (repaired) {
            handled = await this.tryHandleButtonTriggers(
              state,
              buttonId,
              chatId,
              messageId,
              userId,
              query,
              redirectMeta
            );
            if (!handled && redirectMeta?.source_button_id && redirectMeta.source_button_id !== buttonId) {
              handled = await this.tryHandleButtonTriggers(
                state,
                redirectMeta.source_button_id,
                chatId,
                messageId,
                userId,
                query,
                redirectMeta
              );
            }
          }
        } catch (error) {
          console.error("auto bind trigger_button failed:", error);
        }
      }
      if (handled) {
        return;
      }
      await this.answerCallbackQuery(query.id as string, "按钮未配置 trigger_button 触发器", true);
      return;
    }

    if (actualData.startsWith(CALLBACK_PREFIX_COMMAND)) {
      const buttonId = actualData.slice(CALLBACK_PREFIX_COMMAND.length);
      let handled = await this.tryHandleButtonTriggers(
        state,
        buttonId,
        chatId,
        messageId,
        userId,
        query,
        redirectMeta
      );
      if (!handled && redirectMeta?.source_button_id && redirectMeta.source_button_id !== buttonId) {
        handled = await this.tryHandleButtonTriggers(
          state,
          redirectMeta.source_button_id,
          chatId,
          messageId,
          userId,
          query,
          redirectMeta
        );
      }
      if (handled) {
        return;
      }
      await this.handleCommandButton(state, buttonId, chatId, userId, messageId, query);
      return;
    }

    const rawButtonId = this.findButtonIdForRawCallback(state, actualData);
    if (rawButtonId) {
      const handled = await this.tryHandleButtonTriggers(
        state,
        rawButtonId,
        chatId,
        messageId,
        userId,
        query,
        redirectMeta
      );
      if (handled) {
        return;
      }
    }

    await this.answerCallbackQuery(query.id as string);
  }

  private findButtonIdForRawCallback(state: ButtonsModel, callbackData: string): string | null {
    if (!callbackData) {
      return null;
    }
    for (const [id, button] of Object.entries(state.buttons || {})) {
      const type = String((button as any)?.type || "").toLowerCase();
      if (type !== "raw") {
        continue;
      }
      const payload = (button as any)?.payload || {};
      const expected = typeof payload.callback_data === "string" ? payload.callback_data : "";
      if (expected && expected === callbackData) {
        return id;
      }
    }
    return null;
  }

  private async executeButtonAction(
    state: ButtonsModel,
    buttonId: string,
    chatId: string,
    messageId: number,
    query: Record<string, unknown>,
    redirectMeta: RedirectMeta | null,
    buttonType: "action" | "workflow"
  ): Promise<void> {
    const button = state.buttons?.[buttonId];
    if (!button) {
      await this.answerCallbackQuery(query.id as string, "按钮不存在", true);
      return;
    }
    let menuForRuntime = findMenuForButton(state, buttonId) || state.menus?.root;
    if (redirectMeta?.source_menu_id && !redirectMeta.locate_target_menu) {
      menuForRuntime = state.menus?.[redirectMeta.source_menu_id] || menuForRuntime;
    }

    const runtime = buildRuntimeContext(
      {
        chat_id: chatId,
        message_id: messageId,
        user_id: (query.from as Record<string, unknown> | undefined)?.id,
        callback_data: query.data as string,
        variables: {
          menu_id: menuForRuntime?.id,
          menu_name: menuForRuntime?.name,
          button_id: button.id,
          button_text: button.text,
          menu_header_text: (query.message as Record<string, unknown>)?.text,
          redirect_original_button_id: redirectMeta?.source_button_id,
          redirect_original_menu_id: redirectMeta?.source_menu_id,
          redirect_target_button_id: button.id,
          redirect_target_menu_id: menuForRuntime?.id,
          redirect_target_callback_data: redirectMeta?.target_data,
          redirect_locate_target_menu: redirectMeta?.locate_target_menu,
        },
      },
      menuForRuntime?.id
    );

    let workflow: WorkflowDefinition | null = null;
    let actionDef: Record<string, unknown> | null = null;
    if (buttonType === "action") {
      const actionId = button.payload?.action_id as string | undefined;
      if (!actionId) {
        await this.answerCallbackQuery(query.id as string, "按钮缺少 action_id", true);
        return;
      }
      actionDef = state.actions?.[actionId] ? (state.actions?.[actionId] as any) : null;
      if (!actionDef) {
        await this.answerCallbackQuery(query.id as string, "动作未找到", true);
        return;
      }
    } else {
      const workflowId = button.payload?.workflow_id as string | undefined;
      if (!workflowId) {
        await this.answerCallbackQuery(query.id as string, "按钮缺少 workflow_id", true);
        return;
      }
      workflow = state.workflows?.[workflowId] || null;
      if (!workflow) {
        await this.answerCallbackQuery(query.id as string, "工作流未找到", true);
        return;
      }
      actionDef = {
        id: `workflow__${workflowId}`,
        name: `Workflow: ${workflowId}`,
        kind: "workflow",
        config: { workflow_id: workflowId },
      };
    }

    const ackEarly = this.shouldAckEarly(state, actionDef);
    if (ackEarly) {
      await this.answerCallbackQuery(query.id as string);
    }

    const result =
      workflow
        ? await (async () => {
            const triggerInfo: Record<string, unknown> = {
              type: "button",
              workflow_id: workflow.id,
              callback_data: String(query.data || ""),
              button_id: String(button.id || ""),
              button_text: String(button.text || ""),
              timestamp: Math.floor(Date.now() / 1000),
              raw_event: { callback_query: query, redirect: redirectMeta },
            };
            runtime.variables = { ...(runtime.variables || {}), __trigger__: triggerInfo };
            return await this.executeWorkflowWithObservability({
              state,
              workflow,
              runtime,
              button: button as any,
              menu: (menuForRuntime as any) || {},
              preview: false,
              trigger_type: "button",
              trigger: triggerInfo,
            });
          })()
        : await executeActionPreview({
            env: await this.getExecutionEnv(),
            state,
            action: actionDef,
            button: button as any,
            menu: (menuForRuntime as any) || {},
            runtime,
            preview: false,
          });

    await this.applyExecutionResult(
      result,
      state,
      button as any,
      menuForRuntime as any,
      chatId,
      messageId,
      query,
      redirectMeta,
      ackEarly
    );
  }

  private shouldAckEarly(state: ButtonsModel, actionDef: Record<string, unknown> | null): boolean {
    if (!actionDef) {
      return true;
    }
    const kind = String((actionDef as any).kind || "");
    const id = String((actionDef as any).id || "");
    if (id === "show_notification" || kind === "show_notification") {
      return false;
    }
    if (kind === "workflow") {
      const workflowId = String((actionDef as any).config?.workflow_id || "");
      const workflow = workflowId ? state.workflows?.[workflowId] : undefined;
      return !this.workflowHasNotification(workflow);
    }
    return true;
  }

  private workflowHasNotification(workflow?: WorkflowDefinition): boolean {
    if (!workflow || !workflow.nodes) {
      return false;
    }
    return Object.values(workflow.nodes).some(
      (node) => String(node.action_id || "") === "show_notification"
    );
  }

  private async handleCommandButton(
    state: ButtonsModel,
    buttonId: string,
    chatId: string,
    userId: string,
    messageId: number,
    query: Record<string, unknown>
  ): Promise<void> {
    const button = state.buttons?.[buttonId];
    if (!button) {
      await this.answerCallbackQuery(query.id as string, "按钮不存在", true);
      return;
    }
    const commandText = String(button.payload?.command || "").trim();
    if (!commandText) {
      await this.answerCallbackQuery(query.id as string, "按钮未绑定指令", true);
      return;
    }

    await this.answerCallbackQuery(query.id as string);
    const handled = await this.handleCommandText(commandText, chatId, userId, messageId, state);
    if (!handled) {
      await this.sendText(chatId, `未支持的指令: ${commandText}`, undefined);
    }
  }

  private async handleCommandText(
    commandText: string,
    chatId: string,
    userId: string,
    messageId: number | undefined,
    state: ButtonsModel
  ): Promise<boolean> {
    const trimmed = commandText.trim();
    if (!trimmed) {
      return false;
    }

    const firstToken = trimmed.split(/\s+/, 1)[0];
    const baseCommand = firstToken.replace(/^\//, "").split("@")[0].toLowerCase();
    if (!baseCommand) {
      return false;
    }
    if (baseCommand === "menu" || baseCommand === "start") {
      await this.sendMenuMessage(chatId, "root", state);
      return true;
    }

    const workflowId = parseWorkflowCommand(trimmed);
    if (workflowId) {
      await this.startWorkflowExecution(workflowId, {
        chat_id: chatId,
        user_id: userId,
        message_id: messageId,
        callback_data: commandText,
        variables: {},
      });
      return true;
    }

    const config = await this.loadBotConfig();
    const matched = config.commands?.find(
      (cmd) => cmd.command.toLowerCase() === baseCommand
    );
    if (matched && matched.workflow_id) {
      const rest = trimmed.slice(firstToken.length).trim();
      const { args, params } = parseCommandArgs(
        rest,
        matched.arg_mode || "auto",
        matched.args_schema || []
      );
      await this.startWorkflowExecution(matched.workflow_id, {
        chat_id: chatId,
        user_id: userId,
        message_id: messageId,
        callback_data: commandText,
        variables: {
          command: baseCommand,
          command_text: trimmed,
          command_args: args,
          command_params: params,
        },
      });
      return true;
    }

    return false;
  }

  private async applyExecutionResult(
    result: ActionExecutionResult,
    state: ButtonsModel,
    button: Record<string, unknown>,
    menu: Record<string, unknown> | undefined,
    chatId: string,
    messageId: number,
    query: Record<string, unknown>,
    redirectMeta: RedirectMeta | null,
    ackEarly?: boolean
  ): Promise<void> {
    if (!result.success) {
      if (!ackEarly) {
        await this.answerCallbackQuery(query.id as string, result.error || "执行失败", true);
      } else {
        try {
          await this.answerCallbackQuery(query.id as string, result.error || "执行失败", true);
        } catch (error) {
          console.error("callback error after early ack:", error);
        }
      }
      await this.cleanupTempFiles(result.temp_files_to_clean);
      return;
    }

    if (result.pending) {
      await this.storePendingExecution(result.pending);
      if (!ackEarly) {
        await this.answerCallbackQuery(query.id as string);
      }
      return;
    }

    const originalMenuId = menu?.id as string | undefined;
    const displayMenuId =
      redirectMeta?.locate_target_menu && originalMenuId
        ? originalMenuId
        : redirectMeta?.source_menu_id || originalMenuId;
    const targetMenuId = result.next_menu_id || displayMenuId || originalMenuId || "root";
    const menuForOverrides = state.menus?.[targetMenuId] || menu || state.menus?.root;
    const overridesMap = result.button_overrides?.length
      ? resolveButtonOverrides(state, menuForOverrides as any, result.button_overrides, button.id as string)
      : {};
    if (result.button_title) {
      overridesMap[button.id as string] = {
        ...(overridesMap[button.id as string] || {}),
        text: result.button_title,
      };
    }

    const { markup, header } = buildMenuMarkup(targetMenuId, state, overridesMap);
    const textToUse = result.new_text || header || (menu as any)?.header || "";

    if (textToUse) {
      await this.editMessageText(chatId, messageId, textToUse, result.parse_mode, markup);
    } else if (markup) {
      await this.editMessageMarkup(chatId, messageId, markup);
    }

    if (!ackEarly) {
      if (result.notification && result.notification.text) {
        await this.answerCallbackQuery(
          query.id as string,
          String(result.notification.text),
          Boolean(result.notification.show_alert)
        );
      } else {
        await this.answerCallbackQuery(query.id as string);
      }
    } else if (result.notification && result.notification.text) {
      try {
        await this.answerCallbackQuery(
          query.id as string,
          String(result.notification.text),
          Boolean(result.notification.show_alert)
        );
      } catch (error) {
        console.error("callback notification after early ack failed:", error);
      }
    }

    await this.cleanupTempFiles(result.temp_files_to_clean);
  }

  private async showMenu(chatId: string, messageId: number, menuId: string, state: ButtonsModel): Promise<void> {
    const { markup, header } = buildMenuMarkup(menuId, state);
    const text = header || "";
    if (text) {
      await this.editMessageText(chatId, messageId, text, undefined, markup);
    } else if (markup) {
      await this.editMessageMarkup(chatId, messageId, markup);
    }
  }

  private async updateButtonLabel(
    chatId?: string,
    messageId?: number,
    menuId?: string,
    buttonId?: string,
    label?: string
  ): Promise<void> {
    if (!chatId || !messageId || !menuId || !buttonId || !label) {
      return;
    }
    const state = await this.loadState();
    const menu = state.menus?.[menuId];
    if (!menu) {
      return;
    }
    const overrides = resolveButtonOverrides(
      state,
      menu as any,
      [{ target: "self", text: label }],
      buttonId
    );
    const { markup } = buildMenuMarkup(menuId, state, overrides);
    if (!markup) {
      return;
    }
    await this.editMessageMarkup(chatId, messageId, markup);
  }

  private async updateMenuTitle(
    chatId?: string,
    messageId?: number,
    menuId?: string,
    text?: string,
    parseMode?: string
  ): Promise<void> {
    if (!chatId || !messageId || !menuId || !text) {
      return;
    }
    const state = await this.loadState();
    const { markup } = buildMenuMarkup(menuId, state);
    await this.editMessageText(chatId, messageId, text, parseMode, markup);
  }

  private async updateMessageText(
    chatId?: string,
    messageId?: number,
    text?: string,
    parseMode?: string
  ): Promise<void> {
    if (!chatId || !messageId || !text) {
      return;
    }
    await this.editMessageText(chatId, messageId, text, parseMode, undefined);
  }

  private async sendMenuMessage(chatId: string, menuId: string, state: ButtonsModel): Promise<void> {
    const { markup, header } = buildMenuMarkup(menuId, state);
    const text = header || "请选择功能";
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (markup) {
      payload.reply_markup = markup;
    }
    await callTelegram(await this.getTelegramEnv(), "sendMessage", payload);
  }

  private async answerCallbackQuery(id: string, text?: string, showAlert?: boolean): Promise<void> {
    if (!id) {
      return;
    }
    const payload: Record<string, unknown> = { callback_query_id: id };
    if (text) {
      payload.text = text;
    }
    if (showAlert) {
      payload.show_alert = true;
    }
    await callTelegram(await this.getTelegramEnv(), "answerCallbackQuery", payload);
  }

  private async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    parseMode?: string,
    markup?: Record<string, unknown>
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    if (parseMode) {
      payload.parse_mode = normalizeTelegramParseMode(parseMode);
    }
    if (markup) {
      payload.reply_markup = markup;
    }
    try {
      await callTelegram(await this.getTelegramEnv(), "editMessageText", payload);
    } catch (error) {
      console.error("editMessageText failed:", error);
    }
  }

  private async editMessageMarkup(
    chatId: string,
    messageId: number,
    markup: Record<string, unknown>
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: markup,
    };
    try {
      await callTelegram(await this.getTelegramEnv(), "editMessageReplyMarkup", payload);
    } catch (error) {
      console.error("editMessageMarkup failed:", error);
    }
  }

  private async startWorkflowExecution(workflowId: string, runtimeInput: Partial<RuntimeContext>): Promise<void> {
    const state = await this.loadState();
    const workflow = state.workflows?.[workflowId];
    if (!workflow) {
      return;
    }

    const runtime: RuntimeContext = {
      chat_id: runtimeInput.chat_id || "0",
      chat_type: runtimeInput.chat_type,
      message_id: runtimeInput.message_id,
      thread_id: runtimeInput.thread_id,
      user_id: runtimeInput.user_id,
      username: runtimeInput.username,
      full_name: runtimeInput.full_name,
      callback_data: runtimeInput.callback_data,
      variables: runtimeInput.variables || {},
    };

    const button = { id: "runtime_button", text: "runtime", type: "workflow", payload: {} };
    const menu = { id: "root", name: "root", items: [], header: "请选择功能" };

    const result = await this.executeWorkflowWithObservability({
      state,
      workflow,
      runtime,
      button,
      menu,
      preview: false,
      trigger_type: "manual",
      trigger: { type: "manual", workflow_id: workflowId },
    });
    await this.handleWorkflowResult(result, runtime, workflowId);
  }

  private cloneContinuationList(input: PendingContinuation[] | undefined): PendingContinuation[] {
    if (!Array.isArray(input) || !input.length) {
      return [];
    }
    return input.map((entry) => ({
      ...entry,
      exec_order: Array.isArray(entry.exec_order) ? [...entry.exec_order] : [],
      next_index: Number(entry.next_index || 0),
      next_node_id: String((entry as any).next_node_id || ""),
      node_outputs: entry.node_outputs && typeof entry.node_outputs === "object"
        ? Object.fromEntries(
            Object.entries(entry.node_outputs).map(([nodeId, vars]) => [
              nodeId,
              vars && typeof vars === "object" && !Array.isArray(vars)
                ? { ...(vars as Record<string, unknown>) }
                : {},
            ])
          )
        : {},
      global_variables: entry.global_variables && typeof entry.global_variables === "object"
        ? { ...(entry.global_variables as Record<string, unknown>) }
        : {},
      final_text_parts: Array.isArray(entry.final_text_parts) ? [...entry.final_text_parts] : [],
      temp_files_to_clean: Array.isArray(entry.temp_files_to_clean) ? [...entry.temp_files_to_clean] : [],
      runtime: {
        ...(entry.runtime || { chat_id: "0", variables: {} }),
        variables: { ...((entry.runtime?.variables as Record<string, unknown>) || {}) },
      },
      button: { ...(entry.button || {}) },
      menu: { ...(entry.menu || {}) },
      sub_workflow:
        entry.sub_workflow && typeof entry.sub_workflow === "object"
          ? { ...entry.sub_workflow }
          : undefined,
    }));
  }

  private buildSubWorkflowResumePayload(
    result: ActionExecutionResult,
    propagateError: boolean,
    workflow?: WorkflowDefinition
  ): Record<string, unknown> {
    const variables =
      result.data && typeof result.data.variables === "object" && result.data.variables
        ? (result.data.variables as Record<string, unknown>)
        : {};
    const terminalOutputs = collectSubWorkflowTerminalOutputs({
      workflow,
      result,
    });
    if (result.success) {
      return {
        __flow__: "success",
        subworkflow_success: true,
        subworkflow_error: String(result.error || ""),
        subworkflow_text: String(result.new_text || ""),
        subworkflow_next_menu_id: String(result.next_menu_id || ""),
        subworkflow_variables: variables,
        subworkflow_terminal_outputs: terminalOutputs.grouped,
        ...terminalOutputs.flattened,
      };
    }
    const error = String(result.error || "sub_workflow failed");
    if (propagateError) {
      return {
        throw_error: true,
        subworkflow_error: error,
      };
    }
    return {
      __flow__: "error",
      subworkflow_success: false,
      subworkflow_error: error,
      subworkflow_text: String(result.new_text || ""),
      subworkflow_next_menu_id: String(result.next_menu_id || ""),
      subworkflow_variables: variables,
      subworkflow_terminal_outputs: terminalOutputs.grouped,
      ...terminalOutputs.flattened,
    };
  }

  private async resumeExecution(
    record: ExecutionRecord,
    input: { text: string; message_id?: number; timestamp?: number }
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const awaitCfg = record.await;
    const deadline = record.created_at + Math.max(awaitCfg.timeout_seconds || 0, 1);
    let status: "success" | "timeout" | "cancelled" = "success";

    if (awaitCfg.timeout_seconds && now > deadline) {
      status = "timeout";
    }

    const trimmed = input.text.trim();
    const lowered = trimmed.toLowerCase();
    const cancelSet = new Set(awaitCfg.cancel_keywords.map((kw) => kw.trim().toLowerCase()).filter(Boolean));

    if (status === "success" && cancelSet.size && cancelSet.has(lowered)) {
      status = "cancelled";
    }

    if (status === "success" && !trimmed && !awaitCfg.allow_empty) {
      if (awaitCfg.retry_prompt_template) {
        await this.sendText(record.runtime.chat_id, awaitCfg.retry_prompt_template, awaitCfg.parse_mode);
      }
      return;
    }

    const displayMode = normalizeDisplayMode(awaitCfg.prompt_display_mode || "button_label");
    const menuId = awaitCfg.menu_id || (record.runtime.variables?.menu_id as string | undefined) || "";
    const buttonId = awaitCfg.button_id || (record.runtime.variables?.button_id as string | undefined) || "";
    const originalButtonText = awaitCfg.original_button_text || "";
    const originalMenuHeader = awaitCfg.original_menu_header || "";

    let finalText = "";
    if (status === "success") {
      finalText = awaitCfg.success_template ? renderUserTemplate(awaitCfg.success_template, input.text) : "";
    } else if (status === "timeout") {
      finalText = awaitCfg.timeout_template || "";
    } else if (status === "cancelled") {
      finalText = awaitCfg.cancel_template || awaitCfg.timeout_template || awaitCfg.prompt;
    }

    if (displayMode === "menu_title") {
      if (!finalText) {
        finalText = originalMenuHeader || awaitCfg.prompt;
      }
      await this.updateMenuTitle(
        record.runtime.chat_id,
        record.runtime.message_id,
        menuId,
        finalText,
        awaitCfg.parse_mode
      );
    } else if (displayMode === "button_label") {
      const labelSource = finalText || originalButtonText || awaitCfg.prompt;
      const label = normalizeButtonLabel(labelSource, originalButtonText || awaitCfg.prompt);
      await this.updateButtonLabel(
        record.runtime.chat_id,
        record.runtime.message_id,
        menuId,
        buttonId,
        label
      );
    } else {
      if (!finalText) {
        finalText = awaitCfg.prompt;
      }
      await this.updateMessageText(
        record.runtime.chat_id,
        record.runtime.message_id,
        finalText,
        awaitCfg.parse_mode
      );
    }

    const outputVariables: Record<string, unknown> = {
      user_input: input.text,
      user_input_status: status,
      user_input_is_timeout: status === "timeout",
      user_input_is_cancelled: status === "cancelled",
      user_input_message_id: input.message_id ?? null,
      user_input_timestamp: input.timestamp ?? null,
    };

    record.node_outputs = record.node_outputs || {};
    record.node_outputs[record.await_node_id || "await_node"] = outputVariables;
    record.global_variables = { ...(record.global_variables || {}), ...outputVariables };

    await this.clearAwaitMapping(record.runtime.chat_id, record.runtime.user_id || "");

    const state = await this.loadState();
    const workflow = state.workflows?.[record.workflow_id];
    if (!workflow) {
      await this.cleanupTempFiles(record.temp_files_to_clean);
      await this.deleteExecution(record.id);
      return;
    }

    const resumeState: ResumeState = {
      exec_order: record.exec_order,
      next_index: record.next_index,
      next_node_id: record.next_node_id,
      node_outputs: record.node_outputs,
      global_variables: record.global_variables,
      final_text_parts: record.final_text_parts,
      temp_files_to_clean: record.temp_files_to_clean || [],
    };

    const runtime: RuntimeContext = {
      ...record.runtime,
      variables: record.global_variables,
    };

    let result = await this.executeWorkflowWithObservability({
      state,
      workflow,
      runtime,
      button: record.button,
      menu: record.menu,
      preview: false,
      resume: resumeState,
      obs_execution_id: record.obs_execution_id,
      trigger_type: "resume",
      trigger: record.runtime.variables.__trigger__,
    });

    let resultRuntime = runtime;
    let resultWorkflowId = record.workflow_id;
    let pendingContinuations = this.cloneContinuationList(record.continuations);

    while (!result.pending && pendingContinuations.length > 0) {
      const continuation = pendingContinuations.shift() as PendingContinuation;
      if (!continuation || continuation.type !== "sub_workflow") {
        continue;
      }

      const parentState = await this.loadState();
      const parentWorkflow = parentState.workflows?.[continuation.workflow_id];
      if (!parentWorkflow) {
        result = {
          success: false,
          error: `workflow not found: ${continuation.workflow_id}`,
        };
        break;
      }

      const parentVariables = {
        ...((continuation.global_variables as Record<string, unknown>) || {}),
      };
      const resumeMapRaw = parentVariables.__subworkflow_resume__;
      const resumeMap =
        resumeMapRaw && typeof resumeMapRaw === "object" && !Array.isArray(resumeMapRaw)
          ? { ...(resumeMapRaw as Record<string, unknown>) }
          : {};
      const resumedWorkflow = parentState.workflows?.[resultWorkflowId];
      resumeMap[String(continuation.node_id || "")] = this.buildSubWorkflowResumePayload(
        result,
        Boolean(continuation.sub_workflow?.propagate_error),
        resumedWorkflow
      );
      parentVariables.__subworkflow_resume__ = resumeMap;

      const parentResumeState: ResumeState = {
        exec_order: Array.isArray(continuation.exec_order) ? [...continuation.exec_order] : [],
        next_index: Number(continuation.next_index || 0),
        next_node_id: String((continuation as any).next_node_id || ""),
        node_outputs: continuation.node_outputs && typeof continuation.node_outputs === "object"
          ? Object.fromEntries(
              Object.entries(continuation.node_outputs).map(([nodeId, vars]) => [
                nodeId,
                vars && typeof vars === "object" && !Array.isArray(vars)
                  ? { ...(vars as Record<string, unknown>) }
                  : {},
              ])
            )
          : {},
        global_variables: parentVariables,
        final_text_parts: Array.isArray(continuation.final_text_parts)
          ? [...continuation.final_text_parts]
          : [],
        temp_files_to_clean: Array.isArray(continuation.temp_files_to_clean)
          ? [...continuation.temp_files_to_clean]
          : [],
      };

      const parentRuntime: RuntimeContext = {
        ...(continuation.runtime || record.runtime),
        variables: parentVariables,
      };

      result = await this.executeWorkflowWithObservability({
        state: parentState,
        workflow: parentWorkflow,
        runtime: parentRuntime,
        button: continuation.button || {},
        menu: continuation.menu || {},
        preview: false,
        resume: parentResumeState,
        obs_execution_id: record.obs_execution_id,
        trigger_type: "resume",
        trigger: parentRuntime.variables.__trigger__,
      });

      resultRuntime = parentRuntime;
      resultWorkflowId = continuation.workflow_id;

      if (result.pending && pendingContinuations.length > 0) {
        result.pending.continuations = [
          ...(result.pending.continuations || []),
          ...this.cloneContinuationList(pendingContinuations),
        ];
        pendingContinuations = [];
      }
    }

    await this.deleteExecution(record.id);
    await this.handleWorkflowResult(result, resultRuntime, resultWorkflowId);
  }

  private async handleWorkflowResult(
    result: ActionExecutionResult,
    runtime: RuntimeContext,
    workflowId: string
  ): Promise<void> {
    if (result.pending) {
      await this.storePendingExecution(result.pending);
      return;
    }

    if (result.new_text) {
      await this.sendText(runtime.chat_id, result.new_text, result.parse_mode);
    } else if (!result.success && result.error) {
      await this.sendText(runtime.chat_id, `执行失败: ${result.error}`, undefined);
    }

    await this.cleanupTempFiles(result.temp_files_to_clean);
  }

  private async storePendingExecution(pending: PendingExecution): Promise<void> {
    const execId = generateId("exec");
    const record: ExecutionRecord = {
      id: execId,
      obs_execution_id: pending.obs_execution_id,
      workflow_id: pending.workflow_id,
      exec_order: pending.exec_order,
      next_index: pending.next_index,
      next_node_id: pending.next_node_id,
      node_outputs: pending.node_outputs,
      global_variables: pending.global_variables,
      final_text_parts: pending.final_text_parts || [],
      temp_files_to_clean: pending.temp_files_to_clean || [],
      runtime: pending.runtime,
      button: pending.button,
      menu: pending.menu,
      await_node_id: pending.node_id,
      await: pending.await,
      continuations: this.cloneContinuationList(pending.continuations),
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };
    await this.state.storage.put(this.executionKey(execId), record);
    await this.setAwaitMapping(record.runtime.chat_id, record.runtime.user_id || "", execId);
  }

  private async loadExecution(execId: string): Promise<ExecutionRecord | null> {
    return (await this.state.storage.get<ExecutionRecord>(this.executionKey(execId))) ?? null;
  }

  private async deleteExecution(execId: string): Promise<void> {
    await this.state.storage.delete(this.executionKey(execId));
  }

  private async setAwaitMapping(chatId: string, userId: string, execId: string): Promise<void> {
    const key = this.awaitKey(chatId, userId || "any");
    await this.state.storage.put(key, execId);
  }

  private async clearAwaitMapping(chatId: string, userId: string): Promise<void> {
    await this.state.storage.delete(this.awaitKey(chatId, userId || "any"));
  }

  private async findAwaitExecutionId(chatId: string, userId: string): Promise<string | null> {
    const exactKey = this.awaitKey(chatId, userId || "any");
    const found = await this.state.storage.get<string>(exactKey);
    if (found) {
      return found;
    }
    if (userId) {
      const fallback = await this.state.storage.get<string>(this.awaitKey(chatId, "any"));
      return fallback || null;
    }
    return null;
  }

  private executionKey(execId: string): string {
    return `exec:${execId}`;
  }

  private awaitKey(chatId: string, userId: string): string {
    return `await:${chatId}:${userId}`;
  }

  private async sendText(chatId: string, text: string, parseMode?: string): Promise<void> {
    if (!chatId || !text) {
      return;
    }
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (parseMode) {
      payload.parse_mode = normalizeTelegramParseMode(parseMode);
    }
    await callTelegram(await this.getTelegramEnv(), "sendMessage", payload);
  }

  private async sendChatAction(chatId: string, action: string): Promise<void> {
    if (!chatId || !action) {
      return;
    }
    await callTelegram(await this.getTelegramEnv(), "sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  private async cleanupTempFiles(files?: string[]): Promise<void> {
    if (!files || !files.length) {
      return;
    }
    const bucket = (this.env as any).FILE_BUCKET;
    if (!bucket) {
      return;
    }
    const keys = files
      .filter((entry) => typeof entry === "string" && entry.startsWith("r2://"))
      .map((entry) => entry.slice("r2://".length))
      .filter(Boolean);
    if (!keys.length) {
      return;
    }
    try {
      if (keys.length === 1) {
        await bucket.delete(keys[0]);
      } else if (typeof bucket.delete === "function") {
        try {
          await bucket.delete(keys);
        } catch {
          for (const key of keys) {
            await bucket.delete(key);
          }
        }
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function normalizeTelegramParseMode(value: string): string | undefined {
  const lowered = String(value || "").trim().toLowerCase();
  if (!lowered || ["plain", "none", "text", "plaintext"].includes(lowered)) {
    return undefined;
  }
  if (lowered === "markdownv2" || lowered === "mdv2") {
    return "MarkdownV2";
  }
  if (lowered === "markdown" || lowered === "md") {
    return "Markdown";
  }
  return "HTML";
}

function normalizeTelegramCommandName(token: string): string {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    return "";
  }
  const firstToken = trimmed.split(/\s+/, 1)[0];
  return firstToken.replace(/^\//, "").split("@")[0].toLowerCase();
}

function normalizeButtonIdFromTriggerConfig(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  const idx = trimmed.lastIndexOf("tgbtn:");
  const candidate = idx >= 0 ? trimmed.slice(idx) : trimmed;
  if (candidate.startsWith(CALLBACK_PREFIX_WORKFLOW)) {
    return candidate.slice(CALLBACK_PREFIX_WORKFLOW.length).trim();
  }
  if (candidate.startsWith(CALLBACK_PREFIX_COMMAND)) {
    return candidate.slice(CALLBACK_PREFIX_COMMAND.length).trim();
  }
  if (candidate.startsWith(CALLBACK_PREFIX_ACTION)) {
    return candidate.slice(CALLBACK_PREFIX_ACTION.length).trim();
  }
  return trimmed;
}

function normalizeWebhookAllowedUpdates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const normalized = String(entry || "").trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseWorkflowCommand(text: string): string | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  const match = trimmed.match(/^\/(run|workflow)\s+(.+)$/i);
  if (!match) {
    return null;
  }
  return match[2].trim();
}

function fnv1aUpdate(hash: number, value: string): number {
  let h = hash >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h >>> 0;
}

function parseCommandArgs(
  raw: string,
  mode: CommandArgMode,
  schema: string[]
): { args: string[]; params: Record<string, unknown> } {
  const trimmed = raw.trim();
  let args: string[] = [];
  let params: Record<string, unknown> = {};

  if (!trimmed) {
    return { args, params };
  }

  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const looksLikeKv = trimmed.includes("=") && trimmed.split(/\s+/).every((part) => part.includes("="));

  if (mode === "json" || (mode === "auto" && looksLikeJson)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        args = parsed.map((entry) => String(entry));
      } else if (parsed && typeof parsed === "object") {
        params = parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to text parsing
    }
  }

  if (Object.keys(params).length === 0 && args.length === 0) {
    if (mode === "kv" || (mode === "auto" && looksLikeKv)) {
      const pairs = trimmed.split(/\s+/);
      pairs.forEach((pair) => {
        const [key, ...rest] = pair.split("=");
        if (!key) return;
        params[key.trim()] = rest.join("=").trim();
      });
    } else {
      args = splitCommandArgs(trimmed);
    }
  }

  if (schema && schema.length) {
    schema.forEach((name, index) => {
      if (!name) return;
      if (params[name] === undefined && args[index] !== undefined) {
        params[name] = args[index];
      }
    });
  }

  return { args, params };
}

function splitCommandArgs(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    result.push(current);
  }
  return result;
}

function parseRedirect(data: string): RedirectMeta | null {
  if (!data.startsWith(CALLBACK_PREFIX_REDIRECT)) {
    return null;
  }
  const payload = data.slice(CALLBACK_PREFIX_REDIRECT.length);
  const parts = payload.split(":", 4);
  if (parts.length < 4) {
    return null;
  }
  const [sourceButtonId, sourceMenuId, flag, targetData] = parts;
  return {
    source_button_id: sourceButtonId || undefined,
    source_menu_id: sourceMenuId || undefined,
    locate_target_menu: ["1", "true", "yes", "on"].includes(flag.toLowerCase()),
    target_data: targetData,
  };
}

function renderUserTemplate(template: string, userInput: string): string {
  return template.replace(/\\{\\{\\s*user_input\\s*\\}\\}/g, userInput);
}

function normalizeDisplayMode(value: string): "button_label" | "menu_title" | "message_text" {
  const lowered = String(value || "").trim().toLowerCase();
  if (["menu_title", "menu_header", "header", "menu"].includes(lowered)) {
    return "menu_title";
  }
  if (["message_text", "message", "text"].includes(lowered)) {
    return "message_text";
  }
  return "button_label";
}

function normalizeButtonLabel(rawText: string, fallback: string): string {
  let base = String(rawText || "").trim();
  if (base) {
    base = base.replace(/<[^>]+>/g, "");
    base = base.replace(/[*_`~]/g, "");
    base = base.replace(/[\\[\\]()>\"]/g, "");
    base = base.trim();
  }
  if (!base) {
    base = String(fallback || "").trim();
  }
  if (base.length > 64) {
    base = `${base.slice(0, 61)}...`;
  }
  return base;
}
