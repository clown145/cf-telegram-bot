<template>
  <main class="bot-page">
    <section class="bot-card">
      <h2>{{ t("bot.title") }}</h2>
      <p class="muted">{{ t("bot.subtitle") }}</p>

      <div class="field">
        <label>{{ t("bot.tokenLabel") }}</label>
        <input v-model="form.token" type="password" :placeholder="t('bot.tokenPlaceholder')" />
        <p class="muted">
          {{ tokenHint }}
        </p>
      </div>

      <div class="field">
        <label>{{ t("bot.webhookLabel") }}</label>
        <div class="inline-row">
          <input v-model="form.webhook_url" type="text" :placeholder="defaultWebhook" />
          <button class="secondary" type="button" @click="fillWebhook">{{ t("bot.webhookFill") }}</button>
          <button class="secondary" type="button" @click="copyWebhook">{{ t("bot.webhookCopy") }}</button>
        </div>
        <p class="muted">{{ t("bot.webhookHelp") }}</p>
      </div>

      <div class="commands-section">
        <div class="commands-header">
          <h3>{{ t("bot.commandsTitle") }}</h3>
          <button class="secondary" type="button" @click="addCommand">{{ t("bot.addCommand") }}</button>
        </div>
        <p class="muted">{{ t("bot.commandsHelp") }}</p>
        <p class="muted">{{ t("bot.commandsHelpArgs") }}</p>

        <div v-if="form.commands.length === 0" class="muted" style="margin-top: 12px;">
          {{ t("bot.commandsEmpty") }}
        </div>
        <div v-else class="command-row command-header">
          <span>{{ t("bot.commandLabel") }}</span>
          <span>{{ t("bot.descriptionLabel") }}</span>
          <span>{{ t("bot.workflowLabel") }}</span>
          <span>{{ t("bot.argModeLabel") }}</span>
          <span>{{ t("bot.argsSchemaLabel") }}</span>
          <span></span>
        </div>
        <div v-for="(cmd, index) in form.commands" :key="index" class="command-row">
          <input
            v-model="cmd.command"
            type="text"
            :placeholder="t('bot.commandPlaceholder')"
            class="command-input"
          />
          <input
            v-model="cmd.description"
            type="text"
            :placeholder="t('bot.descriptionPlaceholder')"
            class="command-desc"
          />
          <select v-model="cmd.workflow_id" class="command-workflow">
            <option value="">{{ t("bot.workflowUnbound") }}</option>
            <option v-for="wf in workflowOptions" :key="wf.value" :value="wf.value">
              {{ wf.label }}
            </option>
          </select>
          <select v-model="cmd.arg_mode" class="command-argmode">
            <option v-for="mode in argModeOptions" :key="mode.value" :value="mode.value">
              {{ mode.label }}
            </option>
          </select>
          <input
            v-model="cmd.args_schema"
            type="text"
            :placeholder="t('bot.argsSchemaPlaceholder')"
            class="command-schema"
          />
          <button class="danger" type="button" @click="removeCommand(index)">{{ t("bot.removeCommand") }}</button>
        </div>
        <p v-if="form.commands.length > 0" class="muted command-args-hint">
          {{ t("bot.argsSchemaHint") }}
        </p>
      </div>

      <div class="bot-actions">
        <button class="secondary" type="button" @click="saveConfig">{{ t("bot.saveConfig") }}</button>
        <button type="button" @click="registerCommands">{{ t("bot.registerCommands") }}</button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { apiJson } from "../services/api";
import { useI18n } from "../i18n";
import { useAppStore } from "../stores/app";

type CommandArgMode = "auto" | "text" | "kv" | "json";

interface BotCommandApi {
  command: string;
  description: string;
  workflow_id?: string;
  arg_mode?: CommandArgMode;
  args_schema?: string[] | string;
}

interface BotCommandForm {
  command: string;
  description: string;
  workflow_id: string;
  arg_mode: CommandArgMode;
  args_schema: string;
}

interface BotConfigResponse {
  token: string;
  webhook_url: string;
  commands: BotCommandApi[];
  token_source: "env" | "config" | "none";
  env_token_set: boolean;
}

