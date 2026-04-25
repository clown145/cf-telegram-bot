<template>
  <main class="llm-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.subtitle }}</p>
      </div>

      <n-card :title="providerDraft.id ? c.provider.editTitle : c.provider.createTitle">
        <n-grid cols="1 760:2" x-gap="14" y-gap="10">
          <n-grid-item>
            <n-form-item :label="c.provider.name">
              <n-input v-model:value="providerDraft.name" :placeholder="c.provider.namePlaceholder" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item :label="c.provider.type">
              <n-select
                v-model:value="providerDraft.type"
                :options="providerTypeOptions"
                @update:value="handleProviderTypeChange"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item :label="c.provider.baseUrl">
              <n-input v-model:value="providerDraft.base_url" :placeholder="defaultBaseUrl" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item :label="c.provider.apiKey" :feedback="apiKeyHint">
              <n-input
                v-model:value="providerDraft.api_key"
                type="password"
                show-password-on="click"
                :placeholder="c.provider.apiKeyPlaceholder"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>
        <n-space align="center">
          <n-switch v-model:value="providerDraft.enabled">
            <template #checked>{{ c.provider.enabled }}</template>
            <template #unchecked>{{ c.provider.disabled }}</template>
          </n-switch>
          <span class="muted">{{ c.provider.enabledHelp }}</span>
        </n-space>
        <template #action>
          <n-space>
            <n-button type="primary" :loading="savingProvider" @click="saveProvider">
              {{ providerDraft.id ? c.provider.save : c.provider.create }}
            </n-button>
            <n-button secondary @click="resetProviderDraft">{{ c.provider.reset }}</n-button>
            <n-button secondary :loading="loading" @click="loadConfig">{{ c.reload }}</n-button>
          </n-space>
        </template>
      </n-card>

      <n-grid cols="1 1100:2" x-gap="16" y-gap="16">
        <n-grid-item>
          <n-card :title="c.provider.listTitle">
            <n-empty v-if="providers.length === 0 && !loading" :description="c.provider.empty" />
            <n-space v-else vertical size="medium">
              <div
                v-for="provider in providers"
                :key="provider.id"
                class="provider-item"
                :class="{ selected: providerDraft.id === provider.id }"
              >
                <div class="provider-main">
                  <div class="provider-title">
                    <strong>{{ provider.name }}</strong>
                    <n-tag size="small" :type="provider.enabled ? 'success' : 'warning'">
                      {{ provider.enabled ? c.provider.enabled : c.provider.disabled }}
                    </n-tag>
                    <n-tag size="small">{{ provider.type }}</n-tag>
                    <n-tag size="small" :type="provider.has_api_key ? 'success' : 'error'">
                      {{ provider.has_api_key ? c.provider.keySaved : c.provider.keyMissing }}
                    </n-tag>
                  </div>
                  <div class="mono muted">{{ provider.base_url }}</div>
                  <div class="muted">
                    {{ c.provider.modelCount }} {{ countModels(provider.id) }}
                  </div>
                </div>
                <n-space>
                  <n-button size="small" secondary @click="editProvider(provider)">
                    {{ c.provider.edit }}
                  </n-button>
                  <n-button
                    size="small"
                    type="info"
                    secondary
                    :loading="fetchingProviderId === provider.id"
                    @click="fetchModels(provider.id)"
                  >
                    {{ c.provider.fetchModels }}
                  </n-button>
                  <n-popconfirm
                    :positive-text="c.confirm"
                    :negative-text="c.cancel"
                    @positive-click="deleteProvider(provider.id)"
                  >
                    <template #trigger>
                      <n-button size="small" type="error" secondary>{{ c.provider.delete }}</n-button>
                    </template>
                    {{ c.provider.deleteConfirm }}
                  </n-popconfirm>
                </n-space>
              </div>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card :title="c.models.title">
            <template #header-extra>
              <n-space>
                <n-tag size="small" type="info">{{ enabledModelCount }} / {{ modelRows.length }}</n-tag>
                <n-button size="small" type="primary" :loading="savingModels" @click="saveModels">
                  {{ c.models.save }}
                </n-button>
              </n-space>
            </template>
            <n-alert type="info" :bordered="false" class="models-help">
              {{ c.models.help }}
            </n-alert>
            <n-empty v-if="modelRows.length === 0 && !loading" :description="c.models.empty" />
            <div v-else class="model-list">
              <div v-for="model in modelRows" :key="model.id" class="model-row">
                <n-switch v-model:value="model.enabled" />
                <div class="model-main">
                  <n-input v-model:value="model.name" size="small" />
                  <div class="mono muted">{{ model.model }}</div>
                </div>
                <n-tag size="small">{{ providerName(model.provider_id) }}</n-tag>
              </div>
            </div>
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-space>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
} from "naive-ui";
import { apiJson, getErrorMessage } from "../services/api";
import { showInfoModal } from "../services/uiBridge";
import { useAppStore } from "../stores/app";
import { useI18n } from "../i18n";

