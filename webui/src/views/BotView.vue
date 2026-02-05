<template>
  <main class="bot-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ t("bot.title") }}</h2>
        <p class="muted">{{ t("bot.subtitle") }}</p>
      </div>

      <!-- Basic Settings Card -->
      <n-card :title="t('bot.tokenLabel')">
        <n-form-item :label="t('bot.tokenLabel')" :feedback="tokenHint">
          <n-input
            v-model:value="form.token"
            type="password"
            show-password-on="click"
            :placeholder="t('bot.tokenPlaceholder')"
          />
        </n-form-item>
        <template #action>
          <n-button type="primary" size="medium" @click="() => saveConfig(false)">
            {{ t("bot.saveConfig") }}
          </n-button>
        </template>
      </n-card>

      <!-- Webhook Management Card -->
      <n-card :title="t('bot.webhookLabel')">
        <n-space vertical>
          <n-form-item :label="t('bot.webhookLabel')">
            <n-input-group>
              <n-input v-model:value="form.webhook_url" :placeholder="defaultWebhook" />
              <n-button secondary @click="fillWebhook">
                {{ t("bot.webhookFill") }}
              </n-button>
              <n-button secondary @click="copyWebhook">
                {{ t("bot.webhookCopy") }}
              </n-button>
            </n-input-group>
            <template #feedback>
              {{ t("bot.webhookHelp") }}
            </template>
          </n-form-item>

          <n-collapse>
            <n-collapse-item :title="t('bot.webhookOptionsLabel')" name="advanced">
              <n-space vertical>
                <div class="webhook-options-grid">
                  <n-switch v-model:value="webhookOptions.drop_pending_updates">
                    <template #checked>{{ t("bot.webhookDropPending") }}</template>
                    <template #unchecked>{{ t("bot.webhookDropPending") }}</template>
                  </n-switch>

                  <n-grid x-gap="12" cols="1 2:2">
                    <n-grid-item>
                      <n-form-item :label="t('bot.webhookSecretPlaceholder')">
                        <n-input
                          v-model:value="webhookOptions.secret_token"
                          :placeholder="t('bot.webhookSecretPlaceholder')"
                        />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item :label="t('bot.webhookMaxConnectionsPlaceholder')">
                        <n-input-number
                          v-model:value="webhookOptions.max_connections"
                          :min="1"
                          :max="100"
                          :placeholder="t('bot.webhookMaxConnectionsPlaceholder')"
                          style="width: 100%"
                        />
                      </n-form-item>
                    </n-grid-item>
                  </n-grid>

                  <n-form-item :label="t('bot.webhookAllowedUpdatesPlaceholder')">
                    <n-input
                      v-model:value="webhookOptions.allowed_updates"
                      :placeholder="t('bot.webhookAllowedUpdatesPlaceholder')"
                    />
                    <template #feedback>
                      {{ t("bot.webhookOptionsHelp") }}
                    </template>
                  </n-form-item>
                </div>
              </n-space>
            </n-collapse-item>
          </n-collapse>

          <n-space>
            <n-button type="primary" :disabled="webhookSetting" @click="setWebhook">
              {{ t("bot.webhookSet") }}
            </n-button>
            <n-button secondary :disabled="webhookLoading" @click="loadWebhookInfo">
              {{ t("bot.webhookInfoRefresh") }}
            </n-button>
            <n-tag v-if="webhookInfo" :type="webhookInfo.url ? 'success' : 'warning'">
              {{ webhookStatus }}
            </n-tag>
          </n-space>

          <n-divider dashed v-if="webhookInfo" />

          <div v-if="webhookInfo" class="webhook-info">
             <n-descriptions bordered label-placement="left" size="small" :column="2">
                <n-descriptions-item :label="t('bot.webhookInfoUrl')" :span="2">
                  {{ webhookInfo.url || "-" }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoPending')">
                  {{ webhookInfo.pending_update_count ?? "-" }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoMaxConnections')">
                  {{ webhookInfo.max_connections ?? "-" }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoLastErrorDate')">
                  {{ formatTimestamp(webhookInfo.last_error_date) }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoLastErrorMessage')">
                  {{ webhookInfo.last_error_message || "-" }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoIpAddress')">
                  {{ webhookInfo.ip_address || "-" }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoCustomCert')">
                  {{ webhookInfo.has_custom_certificate ? t("common.ok") : "-" }}
                </n-descriptions-item>
                <n-descriptions-item :label="t('bot.webhookInfoAllowedUpdates')" :span="2">
                  {{ formatAllowedUpdates(webhookInfo.allowed_updates) }}
                </n-descriptions-item>
             </n-descriptions>
          </div>
          <p v-else class="muted">{{ t("bot.webhookInfoEmpty") }}</p>
        </n-space>
      </n-card>

      <n-card :title="t('bot.tester.title')">
        <n-space vertical>
          <p class="muted">{{ t("bot.tester.hint") }}</p>

          <n-form-item :label="t('bot.tester.workflowLabel')" :show-feedback="false">
            <n-select
              v-model:value="updateTester.workflow_id"
              clearable
              :options="workflowOptions"
              :placeholder="t('bot.tester.workflowPlaceholder')"
              @update:value="fillUpdatePayload"
            />
          </n-form-item>

          <n-form-item :label="t('bot.tester.templateLabel')" :show-feedback="false">
            <n-input-group>
              <n-select
                v-model:value="updateTester.template"
                :options="updateTemplateOptions"
                @update:value="fillUpdatePayload"
              />
              <n-button secondary @click="fillUpdatePayload">
                {{ t("bot.tester.fillTemplate") }}
              </n-button>
            </n-input-group>
          </n-form-item>

          <n-form-item :label="t('bot.tester.payloadLabel')" :show-feedback="false">
            <n-input
              v-model:value="updateTester.payload"
              type="textarea"
              :rows="16"
              :placeholder="t('bot.tester.payloadPlaceholder')"
            />
          </n-form-item>

          <n-space>
            <n-button type="primary" :loading="updateTester.sending" @click="sendTestUpdate">
              {{ t("bot.tester.send") }}
            </n-button>
          </n-space>

          <n-form-item v-if="updateTester.response" :label="t('bot.tester.responseLabel')" :show-feedback="false">
            <n-code :code="updateTester.response" language="json" word-wrap />
          </n-form-item>
        </n-space>
      </n-card>

      <!-- Commands Management Card -->
      <n-card :title="t('bot.commandsTitle')">
        <template #header-extra>
           <n-space>
             <n-button size="small" type="info" secondary @click="syncCommands">
               {{ t("bot.syncCommands") }}
             </n-button>
             <n-button size="small" type="success" @click="addCommand">
               {{ t("bot.addCommand") }}
             </n-button>
           </n-space>
        </template>
        
        <n-space vertical>
           <p class="muted">{{ t("bot.commandsHelp") }}</p>
           
           <div v-if="form.commands.length === 0" class="muted-box">
             {{ t("bot.commandsEmpty") }}
           </div>

           <div v-else class="commands-list">
              <template v-for="(cmd, index) in form.commands" :key="index">
                 <n-card size="small" class="command-item-card" embedded>
                    <n-grid x-gap="12" y-gap="8" cols="1 600:4" item-responsive>
                       <!-- Row 1 -->
                       <n-grid-item span="1 600:1">
                          <n-form-item :label="t('bot.commandLabel')" :show-label="false">
                            <n-input v-model:value="cmd.command" :placeholder="t('bot.commandPlaceholder')">
                              <template #prefix>/</template>
                            </n-input>
                          </n-form-item>
                       </n-grid-item>
                       <n-grid-item span="1 600:3">
                          <n-form-item :label="t('bot.descriptionLabel')" :show-label="false">
                            <n-input v-model:value="cmd.description" :placeholder="t('bot.descriptionPlaceholder')" />
                          </n-form-item>
                       </n-grid-item>

                       <!-- Row 2 -->
                       <n-grid-item span="1 600:1">
                          <n-form-item :show-label="false">
                             <n-select 
                               v-model:value="cmd.workflow_id" 
                               :options="workflowOptions" 
                               :placeholder="t('bot.workflowLabel')"
                             />
                          </n-form-item>
                       </n-grid-item>
                       <n-grid-item span="1 600:1">
                          <n-form-item :show-label="false">
                             <n-select 
                               v-model:value="cmd.arg_mode" 
                               :options="argModeOptions" 
                             />
                          </n-form-item>
                       </n-grid-item>
                       <n-grid-item span="1 600:1">
                           <n-form-item :show-label="false">
                             <n-input v-model:value="cmd.args_schema" :placeholder="t('bot.argsSchemaPlaceholder')" />
                           </n-form-item>
                       </n-grid-item>
                       <n-grid-item span="1 600:1" class="command-actions">
                           <n-button type="error" dashed block @click="removeCommand(index)">
                             {{ t("bot.removeCommand") }}
                           </n-button>
                       </n-grid-item>
                    </n-grid>
                 </n-card>
              </template>
           </div>
           
           <div class="command-footer-actions">
              <n-button type="primary" @click="registerCommands">
                {{ t("bot.registerCommands") }}
              </n-button>
              <n-button secondary @click="() => saveConfig(false)">
                {{ t("bot.saveConfig") }}
              </n-button>
           </div>
        </n-space>
      </n-card>
    </n-space>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { 
  NCard, NInput, NInputGroup, NButton, NSwitch, NCollapse, NCollapseItem,
  NFormItem, NGrid, NGridItem, NSpace, NTag, NDivider, NDescriptions, NDescriptionsItem,
  NSelect, NInputNumber, NCode
} from "naive-ui";
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

type UpdateTemplateId = "workflow_command" | "callback_workflow" | "message_keyword";

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
const updateTester = reactive({
  template: "workflow_command" as UpdateTemplateId,
  workflow_id: "",
  payload: "",
  sending: false,
  response: "",
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

const updateTemplateOptions = computed(() => [
  { value: "workflow_command", label: t("bot.tester.templateWorkflowCommand") },
  { value: "callback_workflow", label: t("bot.tester.templateCallbackWorkflow") },
  { value: "message_keyword", label: t("bot.tester.templateMessageKeyword") },
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

const saveConfig = async (silent = false) => {
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
    if (!silent) {
       (window as any).showInfoModal?.(t("bot.saveSuccess"));
    }
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

const syncCommands = async () => {
  try {
    const data = await apiJson<{ status: string; commands: BotCommandApi[] }>("/api/bot/commands/remote");
    form.commands = Array.isArray(data.commands) ? data.commands.map(normalizeCommand) : [];
    (window as any).showInfoModal?.(t("bot.syncSuccess"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("bot.syncFailed", { error: error.message || error }), true);
  }
};

const registerCommands = async () => {
  // Auto-save before registering to prevent data loss on refresh
  try {
    await saveConfig(true);
  } catch (error) {
    // If save fails, stop registration
    return;
  }

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

const findWorkflowButtonId = (workflowId: string): string => {
  if (!workflowId) {
    return "";
  }
  const found = Object.values(store.state.buttons || {}).find((button: any) => {
    const type = String(button?.type || "").toLowerCase();
    const targetWorkflowId = String(button?.payload?.workflow_id || "");
    return type === "workflow" && targetWorkflowId === workflowId;
  }) as any;
  return found?.id ? String(found.id) : "";
};

const buildSampleUpdate = (template: UpdateTemplateId): Record<string, unknown> => {
  const now = Math.floor(Date.now() / 1000);
  const updateId = Number(`9${Date.now().toString().slice(-8)}`);
  const workflowId = String(updateTester.workflow_id || "").trim();
  if (template === "workflow_command") {
    return {
      update_id: updateId,
      message: {
        message_id: 1001,
        date: now,
        text: `/workflow ${workflowId || "<workflow_id>"}`,
        chat: { id: 123456789, type: "private" },
        from: { id: 987654321, is_bot: false, first_name: "Tester", username: "tester" },
      },
    };
  }
  if (template === "message_keyword") {
    return {
      update_id: updateId,
      message: {
        message_id: 1002,
        date: now,
        text: "hello bot",
        chat: { id: 123456789, type: "private" },
        from: { id: 987654321, is_bot: false, first_name: "Tester", username: "tester" },
      },
    };
  }
  const workflowButtonId = findWorkflowButtonId(workflowId);
  return {
    update_id: updateId,
    callback_query: {
      id: `cbq_${Date.now()}`,
      from: { id: 987654321, is_bot: false, first_name: "Tester", username: "tester" },
      data: `tgbtn:wf:${workflowButtonId || "<workflow_button_id>"}`,
      message: {
        message_id: 1000,
        date: now,
        text: "Main Menu",
        chat: { id: 123456789, type: "private" },
      },
    },
  };
};

const fillUpdatePayload = () => {
  updateTester.payload = JSON.stringify(buildSampleUpdate(updateTester.template), null, 2);
};

const sendTestUpdate = async () => {
  if (!updateTester.workflow_id && updateTester.template !== "message_keyword") {
    (window as any).showInfoModal?.(t("bot.tester.workflowRequired"), true);
    return;
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(updateTester.payload || "{}");
  } catch (error: any) {
    (window as any).showInfoModal?.(
      t("bot.tester.invalidJson", { error: error?.message || String(error) }),
      true
    );
    return;
  }

  updateTester.sending = true;
  try {
    const response = await apiJson<Record<string, unknown>>("/telegram/webhook", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    updateTester.response = JSON.stringify(response || {}, null, 2);
    (window as any).showInfoModal?.(t("bot.tester.sendSuccess"));
  } catch (error: any) {
    updateTester.response = error?.message ? String(error.message) : String(error);
    (window as any).showInfoModal?.(t("bot.tester.sendFailed", { error: error.message || error }), true);
  } finally {
    updateTester.sending = false;
  }
};

watch(
  workflowOptions,
  (options) => {
    if (!updateTester.workflow_id && options.length > 0) {
      updateTester.workflow_id = String(options[0].value);
      fillUpdatePayload();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (!store.loading && Object.keys(store.state.workflows || {}).length === 0) {
    store.loadAll().catch(() => null);
  }
  loadConfig();
  loadWebhookInfo();
  fillUpdatePayload();
});
</script>

<style scoped>
.bot-page {
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
}

.command-item-card {
  margin-bottom: 8px;
}

.muted {
  color: var(--text-color-secondary);
}

.muted-box {
  color: var(--text-color-secondary);
  padding: 16px;
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
}

.command-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>