interface BotConfigForm {
  token: string;
  webhook_url: string;
  commands: BotCommandForm[];
  token_source: "env" | "config" | "none";
  env_token_set: boolean;
}

const { t } = useI18n();
const store = useAppStore();
const form = reactive<BotConfigForm>({
  token: "",
  webhook_url: "",
  commands: [] as BotCommandForm[],
  token_source: "none",
  env_token_set: false,
});

const workflowOptions = computed(() =>
  Object.values(store.state.workflows || {}).map((workflow) => ({
    value: workflow.id,
    label: workflow.name ? `${workflow.name} (${workflow.id})` : workflow.id,
  }))
);

const argModeOptions = computed(() => [
  { value: "auto", label: t("bot.argModeAuto") },
  { value: "text", label: t("bot.argModeText") },
  { value: "kv", label: t("bot.argModeKv") },
  { value: "json", label: t("bot.argModeJson") },
]);

const defaultWebhook = computed(() => {
  try {
    return `${window.location.origin}/telegram/webhook`;
  } catch {
    return "/telegram/webhook";
  }
});

const tokenHint = computed(() => {
  if (form.token_source === "env") {
    return t("bot.tokenFromEnv");
  }
  if (form.token_source === "config") {
    return t("bot.tokenFromConfig");
  }
  return t("bot.tokenMissing");
});

const normalizeCommand = (cmd: BotCommandApi): BotCommandForm => {
  const schema =
    Array.isArray(cmd.args_schema) ? cmd.args_schema.join(", ") : String(cmd.args_schema || "");
  const argMode: CommandArgMode = cmd.arg_mode || "auto";
  return {
    command: String(cmd.command || ""),
    description: String(cmd.description || ""),
    workflow_id: String(cmd.workflow_id || ""),
    arg_mode: ["auto", "text", "kv", "json"].includes(argMode) ? argMode : "auto",
    args_schema: schema,
  };
};

const loadConfig = async () => {
  try {
    const data = await apiJson<BotConfigResponse>("/api/bot/config");
    form.token = data.token || "";
    form.webhook_url = data.webhook_url || "";
    form.commands = Array.isArray(data.commands) ? data.commands.map(normalizeCommand) : [];
    form.token_source = data.token_source || "none";
    form.env_token_set = Boolean(data.env_token_set);
  } catch (error: any) {
    (window as any).showInfoModal?.(t("bot.loadFailed", { error: error.message || error }), true);
  }
};

const fillWebhook = () => {
  form.webhook_url = defaultWebhook.value;
};

const copyWebhook = async () => {
  const value = form.webhook_url || defaultWebhook.value;
  try {
    await navigator.clipboard.writeText(value);
    (window as any).showInfoModal?.(t("bot.copySuccess"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("bot.copyFailed", { error: error.message || error }), true);
  }
};

const addCommand = () => {
  form.commands.push({
    command: "",
    description: "",
    workflow_id: "",
    arg_mode: "auto",
    args_schema: "",
  });
};

const removeCommand = (index: number) => {
  form.commands.splice(index, 1);
};

const saveConfig = async () => {
  try {
    await apiJson("/api/bot/config", {
      method: "PUT",
      body: JSON.stringify({
        token: form.token,
        webhook_url: form.webhook_url,
        commands: form.commands.map((cmd) => ({
          command: cmd.command,
          description: cmd.description,
          workflow_id: cmd.workflow_id,
          arg_mode: cmd.arg_mode,
          args_schema: cmd.args_schema,
        })),
      }),
    });
    await loadConfig();
    (window as any).showInfoModal?.(t("bot.saveSuccess"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("bot.saveFailed", { error: error.message || error }), true);
  }
};

const registerCommands = async () => {
  try {
    await apiJson("/api/bot/commands/register", {
      method: "POST",
      body: JSON.stringify({ commands: form.commands }),
    });
    (window as any).showInfoModal?.(t("bot.registerSuccess"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("bot.registerFailed", { error: error.message || error }), true);
  }
};

onMounted(() => {
  if (!store.loading && Object.keys(store.state.workflows || {}).length === 0) {
    store.loadAll().catch(() => null);
  }
  loadConfig();
});
</script>
