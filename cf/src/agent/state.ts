import { jsonResponse, parseJson } from "../utils";

const AGENT_CONFIG_KEY = "agent_config";
const AGENT_SESSION_CONTEXT_PREFIX = "agent:session:context:";
const DEFAULT_AGENT_DOC_KEYS = ["persona", "memory", "tasks", "instructions"];

interface AgentStateStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>;
}

export interface AgentDocument {
  key: string;
  filename: string;
  label: string;
  description: string;
  content_md: string;
  created_at: number;
  updated_at: number;
}

export interface AgentConfig {
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

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentToolLogEntry {
  id: string;
  tool_call_id: string;
  tool: string;
  arguments: unknown;
  result: unknown;
  created_at: number;
}

export interface AgentSessionContext {
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

export interface AgentStateDependencies {
  storage: AgentStateStorage;
  normalizeSkillKey(input: unknown): string;
  validateModelId(modelId: string): Promise<string | null>;
  truncateText(value: unknown, limit?: number): string;
  deleteTelegramHistory(chatId: string, userId: string): Promise<void>;
}

export class AgentStateService {
  constructor(private readonly deps: AgentStateDependencies) {}

  defaultDocuments(now = Date.now()): Record<string, AgentDocument> {
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

  normalizeDocKey(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  normalizeSkillKey(input: unknown): string {
    return this.deps.normalizeSkillKey(input);
  }

  normalizeSkillKeys(input: unknown): string[] {
    const items = Array.isArray(input) ? input : [];
    return Array.from(new Set(items.map((item) => this.normalizeSkillKey(item)).filter(Boolean))).slice(0, 500);
  }

  normalizeTelegramPrefix(input: unknown, fallback = "*"): string {
    const value = input === undefined || input === null ? fallback : String(input);
    return value.trim().slice(0, 16);
  }

  clampToolRounds(input: unknown, fallback = 5): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(20, parsed));
  }

  clampContextTokens(input: unknown, fallback = 24000): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1000, Math.min(1_000_000, parsed));
  }

