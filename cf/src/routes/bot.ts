import { callTelegram, type TelegramEnv } from "../actions/telegram";
import {
  BotConfig,
  BotCommand,
  normalizeBotConfig,
  normalizeCommandArgMode,
  type CommandArgMode,
} from "../bot-config";
import { jsonResponse, parseJson } from "../utils";

export interface BotApiHandlers {
  getBotConfig(): Promise<Response>;
  putBotConfig(request: Request): Promise<Response>;
  getRemoteCommands(): Promise<Response>;
  registerCommands(request: Request): Promise<Response>;
  setWebhook(request: Request): Promise<Response>;
  getWebhookInfo(): Promise<Response>;
}

export interface BotApiDependencies {
  loadBotConfig(): Promise<BotConfig>;
  saveBotConfig(config: BotConfig): Promise<void>;
  resolveTelegramToken(): Promise<{ token: string; source: "env" | "config" | "none" }>;
  getTelegramEnv(): Promise<TelegramEnv>;
  bindTelegramWebhook(
    webhookUrl: string,
    options?: {
      drop_pending_updates?: boolean;
      secret_token?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }
  ): Promise<Record<string, unknown>>;
}

export interface BotApiRouteRequest {
  path: string;
  method: string;
  request: Request;
  handlers: BotApiHandlers;
}

export async function handleBotApiRequest(args: BotApiRouteRequest): Promise<Response | null> {
  const { path, method, request, handlers } = args;

  if (path === "/api/bot/config") {
    if (method === "GET") {
      return await handlers.getBotConfig();
    }
    if (method === "PUT") {
      return await handlers.putBotConfig(request);
    }
    return null;
  }

  if (path === "/api/bot/commands/remote" && method === "GET") {
    return await handlers.getRemoteCommands();
  }

  if (path === "/api/bot/commands/register" && method === "POST") {
    return await handlers.registerCommands(request);
  }

  if (path === "/api/bot/webhook/set" && method === "POST") {
    return await handlers.setWebhook(request);
  }

  if (path === "/api/bot/webhook/info" && method === "GET") {
    return await handlers.getWebhookInfo();
  }

  return null;
}