type LlmProviderType = "openai" | "gemini";

interface LlmProviderPublic {
  id: string;
  name: string;
  type: LlmProviderType;
  base_url: string;
  api_key: string;
  enabled: boolean;
  has_api_key: boolean;
}

interface LlmModelPublic {
  id: string;
  provider_id: string;
  model: string;
  name: string;
  enabled: boolean;
}

interface LlmConfigResponse {
  providers: Record<string, LlmProviderPublic>;
  models: Record<string, LlmModelPublic>;
  default_base_urls?: Record<LlmProviderType, string>;
}

const zh = {
  title: "LLM 配置",
  subtitle: "在这里配置模型提供商和启用模型。API Key 只存后端，不会返回给 WebUI。",
  reload: "刷新",
  confirm: "确认",
  cancel: "取消",
  saved: "已保存",
  provider: {
    createTitle: "创建提供商",
    editTitle: "编辑提供商",
    listTitle: "提供商",
    name: "名称",
    namePlaceholder: "例如 OpenAI / Gemini / OpenRouter",
    type: "格式",
    baseUrl: "API 地址",
    apiKey: "API Key",
    apiKeyPlaceholder: "留空表示保留已保存的 Key",
    enabled: "启用",
    disabled: "停用",
    enabledHelp: "停用 provider 后，即使模型启用，节点也不能调用。",
    create: "创建",
    save: "保存",
    reset: "清空表单",
    edit: "编辑",
    delete: "删除",
    deleteConfirm: "删除该提供商会同时删除它下面的模型，确定继续吗？",
    empty: "暂无提供商。先创建一个 OpenAI-compatible 或 Gemini provider。",
    fetchModels: "获取模型",
    keySaved: "Key 已保存",
    keyMissing: "缺少 Key",
    keyPreserved: "留空会保留后端已保存的 Key。",
    keyRequired: "新 provider 需要填写 API Key，之后不会显示明文。",
    modelCount: "模型数：",
  },
  models: {
    title: "模型",
    save: "保存模型",
    help: "只有启用的模型会出现在工作流 LLM 节点的下拉选项中。",
    empty: "暂无模型。请先在 provider 上点击“获取模型”。",
  },
  errors: {
    nameRequired: "请填写 provider 名称",
    saveFailed: "保存失败：{error}",
    loadFailed: "加载失败：{error}",
    fetchFailed: "获取模型失败：{error}",
    deleteFailed: "删除失败：{error}",
  },
};

