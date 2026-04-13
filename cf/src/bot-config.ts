export type CommandArgMode = "auto" | "text" | "kv" | "json";

export interface BotCommand {
  command: string;
  description: string;
  workflow_id?: string;
  arg_mode?: CommandArgMode;
  args_schema?: string[];
}

export interface BotConfig {
  token?: string;
  webhook_url?: string;
  webhook_secret?: string;
  commands?: BotCommand[];
}

const COMMAND_ARG_MODES = new Set<CommandArgMode>(["auto", "text", "kv", "json"]);

export function normalizeCommandArgMode(value: unknown): CommandArgMode {
  const raw = String(value || "").trim().toLowerCase();
  return COMMAND_ARG_MODES.has(raw as CommandArgMode) ? (raw as CommandArgMode) : "auto";
}

export function normalizeBotCommand(command: BotCommand): BotCommand {
  return {
    command: String(command.command || "").trim().replace(/^\//, ""),
    description: String(command.description || "").trim(),
    workflow_id: typeof command.workflow_id === "string" ? command.workflow_id : "",
    arg_mode: normalizeCommandArgMode(command.arg_mode),
    args_schema: Array.isArray(command.args_schema)
      ? command.args_schema.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
  };
}

export function normalizeBotConfig(config?: BotConfig | null): BotConfig {
  const normalized = config ?? {};
  const commands = Array.isArray(normalized.commands) ? normalized.commands : [];
  return {
    token: typeof normalized.token === "string" ? normalized.token : "",
    webhook_url: typeof normalized.webhook_url === "string" ? normalized.webhook_url : "",
    webhook_secret: typeof normalized.webhook_secret === "string" ? normalized.webhook_secret : "",
    commands: commands.map((command) => normalizeBotCommand(command)),
  };
}