export function createBotApiHandlers(deps: BotApiDependencies): BotApiHandlers {
  return {
    getBotConfig: async () => {
      const config = await deps.loadBotConfig();
      const resolved = await deps.resolveTelegramToken();
      return jsonResponse({
        token: config.token || "",
        webhook_url: config.webhook_url || "",
        webhook_secret: config.webhook_secret || "",
        commands: config.commands || [],
        token_source: resolved.source,
        env_token_set: resolved.source === "env",
      });
    },

    putBotConfig: async (request) => {
      let payload: BotConfig;
      try {
        payload = await parseJson<BotConfig>(request);
      } catch (error) {
        return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
      }

      try {
        const commands = Array.isArray(payload.commands) ? payload.commands : [];
        const nextConfig = normalizeBotConfig({
          token: typeof payload.token === "string" ? payload.token : "",
          webhook_url: typeof payload.webhook_url === "string" ? payload.webhook_url : "",
          webhook_secret: typeof payload.webhook_secret === "string" ? payload.webhook_secret.trim() : "",
          commands: commands.map((cmd) => {
            const argMode = normalizeCommandArgMode((cmd as any).arg_mode);
            const argsSchema = Array.isArray((cmd as any).args_schema)
              ? (cmd as any).args_schema.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
              : String((cmd as any).args_schema || "")
                  .split(",")
                  .map((entry: string) => entry.trim())
                  .filter(Boolean);
            return {
              command: String(cmd.command || "").trim().replace(/^\//, ""),
              description: String(cmd.description || "").trim(),
              workflow_id: String((cmd as any).workflow_id || "").trim(),
              arg_mode: argMode,
              args_schema: argsSchema,
            };
          }),
        });

        await deps.saveBotConfig(nextConfig);
        let webhookResult: Record<string, unknown> | null = null;
        if (nextConfig.webhook_url) {
          webhookResult = await deps.bindTelegramWebhook(nextConfig.webhook_url, {
            secret_token: nextConfig.webhook_secret || undefined,
          });
        }
        return jsonResponse({ status: "ok", config: nextConfig, webhook_result: webhookResult });
      } catch (error) {
        return jsonResponse({ error: `bind webhook failed: ${String(error)}` }, 500);
      }
    },

    getRemoteCommands: async () => {
      try {
        const resolved = await deps.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }

        const env = await deps.getTelegramEnv();
        const remoteRes = await callTelegram(env, "getMyCommands", {});
        const remoteCommands = (remoteRes.result as any[]) || [];

        const localConfig = await deps.loadBotConfig();
        const localMap = new Map<string, BotCommand>();
        (localConfig.commands || []).forEach((cmd) => localMap.set(cmd.command, cmd));

        const mergedCommands: BotCommand[] = remoteCommands.map((remoteCmd: any) => {
          const commandName = String(remoteCmd.command || "");
          const description = String(remoteCmd.description || "");
          const existing = localMap.get(commandName);

          return {
            command: commandName,
            description,
            workflow_id: existing?.workflow_id || "",
            arg_mode: existing?.arg_mode || "auto",
            args_schema: existing?.args_schema || [],
          };
        });

        return jsonResponse({ status: "ok", commands: mergedCommands });
      } catch (error) {
        return jsonResponse({ error: `sync commands failed: ${String(error)}` }, 500);
      }
    },

    registerCommands: async (request) => {
      try {
        const payload = await parseJson<BotConfig>(request).catch(() => ({} as BotConfig));
        const stored = await deps.loadBotConfig();
        const rawCommands =
          Array.isArray(payload.commands) && payload.commands.length > 0 ? payload.commands : stored.commands || [];
        const commands = rawCommands
          .map((cmd) => ({
            command: String(cmd.command || "").trim().replace(/^\//, ""),
            description: String(cmd.description || "").trim(),
          }))
          .filter((cmd) => cmd.command);
        const resolved = await deps.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        if (commands.length === 0) {
          return jsonResponse({ error: "no commands provided" }, 400);
        }
        const env = await deps.getTelegramEnv();
        const result = await callTelegram(env, "setMyCommands", { commands });
        return jsonResponse({ status: "ok", result });
      } catch (error) {
        return jsonResponse({ error: `register commands failed: ${String(error)}` }, 500);
      }
    },

    setWebhook: async (request) => {
      try {
        const payload = await parseJson<Record<string, unknown>>(request);
        const stored = await deps.loadBotConfig();
        const url = String(payload.url || stored.webhook_url || "").trim();
        if (!url) {
          return jsonResponse({ error: "missing webhook url" }, 400);
        }
        const secretInput = typeof payload.secret_token === "string" ? payload.secret_token.trim() : undefined;
        const result = await deps.bindTelegramWebhook(url, {
          drop_pending_updates: Boolean(payload.drop_pending_updates),
          secret_token: secretInput,
          max_connections: payload.max_connections !== undefined ? Number(payload.max_connections) : undefined,
          allowed_updates: Array.isArray(payload.allowed_updates) ? payload.allowed_updates.map(String) : undefined,
        });
        const nextConfig = normalizeBotConfig({
          ...stored,
          webhook_url: url,
          webhook_secret: secretInput !== undefined ? secretInput : stored.webhook_secret || "",
        });
        await deps.saveBotConfig(nextConfig);
        return jsonResponse({ status: "ok", result });
      } catch (error) {
        return jsonResponse({ error: `set webhook failed: ${String(error)}` }, 500);
      }
    },

    getWebhookInfo: async () => {
      try {
        const resolved = await deps.resolveTelegramToken();
        if (!resolved.token) {
          return jsonResponse({ error: "missing bot token" }, 400);
        }
        const env = await deps.getTelegramEnv();
        const response = await callTelegram(env, "getWebhookInfo", {});
        const webhookData = (response as any).result || response;
        return jsonResponse({ status: "ok", result: webhookData });
      } catch (error) {
        return jsonResponse({ error: `get webhook info failed: ${String(error)}` }, 500);
      }
    },
  };
}