const en = {
  title: "LLM Config",
  subtitle: "Configure model providers and enabled models. API keys stay server-side and are never returned to WebUI.",
  reload: "Reload",
  confirm: "Confirm",
  cancel: "Cancel",
  saved: "Saved",
  provider: {
    createTitle: "Create Provider",
    editTitle: "Edit Provider",
    listTitle: "Providers",
    name: "Name",
    namePlaceholder: "e.g. OpenAI / Gemini / OpenRouter",
    type: "Format",
    baseUrl: "API Base URL",
    apiKey: "API Key",
    apiKeyPlaceholder: "Leave empty to keep the saved key",
    enabled: "Enabled",
    disabled: "Disabled",
    enabledHelp: "Disabled providers cannot be called, even if their models are enabled.",
    create: "Create",
    save: "Save",
    reset: "Reset Form",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Deleting this provider also deletes its models. Continue?",
    empty: "No providers yet. Create an OpenAI-compatible or Gemini provider first.",
    fetchModels: "Fetch Models",
    keySaved: "Key Saved",
    keyMissing: "Missing Key",
    keyPreserved: "Leave empty to preserve the server-side key.",
    keyRequired: "New providers need an API key. It will not be shown again.",
    modelCount: "Models: ",
  },
  models: {
    title: "Models",
    save: "Save Models",
    help: "Only enabled models appear in the workflow LLM node dropdown.",
    empty: "No models yet. Click Fetch Models on a provider first.",
  },
  errors: {
    nameRequired: "Provider name is required",
    saveFailed: "Save failed: {error}",
    loadFailed: "Load failed: {error}",
    fetchFailed: "Fetch models failed: {error}",
    deleteFailed: "Delete failed: {error}",
  },
};

const { locale } = useI18n();
const store = useAppStore();
const c = computed(() => (locale.value === "zh-CN" ? zh : en));
const loading = ref(false);
const savingProvider = ref(false);
const savingModels = ref(false);
const fetchingProviderId = ref("");
const config = ref<LlmConfigResponse>({
  providers: {},
  models: {},
  default_base_urls: {
    openai: "https://api.openai.com/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta",
  },
});

const providerDraft = reactive({
  id: "",
  name: "",
  type: "openai" as LlmProviderType,
  base_url: "https://api.openai.com/v1",
  api_key: "",
  enabled: true,
  has_api_key: false,
});

const providerTypeOptions = computed(() => [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "gemini", label: "Gemini" },
]);

const defaultBaseUrl = computed(() => config.value.default_base_urls?.[providerDraft.type] || "");
const providers = computed(() => Object.values(config.value.providers || {}));
const modelRows = computed(() =>
  Object.values(config.value.models || {}).sort((a, b) => {
    const providerCompare = providerName(a.provider_id).localeCompare(providerName(b.provider_id));
    return providerCompare || a.name.localeCompare(b.name);
  })
);
const enabledModelCount = computed(() => modelRows.value.filter((model) => model.enabled).length);
const apiKeyHint = computed(() =>
  providerDraft.id && providerDraft.has_api_key ? c.value.provider.keyPreserved : c.value.provider.keyRequired
);

const applyConfig = (nextConfig: LlmConfigResponse) => {
  config.value = {
    providers: nextConfig.providers || {},
    models: nextConfig.models || {},
    default_base_urls: nextConfig.default_base_urls || config.value.default_base_urls,
  };
};

const refreshActionDefinitions = async () => {
  try {
    await store.loadAll();
  } catch (error) {
    console.warn("[llm] refresh action definitions failed:", getErrorMessage(error));
  }
};

const loadConfig = async () => {
  loading.value = true;
  try {
    applyConfig(await apiJson<LlmConfigResponse>("/api/llm/config"));
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    loading.value = false;
  }
};

const resetProviderDraft = () => {
  providerDraft.id = "";
  providerDraft.name = "";
  providerDraft.type = "openai";
  providerDraft.base_url = config.value.default_base_urls?.openai || "https://api.openai.com/v1";
  providerDraft.api_key = "";
  providerDraft.enabled = true;
  providerDraft.has_api_key = false;
};

const handleProviderTypeChange = (value: string) => {
  const nextType = value === "gemini" ? "gemini" : "openai";
  providerDraft.type = nextType;
  if (!providerDraft.id) {
    providerDraft.base_url = config.value.default_base_urls?.[nextType] || providerDraft.base_url;
  }
};

