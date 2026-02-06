import { BUILTIN_MODULAR_ACTIONS, ModularActionDefinition } from "./actions/modularActions";
import { callTelegram } from "./actions/telegram";
import { buildRuntimeContext, executeActionPreview, executeWorkflowWithResume, ResumeState, type ExecutionTracer, type WorkflowNodeTrace } from "./engine/executor";
import { ActionExecutionResult, AwaitConfig, ButtonsModel, PendingExecution, RuntimeContext, WorkflowDefinition } from "./types";
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

export interface Env {
  STATE_STORE: DurableObjectNamespace;
  WEBUI_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  FILE_BUCKET?: unknown;
}

interface ModularActionFile {
  id: string;
  filename: string;
  content: string;
  metadata?: ModularActionDefinition;
}

interface ExecutionRecord {
  id: string;
  obs_execution_id?: string;
  workflow_id: string;
  exec_order: string[];
  next_index: number;
  node_outputs: Record<string, Record<string, unknown>>;
  global_variables: Record<string, unknown>;
  final_text_parts: string[];
  temp_files_to_clean: string[];
  runtime: RuntimeContext;
  button: Record<string, unknown>;
  menu: Record<string, unknown>;
  await_node_id: string;
  await: AwaitConfig;
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
  commands?: BotCommand[];
}

type TriggerType = "command" | "keyword" | "button";
type WorkflowTestMode = "workflow" | TriggerType | string;

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

