import { BUILTIN_MODULAR_ACTIONS, ModularActionDefinition } from "./actions/modularActions";
import { callTelegram } from "./actions/telegram";
import { buildRuntimeContext, executeActionPreview, executeWorkflowWithResume, ResumeState } from "./engine/executor";
import { ActionExecutionResult, AwaitConfig, ButtonsModel, PendingExecution, RuntimeContext, WorkflowDefinition } from "./types";
import { CORS_HEADERS, defaultState, generateId, jsonResponse, parseJson } from "./utils";
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

export class StateStore implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

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
      await this.handleCommandButton(state, buttonId, chatId, userId, messageId, query);
      return;
    }

    await this.answerCallbackQuery(query.id as string);
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

    const result = await executeActionPreview({
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

    const result = await executeWorkflowWithResume(
      { env: await this.getTelegramEnv(), state, button, menu, runtime, preview: false },
      workflow
    );
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

    const result = await executeWorkflowWithResume(
      { env: await this.getTelegramEnv(), state, button: record.button, menu: record.menu, runtime, preview: false },
      workflow,
      resumeState
    );

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