  clampCompressionTargetTokens(input: unknown, fallback = 1200): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(200, Math.min(50_000, parsed));
  }

  clampKeepRecentMessages(input: unknown, fallback = 8): number {
    const parsed = Math.trunc(Number(input));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(2, Math.min(100, parsed));
  }

  isDefaultDocKey(key: string): boolean {
    return DEFAULT_AGENT_DOC_KEYS.includes(key);
  }

  normalizeDocument(
    rawKey: unknown,
    rawDoc: unknown,
    fallback: AgentDocument | undefined,
    now = Date.now()
  ): AgentDocument | null {
    const source =
      rawDoc && typeof rawDoc === "object" && !Array.isArray(rawDoc)
        ? (rawDoc as Record<string, unknown>)
        : { content_md: typeof rawDoc === "string" ? rawDoc : "" };
    const key = this.normalizeDocKey(source.key || rawKey || fallback?.key);
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

  async loadConfig(): Promise<AgentConfig> {
    const now = Date.now();
    const defaults = this.defaultDocuments(now);
    const stored = await this.deps.storage.get<Partial<AgentConfig>>(AGENT_CONFIG_KEY);
    const docs: Record<string, AgentDocument> = { ...defaults };
    const rawDocs =
      stored?.docs && typeof stored.docs === "object" && !Array.isArray(stored.docs)
        ? (stored.docs as Record<string, unknown>)
        : {};
    for (const [rawKey, rawDoc] of Object.entries(rawDocs)) {
      const fallback = docs[this.normalizeDocKey(rawKey)];
      const doc = this.normalizeDocument(rawKey, rawDoc, fallback, now);
      if (doc) {
        docs[doc.key] = doc;
      }
    }
    return {
      enabled: stored?.enabled === true,
      default_model_id: String(stored?.default_model_id || "").trim(),
      allow_node_execution: stored?.allow_node_execution === true,
      max_tool_rounds: this.clampToolRounds(stored?.max_tool_rounds, 5),
      context_management_enabled: stored?.context_management_enabled !== false,
      context_max_tokens: this.clampContextTokens(stored?.context_max_tokens, 24000),
      context_compression_target_tokens: this.clampCompressionTargetTokens(
        stored?.context_compression_target_tokens,
        1200
      ),
      context_keep_recent_messages: this.clampKeepRecentMessages(stored?.context_keep_recent_messages, 8),
      disabled_skill_keys: this.normalizeSkillKeys(stored?.disabled_skill_keys),
      telegram_command_enabled: stored?.telegram_command_enabled !== false,
      telegram_prefix_trigger: this.normalizeTelegramPrefix(stored?.telegram_prefix_trigger, "*"),
      telegram_private_chat_enabled: stored?.telegram_private_chat_enabled === true,
      docs,
      created_at: Number(stored?.created_at || now),
      updated_at: Number(stored?.updated_at || now),
    };
  }

  async saveConfig(config: AgentConfig): Promise<void> {
    await this.deps.storage.put(AGENT_CONFIG_KEY, config);
  }

  publicConfig(config: AgentConfig) {
    const docs = Object.fromEntries(
      Object.values(config.docs)
        .sort((a, b) => {
          const orderDiff = DEFAULT_AGENT_DOC_KEYS.indexOf(a.key) - DEFAULT_AGENT_DOC_KEYS.indexOf(b.key);
          if (orderDiff !== 0 && DEFAULT_AGENT_DOC_KEYS.includes(a.key) && DEFAULT_AGENT_DOC_KEYS.includes(b.key)) {
            return orderDiff;
          }
          if (DEFAULT_AGENT_DOC_KEYS.includes(a.key)) return -1;
          if (DEFAULT_AGENT_DOC_KEYS.includes(b.key)) return 1;
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

  async handleConfigUpdate(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const existing = await this.loadConfig();
    const hasModelInput = Object.prototype.hasOwnProperty.call(payload, "default_model_id");
    const modelId = String(hasModelInput ? payload.default_model_id : existing.default_model_id || "").trim();
    const modelError = hasModelInput ? await this.deps.validateModelId(modelId) : null;
    if (modelError) {
      return jsonResponse({ error: modelError }, 400);
    }
    const now = Date.now();
    const docs = { ...existing.docs };
    if (payload.docs && typeof payload.docs === "object" && !Array.isArray(payload.docs)) {
      for (const [rawKey, rawDoc] of Object.entries(payload.docs as Record<string, unknown>)) {
        const fallback = docs[this.normalizeDocKey(rawKey)];
        const doc = this.normalizeDocument(rawKey, rawDoc, fallback, now);
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
          : this.clampToolRounds(payload.max_tool_rounds, existing.max_tool_rounds),
      context_management_enabled:
        payload.context_management_enabled === undefined
          ? existing.context_management_enabled
          : payload.context_management_enabled !== false,
      context_max_tokens:
        payload.context_max_tokens === undefined
          ? existing.context_max_tokens
          : this.clampContextTokens(payload.context_max_tokens, existing.context_max_tokens),
      context_compression_target_tokens:
        payload.context_compression_target_tokens === undefined
          ? existing.context_compression_target_tokens
          : this.clampCompressionTargetTokens(
              payload.context_compression_target_tokens,
              existing.context_compression_target_tokens
            ),
      context_keep_recent_messages:
        payload.context_keep_recent_messages === undefined
          ? existing.context_keep_recent_messages
          : this.clampKeepRecentMessages(payload.context_keep_recent_messages, existing.context_keep_recent_messages),
      disabled_skill_keys:
        payload.disabled_skill_keys === undefined ? existing.disabled_skill_keys : this.normalizeSkillKeys(payload.disabled_skill_keys),
      telegram_command_enabled:
        payload.telegram_command_enabled === undefined
          ? existing.telegram_command_enabled
          : payload.telegram_command_enabled !== false,
      telegram_prefix_trigger:
        payload.telegram_prefix_trigger === undefined
          ? existing.telegram_prefix_trigger
          : this.normalizeTelegramPrefix(payload.telegram_prefix_trigger, existing.telegram_prefix_trigger),
      telegram_private_chat_enabled:
        payload.telegram_private_chat_enabled === undefined
          ? existing.telegram_private_chat_enabled
          : payload.telegram_private_chat_enabled === true,
      docs,
      created_at: existing.created_at,
      updated_at: now,
    };
    await this.saveConfig(next);
    return jsonResponse({ status: "ok", config: this.publicConfig(next) });
  }

  private async readDocumentPayload(request: Request): Promise<Record<string, unknown>> {
    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("text/markdown") || contentType.includes("text/plain")) {
      return { content_md: await request.text() };
    }
    return await parseJson<Record<string, unknown>>(request);
  }

  async handleDocGet(rawKey: string): Promise<Response> {
    const key = this.normalizeDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    const config = await this.loadConfig();
    const doc = config.docs[key];
    if (!doc) {
      return jsonResponse({ error: `agent doc not found: ${key}` }, 404);
    }
    return jsonResponse({ doc, config: this.publicConfig(config) });
  }

  async handleDocUpdate(rawKey: string, request: Request): Promise<Response> {
    const key = this.normalizeDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.readDocumentPayload(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const config = await this.loadConfig();
    const now = Date.now();
    const doc = this.normalizeDocument(key, { ...payload, key }, config.docs[key], now);
    if (!doc) {
      return jsonResponse({ error: "invalid doc" }, 400);
    }
    config.docs[doc.key] = doc;
    config.updated_at = now;
    await this.saveConfig(config);
    return jsonResponse({ status: "ok", doc, config: this.publicConfig(config) });
  }

  async handleDocAppend(rawKey: string, request: Request): Promise<Response> {
    const key = this.normalizeDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.readDocumentPayload(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const config = await this.loadConfig();
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
    await this.saveConfig(config);
    return jsonResponse({ status: "ok", doc: nextDoc, config: this.publicConfig(config) });
  }

  async handleDocDelete(rawKey: string): Promise<Response> {
    const key = this.normalizeDocKey(rawKey);
    if (!key) {
      return jsonResponse({ error: "missing doc key" }, 400);
    }
    if (this.isDefaultDocKey(key)) {
      return jsonResponse({ error: "default agent docs cannot be deleted" }, 400);
    }
    const config = await this.loadConfig();
    if (!config.docs[key]) {
      return jsonResponse({ error: `agent doc not found: ${key}` }, 404);
    }
    delete config.docs[key];
    config.updated_at = Date.now();
    await this.saveConfig(config);
    return jsonResponse({ status: "ok", deleted_key: key, config: this.publicConfig(config) });
  }

  normalizeChatHistory(input: unknown): AgentChatMessage[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((entry) => {
        const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : "";
        const content = String(item.content || "").trim();
        return role && content ? { role, content: this.deps.truncateText(content, 4000) } : null;
      })
      .filter((entry): entry is AgentChatMessage => Boolean(entry))
      .slice(-500);
  }

  normalizeSessionId(input: unknown): string {
    return String(input || "")
      .trim()
      .replace(/[^a-zA-Z0-9:._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 128);
  }

  private sessionContextKey(sessionId: string): string {
    return `${AGENT_SESSION_CONTEXT_PREFIX}${sessionId}`;
  }

  normalizeToolLogEntries(input: unknown): AgentToolLogEntry[] {
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

  normalizeSessionContext(raw: unknown, sessionId: string): AgentSessionContext {
    const now = Date.now();
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    return {
      session_id: sessionId,
      summary: this.deps.truncateText(source.summary || "", 40_000).trim(),
      compressed_turns: Math.max(0, Math.trunc(Number(source.compressed_turns) || 0)),
      recent_history: this.normalizeChatHistory(source.recent_history),
      last_context:
        source.last_context && typeof source.last_context === "object" && !Array.isArray(source.last_context)
          ? (source.last_context as Record<string, unknown>)
          : {},
      tool_calls: this.normalizeToolLogEntries(source.tool_calls),
      tool_call_count: Math.max(0, Math.trunc(Number(source.tool_call_count) || 0)),
      last_message: this.deps.truncateText(source.last_message || "", 4000),
      last_answer: this.deps.truncateText(source.last_answer || "", 4000),
      created_at: Number(source.created_at || now),
      updated_at: Number(source.updated_at || now),
    };
  }

  async loadSessionContext(sessionId: string): Promise<AgentSessionContext> {
    const normalized = this.normalizeSessionId(sessionId);
    const stored = normalized ? await this.deps.storage.get<AgentSessionContext>(this.sessionContextKey(normalized)) : null;
    return this.normalizeSessionContext(stored, normalized);
  }

  async saveSessionContext(context: AgentSessionContext): Promise<void> {
    const sessionId = this.normalizeSessionId(context.session_id);
    if (!sessionId) {
      return;
    }
    await this.deps.storage.put(this.sessionContextKey(sessionId), {
      ...context,
      session_id: sessionId,
      summary: this.deps.truncateText(context.summary, 40_000).trim(),
      recent_history: this.normalizeChatHistory(context.recent_history),
      last_context: context.last_context || {},
      tool_calls: this.normalizeToolLogEntries(context.tool_calls),
      tool_call_count: Math.max(0, Math.trunc(Number(context.tool_call_count) || 0)),
      last_message: this.deps.truncateText(context.last_message || "", 4000),
      last_answer: this.deps.truncateText(context.last_answer || "", 4000),
      updated_at: Date.now(),
    });
  }

  async clearSessionContext(sessionId: string): Promise<void> {
    const normalized = this.normalizeSessionId(sessionId);
    if (normalized) {
      await this.deps.storage.delete(this.sessionContextKey(normalized));
    }
  }

  publicSessionContext(context: AgentSessionContext): Record<string, unknown> {
    const sessionId = this.normalizeSessionId(context.session_id);
    const kind = sessionId.startsWith("telegram:") ? "telegram" : sessionId.startsWith("webui:") ? "webui" : "custom";
    return {
      session_id: sessionId,
      kind,
      summary: context.summary,
      preview: this.deps.truncateText(context.summary, 420),
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

  async listSessionContexts(): Promise<AgentSessionContext[]> {
    const entries = await this.deps.storage.list<AgentSessionContext>({ prefix: AGENT_SESSION_CONTEXT_PREFIX, limit: 500 });
    return Array.from(entries.entries())
      .map(([key, value]) => this.normalizeSessionContext(value, key.slice(AGENT_SESSION_CONTEXT_PREFIX.length)))
      .filter((context) => context.session_id)
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  async handleSessionsList(): Promise<Response> {
    const sessions = await this.listSessionContexts();
    return jsonResponse({
      sessions: sessions.map((context) => this.publicSessionContext(context)),
      total: sessions.length,
    });
  }

  async handleSessionGet(rawSessionId: string): Promise<Response> {
    const sessionId = this.normalizeSessionId(rawSessionId);
    if (!sessionId) {
      return jsonResponse({ error: "missing session_id" }, 400);
    }
    const context = await this.loadSessionContext(sessionId);
    if (!context.summary && context.recent_history.length === 0 && context.tool_calls.length === 0) {
      return jsonResponse({ error: `agent session not found: ${sessionId}` }, 404);
    }
    return jsonResponse({
      session: {
        ...this.publicSessionContext(context),
        recent_history: context.recent_history,
        tool_calls: context.tool_calls,
      },
    });
  }

  async clearSessionById(rawSessionId: string): Promise<Response> {
    const sessionId = this.normalizeSessionId(rawSessionId);
    if (!sessionId) {
      return jsonResponse({ error: "missing session_id" }, 400);
    }
    await this.clearSessionContext(sessionId);
    if (sessionId.startsWith("telegram:")) {
      const [, chatId = "", userId = "anonymous"] = sessionId.split(":");
      if (chatId) {
        await this.deps.deleteTelegramHistory(chatId, userId);
      }
    }
    return jsonResponse({ status: "ok", deleted_session_id: sessionId });
  }

  async handleSessionPromoteMemory(rawSessionId: string, request: Request): Promise<Response> {
    const sessionId = this.normalizeSessionId(rawSessionId);
    if (!sessionId) {
      return jsonResponse({ error: "missing session_id" }, 400);
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch {
      payload = {};
    }
    const context = await this.loadSessionContext(sessionId);
    const text = String(payload.text || context.summary || "").trim();
    if (!text) {
      return jsonResponse({ error: "session summary is empty" }, 400);
    }
    const now = Date.now();
    const config = await this.loadConfig();
    const existing = config.docs.memory || this.defaultDocuments(now).memory;
    const heading = String(payload.heading || `Promoted session memory: ${sessionId}`).trim().slice(0, 160);
    const nextDoc: AgentDocument = {
      ...existing,
      content_md: `${existing.content_md.trim()}\n\n## ${heading}\n\n${this.deps.truncateText(text, 12_000)}`.slice(0, 256 * 1024),
      updated_at: now,
    };
    config.docs.memory = nextDoc;
    config.updated_at = now;
    await this.saveConfig(config);
    return jsonResponse({
      status: "ok",
      session: this.publicSessionContext(context),
      doc: nextDoc,
      config: this.publicConfig(config),
    });
  }
}