interface TriggerIndex {
  byCommand: Map<string, TriggerEntry[]>;
  byButton: Map<string, TriggerEntry[]>;
  byKeyword: TriggerEntry[];
}

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
      if (Array.isArray(options.allowed_updates)) {
        payload.allowed_updates = options.allowed_updates.filter((entry) => typeof entry === "string");
      }
    }
    return await callTelegram(env, "setWebhook", payload);
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

    if (path === "/api/bot/config") {
      if (method === "GET") {
        const config = await this.loadBotConfig();
        const resolved = await this.resolveTelegramToken();
        return jsonResponse({
          token: config.token || "",
          webhook_url: config.webhook_url || "",
          commands: config.commands || [],
          token_source: resolved.source,
          env_token_set: resolved.source === "env",
        });
      }
      if (method === "PUT") {
        let payload: BotConfig;
        try {
          payload = await parseJson<BotConfig>(request);
        } catch (error) {
          return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
        }
        try {
          const commands = Array.isArray(payload.commands) ? payload.commands : [];
          const nextConfig: BotConfig = {
            token: typeof payload.token === "string" ? payload.token : "",
            webhook_url: typeof payload.webhook_url === "string" ? payload.webhook_url : "",
            commands: commands
              .map((cmd) => {
                const rawMode = String((cmd as any).arg_mode || "").trim();
                const argMode: CommandArgMode = ["auto", "text", "kv", "json"].includes(rawMode)
                  ? (rawMode as CommandArgMode)
                  : "auto";
                return {
                  command: String(cmd.command || "")
                    .trim()
                    .replace(/^\//, ""),
                  description: String(cmd.description || "").trim(),
                  workflow_id: String((cmd as any).workflow_id || "").trim(),
                  arg_mode: argMode,
                  args_schema: Array.isArray((cmd as any).args_schema)
                    ? (cmd as any).args_schema.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
                    : String((cmd as any).args_schema || "")
                      .split(",")
                      .map((entry: string) => entry.trim())
                      .filter(Boolean),
                };
              })
              .filter((cmd) => cmd.command),
          };
          await this.saveBotConfig(nextConfig);
          let webhookResult: Record<string, unknown> | null = null;
          if (nextConfig.webhook_url) {
            webhookResult = await this.bindTelegramWebhook(nextConfig.webhook_url);
          }
          return jsonResponse({ status: "ok", config: nextConfig, webhook_result: webhookResult });
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
        const rawCommands = Array.isArray(payload.commands) && payload.commands.length > 0 ? payload.commands : stored.commands || [];
        const commands = rawCommands
          .map((cmd) => ({
            command: String(cmd.command || "").trim().replace(/^\//, ""),
            description: String(cmd.description || "").trim(),
          }))
          .filter((cmd) => cmd.command);
        const resolved = await this.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        if (commands.length === 0) {
          return jsonResponse({ error: "no commands provided" }, 400);
        }
        const env = await this.getTelegramEnv();
        const result = await callTelegram(env, "setMyCommands", { commands });
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
        const result = await this.bindTelegramWebhook(url, {
          drop_pending_updates: Boolean(payload.drop_pending_updates),
          secret_token: typeof payload.secret_token === "string" ? payload.secret_token : undefined,
          max_connections:
            payload.max_connections !== undefined ? Number(payload.max_connections) : undefined,
          allowed_updates: Array.isArray(payload.allowed_updates) ? payload.allowed_updates.map(String) : undefined,
        });
        return jsonResponse({ status: "ok", result });
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

    if (path === "/api/workflows" && method === "GET") {
      const state = await this.loadState();
      return jsonResponse(state.workflows || {});
    }

    if (path.startsWith("/api/workflows/") && path.endsWith("/test") && method === "POST") {
      const rawId = path.slice("/api/workflows/".length, path.length - "/test".length);
      const workflowId = decodeURIComponent(rawId || "");
      return await this.handleWorkflowTest(workflowId, request);
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
          state.workflows[workflowId] = payload as any;
          await this.saveState(state);
          return jsonResponse({ status: "ok", id: workflowId });
        } catch (error) {
          return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
        }
      }
      if (method === "DELETE") {
        if (state.workflows && state.workflows[workflowId]) {
          delete state.workflows[workflowId];
          await this.saveState(state);
        }
        return jsonResponse({ status: "ok", id: workflowId });
      }
    }

    if (path === "/api/actions/local/available" && method === "GET") {
      return jsonResponse({ actions: [] });
    }

    if (path === "/api/actions/modular/available" && method === "GET") {
      const state = await this.loadState();
      const actions = await this.buildModularActionList(state);
      return jsonResponse({ actions, secure_upload_enabled: false });
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

  private async buildModularActionList(state: ButtonsModel) {
    const actions: ModularActionDefinition[] = Object.values(BUILTIN_MODULAR_ACTIONS);
    const dynamicOptions = this.buildDynamicOptions(state);

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

  private buildDynamicOptions(state: ButtonsModel) {
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

    return {
      menus,
      buttons,
      web_apps: webApps,
      local_actions: localActions,
      workflows,
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
        env: await this.getTelegramEnv(),
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

    let env: Env = this.env;
    try {
      env = await this.getTelegramEnv();
    } catch (error) {
      console.error("resolve telegram env failed:", error);
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

  private async handleTelegramWebhook(request: Request): Promise<Response> {
    let update: Record<string, unknown> | null = null;
    try {
      update = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      // Return 200 to prevent Telegram retry storm on bad payloads.
      return jsonResponse({ status: "ok" });
    }

    const task = (async () => {
      try {
        if (update?.message) {
          await this.handleTelegramMessage(update.message as Record<string, unknown>);
        } else if (update?.callback_query) {
          await this.handleTelegramCallbackQuery(
            update.callback_query as Record<string, unknown>
          );
        }
      } catch (error) {
        console.error("telegram webhook handling failed:", error);
      }
    })();

    this.state.waitUntil(task);
    return jsonResponse({ status: "ok" });
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

    if (trimmed.startsWith("/")) {
      const handled = await this.handleCommandText(trimmed, chatId, userId, messageId, state);
      if (!handled) {
        await this.sendText(chatId, `未支持的指令: ${trimmed}`, undefined);
      }
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
        "workflow"
      );
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
            env: await this.getTelegramEnv(),
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
      node_outputs: record.node_outputs,
      global_variables: record.global_variables,
      final_text_parts: record.final_text_parts,
      temp_files_to_clean: record.temp_files_to_clean || [],
    };

    const runtime: RuntimeContext = {
      ...record.runtime,
      variables: record.global_variables,
    };

    const result = await this.executeWorkflowWithObservability({
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

    await this.deleteExecution(record.id);
    await this.handleWorkflowResult(result, runtime, record.workflow_id);
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
      node_outputs: pending.node_outputs,
      global_variables: pending.global_variables,
      final_text_parts: pending.final_text_parts || [],
      temp_files_to_clean: pending.temp_files_to_clean || [],
      runtime: pending.runtime,
      button: pending.button,
      menu: pending.menu,
      await_node_id: pending.node_id,
      await: pending.await,
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
