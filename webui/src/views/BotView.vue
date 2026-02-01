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

      <div class="field">
        <label>{{ t("bot.webhookOptionsLabel") }}</label>
        <div class="webhook-options">
          <label class="checkbox-row">
            <input v-model="webhookOptions.drop_pending_updates" type="checkbox" />
            <span>{{ t("bot.webhookDropPending") }}</span>
          </label>
          <div class="inline-row">
            <input
              v-model="webhookOptions.secret_token"
              type="text"
              :placeholder="t('bot.webhookSecretPlaceholder')"
            />
            <input
              v-model.number="webhookOptions.max_connections"
              type="number"
              min="1"
              max="100"
              :placeholder="t('bot.webhookMaxConnectionsPlaceholder')"
            />
          </div>
          <input
            v-model="webhookOptions.allowed_updates"
            type="text"
            :placeholder="t('bot.webhookAllowedUpdatesPlaceholder')"
          />
          <p class="muted">{{ t("bot.webhookOptionsHelp") }}</p>
        </div>
      </div>

      <div class="webhook-actions">
        <button class="secondary" type="button" :disabled="webhookSetting" @click="setWebhook">
          {{ t("bot.webhookSet") }}
        </button>
        <button class="secondary" type="button" :disabled="webhookLoading" @click="loadWebhookInfo">
          {{ t("bot.webhookInfoRefresh") }}
        </button>
        <span class="muted" v-if="webhookInfo">
          {{ t("bot.webhookStatusLabel") }}: {{ webhookStatus }}
        </span>
      </div>

      <div v-if="webhookInfo" class="webhook-info">
        <h4>{{ t("bot.webhookInfoTitle") }}</h4>
        <div class="webhook-info-grid">
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoUrl") }}</span>
            <span class="webhook-info-value">{{ webhookInfo.url || "-" }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoPending") }}</span>
            <span class="webhook-info-value">{{ webhookInfo.pending_update_count ?? "-" }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoLastErrorDate") }}</span>
            <span class="webhook-info-value">{{ formatTimestamp(webhookInfo.last_error_date) }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoLastErrorMessage") }}</span>
            <span class="webhook-info-value">{{ webhookInfo.last_error_message || "-" }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoMaxConnections") }}</span>
            <span class="webhook-info-value">{{ webhookInfo.max_connections ?? "-" }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoAllowedUpdates") }}</span>
            <span class="webhook-info-value">{{ formatAllowedUpdates(webhookInfo.allowed_updates) }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoIpAddress") }}</span>
            <span class="webhook-info-value">{{ webhookInfo.ip_address || "-" }}</span>
          </div>
          <div class="webhook-info-row">
            <span class="webhook-info-label">{{ t("bot.webhookInfoCustomCert") }}</span>
            <span class="webhook-info-value">{{ webhookInfo.has_custom_certificate ? t("common.ok") : "-" }}</span>
          </div>
        </div>
      </div>
      <p v-else class="muted">{{ t("bot.webhookInfoEmpty") }}</p>

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
import { computed, onMounted, reactive, ref } from "vue";
import { apiJson } from "../services/api";
import { useI18n } from "../i18n";
import { useAppStore } from "../stores/app";

type CommandArgMode = "auto" | "text" | "kv" | "json";
interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
  ip_address?: string;
  has_custom_certificate?: boolean;
}

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
const webhookOptions = reactive({
  drop_pending_updates: false,
  secret_token: "",
  max_connections: null as number | null,
  allowed_updates: "",
});
const webhookInfo = ref<WebhookInfo | null>(null);
const webhookLoading = ref(false);
const webhookSetting = ref(false);

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

const webhookStatus = computed(() => {
  if (!webhookInfo.value) {
    return t("bot.webhookStatusMissing");
  }
  return webhookInfo.value.url ? t("bot.webhookStatusActive") : t("bot.webhookStatusMissing");
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

const normalizeAllowedUpdates = (raw: string): string[] =>
  raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const formatAllowedUpdates = (updates?: string[]) => {
  if (!updates || updates.length === 0) {
    return "-";
  }
  return updates.join(", ");
};

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) {
    return "-";
  }
  try {
    return new Date(timestamp * 1000).toLocaleString();
  } catch {
    return "-";
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

const setWebhook = async () => {
  webhookSetting.value = true;
  try {
    const payload: Record<string, unknown> = {
      url: form.webhook_url || defaultWebhook.value,
      drop_pending_updates: webhookOptions.drop_pending_updates,
    };
    const secret = webhookOptions.secret_token.trim();
    if (secret) {
      payload.secret_token = secret;
    }
    if (typeof webhookOptions.max_connections === "number" && webhookOptions.max_connections > 0) {
      payload.max_connections = webhookOptions.max_connections;
    }
    const allowedUpdates = normalizeAllowedUpdates(webhookOptions.allowed_updates);
    if (allowedUpdates.length > 0) {
      payload.allowed_updates = allowedUpdates;
    }
    await apiJson("/api/bot/webhook/set", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    (window as any).showInfoModal?.(t("bot.webhookSetSuccess"));
    await loadWebhookInfo();
  } catch (error: any) {
    (window as any).showInfoModal?.(t("bot.webhookSetFailed", { error: error.message || error }), true);
  } finally {
    webhookSetting.value = false;
  }
};

const loadWebhookInfo = async () => {
  webhookLoading.value = true;
  try {
    const data = await apiJson<{ status: string; result?: WebhookInfo }>("/api/bot/webhook/info");
    webhookInfo.value = data.result || null;
  } catch (error: any) {
    webhookInfo.value = null;
    (window as any).showInfoModal?.(t("bot.webhookInfoFailed", { error: error.message || error }), true);
  } finally {
    webhookLoading.value = false;
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
  loadWebhookInfo();
});
</script>
