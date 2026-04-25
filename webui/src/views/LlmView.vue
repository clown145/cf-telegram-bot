<template>
  <main class="llm-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.subtitle }}</p>
      </div>

      <n-card :title="c.provider.formCardTitle">
        <template #header-extra>
          <n-space>
            <n-button size="small" type="primary" secondary @click="openCreateProvider">
              {{ c.provider.newProvider }}
            </n-button>
            <n-button size="small" secondary :loading="loading" @click="loadConfig">
              {{ c.reload }}
            </n-button>
          </n-space>
        </template>

        <n-collapse v-model:expanded-names="providerFormExpanded">
          <n-collapse-item
            :title="providerDraft.id ? c.provider.editTitle : c.provider.createTitle"
            name="provider-form"
          >
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
            <n-space class="form-actions">
              <n-button type="primary" :loading="savingProvider" @click="saveProvider">
                {{ providerDraft.id ? c.provider.save : c.provider.create }}
              </n-button>
              <n-button secondary @click="resetProviderDraft">{{ c.provider.reset }}</n-button>
              <n-button tertiary @click="collapseProviderForm">{{ c.provider.collapse }}</n-button>
            </n-space>
          </n-collapse-item>
        </n-collapse>
        <p v-if="!providerFormOpen" class="muted collapsed-hint">{{ c.provider.collapsedHint }}</p>
      </n-card>

      <n-grid cols="1 1100:2" x-gap="16" y-gap="16">
        <n-grid-item>
          <n-card :title="c.provider.listTitle">
            <template #header-extra>
              <n-button size="small" secondary :disabled="!selectedProviderId" @click="selectProvider('')">
                {{ c.models.showAll }}
              </n-button>
            </template>
            <n-empty v-if="providers.length === 0 && !loading" :description="c.provider.empty" />
            <n-space v-else vertical size="medium">
              <p class="muted">{{ c.provider.filterHint }}</p>
              <div
                v-for="provider in providers"
                :key="provider.id"
                class="provider-item"
                :class="{ selected: selectedProviderId === provider.id }"
                @click="selectProvider(provider.id)"
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
                <n-space class="provider-actions" @click.stop>
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
          <n-card :title="modelsTitle">
            <template #header-extra>
              <n-space>
                <n-tag size="small" type="info">{{ enabledModelCount }} / {{ modelRows.length }}</n-tag>
                <n-popconfirm
                  :positive-text="c.confirm"
                  :negative-text="c.cancel"
                  @positive-click="clearModels"
                >
                  <template #trigger>
                    <n-button size="small" type="error" secondary :disabled="modelRows.length === 0">
                      {{ c.models.clear }}
                    </n-button>
                  </template>
                  {{ c.models.clearConfirm }}
                </n-popconfirm>
                <n-button size="small" type="primary" :loading="savingModels" @click="saveModels">
                  {{ c.models.save }}
                </n-button>
              </n-space>
            </template>
            <n-alert type="info" :bordered="false" class="models-help">
              {{ c.models.help }}
            </n-alert>
            <n-empty v-if="modelRows.length === 0 && !loading" :description="modelsEmptyText" />
            <div v-else class="model-list">
              <div v-for="model in modelRows" :key="model.id" class="model-row">
                <n-switch v-model:value="model.enabled" />
                <div class="model-main">
                  <n-input v-model:value="model.name" size="small" />
                  <div class="mono muted">{{ model.model }}</div>
                </div>
                <n-tag size="small">{{ providerName(model.provider_id) }}</n-tag>
                <n-button size="small" tertiary type="error" @click="deleteModel(model)">
                  {{ c.models.delete }}
                </n-button>
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
  NCollapse,
  NCollapseItem,
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
  subtitle: "配置模型提供商和启用模型。API Key 只存后端，不会返回给 WebUI。",
  reload: "刷新",
  confirm: "确认",
  cancel: "取消",
  saved: "已保存",
  provider: {
    formCardTitle: "提供商配置",
    createTitle: "创建提供商",
    editTitle: "编辑提供商",
    newProvider: "新建提供商",
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
    collapse: "收起",
    edit: "编辑",
    delete: "删除",
    deleteConfirm: "删除该提供商会同时删除它下面的模型，确定继续吗？",
    empty: "暂无提供商。先创建一个 OpenAI-compatible 或 Gemini provider。",
    collapsedHint: "表单默认收起，点击“新建提供商”或提供商上的“编辑”再展开。",
    filterHint: "点击某个提供商只显示它的模型。",
    fetchModels: "获取模型",
    keySaved: "Key 已保存",
    keyMissing: "缺少 Key",
    keyPreserved: "留空会保留后端已保存的 Key。",
    keyRequired: "新 provider 需要填写 API Key，之后不会显示明文。",
    modelCount: "当前列表模型数：",
  },
  models: {
    title: "模型",
    save: "保存启用模型",
    delete: "删除",
    clear: "清空",
    clearConfirm: "确定清空当前显示的全部模型吗？已启用模型也会从后端移除。",
    showAll: "全部模型",
    help: "获取模型只会临时显示候选项；点击保存后，只有启用的模型会存到后端并出现在工作流节点下拉框。",
    empty: "暂无模型。请先在 provider 上点击“获取模型”。",
    emptyForProvider: "该 provider 暂无模型。请点击左侧“获取模型”。",
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
    formCardTitle: "Provider Config",
    createTitle: "Create Provider",
    editTitle: "Edit Provider",
    newProvider: "New Provider",
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
    collapse: "Collapse",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Deleting this provider also deletes its models. Continue?",
    empty: "No providers yet. Create an OpenAI-compatible or Gemini provider first.",
    collapsedHint: "The form is collapsed by default. Click New Provider or Edit to open it.",
    filterHint: "Click a provider to show only its models.",
    fetchModels: "Fetch Models",
    keySaved: "Key Saved",
    keyMissing: "Missing Key",
    keyPreserved: "Leave empty to preserve the server-side key.",
    keyRequired: "New providers need an API key. It will not be shown again.",
    modelCount: "Visible models: ",
  },
  models: {
    title: "Models",
    save: "Save Enabled Models",
    delete: "Delete",
    clear: "Clear",
    clearConfirm: "Clear all currently visible models? Enabled models will also be removed server-side.",
    showAll: "All Models",
    help: "Fetching models only shows temporary candidates. After saving, only enabled models are stored and exposed to workflow nodes.",
    empty: "No models yet. Click Fetch Models on a provider first.",
    emptyForProvider: "No models for this provider. Click Fetch Models on the left.",
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
const selectedProviderId = ref("");
const providerFormExpanded = ref<string[]>([]);
const persistedModelIds = ref<Set<string>>(new Set());
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
const providerFormOpen = computed(() => providerFormExpanded.value.includes("provider-form"));
const modelRows = computed(() =>
  Object.values(config.value.models || {})
    .filter((model) => !selectedProviderId.value || model.provider_id === selectedProviderId.value)
    .sort((a, b) => {
      const providerCompare = providerName(a.provider_id).localeCompare(providerName(b.provider_id));
      return providerCompare || a.name.localeCompare(b.name);
    })
);
const enabledModelCount = computed(() => modelRows.value.filter((model) => model.enabled).length);
const modelsTitle = computed(() =>
  selectedProviderId.value ? `${c.value.models.title} - ${providerName(selectedProviderId.value)}` : c.value.models.title
);
const modelsEmptyText = computed(() => (selectedProviderId.value ? c.value.models.emptyForProvider : c.value.models.empty));
const apiKeyHint = computed(() =>
  providerDraft.id && providerDraft.has_api_key ? c.value.provider.keyPreserved : c.value.provider.keyRequired
);

const applyConfig = (nextConfig: LlmConfigResponse) => {
  persistedModelIds.value = new Set(Object.keys(nextConfig.models || {}));
  config.value = {
    providers: nextConfig.providers || {},
    models: nextConfig.models || {},
    default_base_urls: nextConfig.default_base_urls || config.value.default_base_urls,
  };
  if (selectedProviderId.value && !config.value.providers[selectedProviderId.value]) {
    selectedProviderId.value = "";
  }
};

const mergeFetchedModels = (models: LlmModelPublic[]) => {
  const nextModels = { ...(config.value.models || {}) };
  for (const model of models || []) {
    const existing = nextModels[model.id];
    nextModels[model.id] = {
      ...model,
      name: existing?.name || model.name,
      enabled: Boolean(existing?.enabled || model.enabled),
    };
  }
  config.value = { ...config.value, models: nextModels };
};

const removeLocalModels = (modelIds: string[]) => {
  const removeSet = new Set(modelIds);
  const nextModels = { ...(config.value.models || {}) };
  for (const modelId of removeSet) {
    delete nextModels[modelId];
  }
  config.value = { ...config.value, models: nextModels };
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

const expandProviderForm = () => {
  providerFormExpanded.value = ["provider-form"];
};

const collapseProviderForm = () => {
  providerFormExpanded.value = [];
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

const openCreateProvider = () => {
  resetProviderDraft();
  expandProviderForm();
};

const selectProvider = (providerId: string) => {
  selectedProviderId.value = providerId;
};

const handleProviderTypeChange = (value: string) => {
  const nextType = value === "gemini" ? "gemini" : "openai";
  providerDraft.type = nextType;
  if (!providerDraft.id) {
    providerDraft.base_url = config.value.default_base_urls?.[nextType] || providerDraft.base_url;
  }
};

const editProvider = (provider: LlmProviderPublic) => {
  selectProvider(provider.id);
  providerDraft.id = provider.id;
  providerDraft.name = provider.name;
  providerDraft.type = provider.type;
  providerDraft.base_url = provider.base_url;
  providerDraft.api_key = "";
  providerDraft.enabled = provider.enabled;
  providerDraft.has_api_key = provider.has_api_key;
  expandProviderForm();
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
    selectedProviderId.value = data.provider_id;
    const savedProvider = data.config.providers[data.provider_id];
    if (savedProvider) {
      editProvider(savedProvider);
    }
    collapseProviderForm();
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
      collapseProviderForm();
    }
    await refreshActionDefinitions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.deleteFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const fetchModels = async (providerId: string) => {
  fetchingProviderId.value = providerId;
  selectedProviderId.value = providerId;
  try {
    const data = await apiJson<{
      status: string;
      fetched: number;
      models?: LlmModelPublic[];
      config: LlmConfigResponse;
    }>(`/api/llm/providers/${encodeURIComponent(providerId)}/fetch-models`, {
      method: "POST",
    });
    applyConfig(data.config);
    mergeFetchedModels(data.models || []);
    selectedProviderId.value = providerId;
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
          provider_id: model.provider_id,
          model: model.model,
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

const deleteModel = async (model: LlmModelPublic) => {
  if (!persistedModelIds.value.has(model.id)) {
    removeLocalModels([model.id]);
    return;
  }
  savingModels.value = true;
  try {
    const data = await apiJson<{ status: string; config: LlmConfigResponse }>("/api/llm/models", {
      method: "PUT",
      body: JSON.stringify({
        models: [{ ...model, enabled: false }],
      }),
    });
    applyConfig(data.config);
    await refreshActionDefinitions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.deleteFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    savingModels.value = false;
  }
};

const clearModels = async () => {
  if (!modelRows.value.length) {
    return;
  }
  const visibleModelIds = modelRows.value.map((model) => model.id);
  if (!modelRows.value.some((model) => persistedModelIds.value.has(model.id))) {
    removeLocalModels(visibleModelIds);
    return;
  }
  savingModels.value = true;
  try {
    const data = await apiJson<{ status: string; config: LlmConfigResponse }>("/api/llm/models", {
      method: "PUT",
      body: JSON.stringify({
        models: modelRows.value.map((model) => ({ ...model, enabled: false })),
      }),
    });
    applyConfig(data.config);
    await refreshActionDefinitions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.deleteFailed.replace("{error}", getErrorMessage(error)), true);
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

.collapsed-hint,
.form-actions {
  margin-top: 12px;
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
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.provider-item:hover,
.provider-item.selected {
  border-color: rgba(0, 255, 127, 0.42);
  background: rgba(0, 255, 127, 0.05);
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

.provider-actions {
  align-self: center;
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
  grid-template-columns: auto minmax(0, 1fr) auto auto;
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

  .provider-actions {
    align-self: stretch;
  }

  .model-row {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