const editProvider = (provider: LlmProviderPublic) => {
  providerDraft.id = provider.id;
  providerDraft.name = provider.name;
  providerDraft.type = provider.type;
  providerDraft.base_url = provider.base_url;
  providerDraft.api_key = "";
  providerDraft.enabled = provider.enabled;
  providerDraft.has_api_key = provider.has_api_key;
};

const providerName = (providerId: string) => config.value.providers?.[providerId]?.name || providerId;
const countModels = (providerId: string) =>
  Object.values(config.value.models || {}).filter((model) => model.provider_id === providerId).length;

const saveProvider = async () => {
  if (!providerDraft.name.trim()) {
    showInfoModal(c.value.errors.nameRequired, true);
    return;
  }
  savingProvider.value = true;
  try {
    const payload: Record<string, unknown> = {
      id: providerDraft.id || undefined,
      name: providerDraft.name.trim(),
      type: providerDraft.type,
      base_url: providerDraft.base_url.trim() || defaultBaseUrl.value,
      enabled: providerDraft.enabled,
    };
    if (providerDraft.api_key.trim()) {
      payload.api_key = providerDraft.api_key.trim();
    }
    const data = await apiJson<{ status: string; provider_id: string; config: LlmConfigResponse }>(
      "/api/llm/providers",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    applyConfig(data.config);
    const savedProvider = data.config.providers[data.provider_id];
    if (savedProvider) {
      editProvider(savedProvider);
    }
    await refreshActionDefinitions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    savingProvider.value = false;
  }
};

const deleteProvider = async (providerId: string) => {
  try {
    const data = await apiJson<{ status: string; config: LlmConfigResponse }>(
      `/api/llm/providers/${encodeURIComponent(providerId)}`,
      { method: "DELETE" }
    );
    applyConfig(data.config);
    if (providerDraft.id === providerId) {
      resetProviderDraft();
    }
    await refreshActionDefinitions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.deleteFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const fetchModels = async (providerId: string) => {
  fetchingProviderId.value = providerId;
  try {
    const data = await apiJson<{ status: string; fetched: number; config: LlmConfigResponse }>(
      `/api/llm/providers/${encodeURIComponent(providerId)}/fetch-models`,
      { method: "POST" }
    );
    applyConfig(data.config);
    await refreshActionDefinitions();
    showInfoModal(`${c.value.provider.fetchModels}: ${data.fetched}`);
  } catch (error) {
    showInfoModal(c.value.errors.fetchFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    fetchingProviderId.value = "";
  }
};

const saveModels = async () => {
  savingModels.value = true;
  try {
    const data = await apiJson<{ status: string; config: LlmConfigResponse }>("/api/llm/models", {
      method: "PUT",
      body: JSON.stringify({
        models: modelRows.value.map((model) => ({
          id: model.id,
          name: model.name,
          enabled: model.enabled,
        })),
      }),
    });
    applyConfig(data.config);
    await refreshActionDefinitions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    savingModels.value = false;
  }
};

onMounted(loadConfig);
</script>

<style scoped>
.llm-page {
  padding: 18px;
}

.provider-item,
.model-row {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}

.provider-item {
  display: flex;
  gap: 14px;
  justify-content: space-between;
  padding: 14px;
}

.provider-item.selected {
  border-color: rgba(0, 255, 127, 0.42);
  box-shadow: 0 0 0 1px rgba(0, 255, 127, 0.12);
}

.provider-main,
.model-main {
  min-width: 0;
  flex: 1;
}

.provider-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.models-help {
  margin-bottom: 14px;
}

.model-list {
  display: grid;
  gap: 10px;
}

.model-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow-wrap: anywhere;
}

.muted {
  color: rgba(225, 225, 225, 0.62);
}

@media (max-width: 760px) {
  .provider-item {
    flex-direction: column;
  }

  .model-row {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
