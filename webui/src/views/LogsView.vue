<template>
  <main class="logs-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ t("logs.title") }}</h2>
        <p class="muted">{{ t("logs.subtitle") }}</p>
      </div>

      <n-card :title="t('logs.config.title')">
        <n-space vertical size="medium">
          <n-grid cols="1 760:2" x-gap="14" y-gap="10">
            <n-grid-item>
              <n-space align="center" size="small">
                <n-switch v-model:value="configDraft.enabled">
                  <template #checked>{{ t("logs.config.enabled") }}</template>
                  <template #unchecked>{{ t("logs.config.enabled") }}</template>
                </n-switch>
                <span class="muted">{{ t("logs.config.enabledHint") }}</span>
              </n-space>
            </n-grid-item>
            <n-grid-item>
              <n-form-item :label="t('logs.config.keep')" :show-feedback="false">
                <n-input-number
                  v-model:value="configDraft.keep"
                  :min="1"
                  :max="500"
                  style="width: 100%"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>

          <n-space size="large" align="center">
            <n-switch v-model:value="configDraft.include_inputs">
              <template #checked>{{ t("logs.config.includeInputs") }}</template>
              <template #unchecked>{{ t("logs.config.includeInputs") }}</template>
            </n-switch>
            <n-switch v-model:value="configDraft.include_outputs">
              <template #checked>{{ t("logs.config.includeOutputs") }}</template>
              <template #unchecked>{{ t("logs.config.includeOutputs") }}</template>
            </n-switch>
            <n-switch v-model:value="configDraft.include_runtime">
              <template #checked>{{ t("logs.config.includeRuntime") }}</template>
              <template #unchecked>{{ t("logs.config.includeRuntime") }}</template>
            </n-switch>
          </n-space>

          <n-space>
            <n-button type="primary" :loading="configSaving" @click="saveConfig">
              {{ t("logs.config.save") }}
            </n-button>
            <n-button secondary :loading="configLoading" @click="loadConfig">
              {{ t("logs.config.reload") }}
            </n-button>
          </n-space>
        </n-space>
      </n-card>

      <n-card :title="t('logs.list.title')">
        <template #header-extra>
          <n-space>
            <n-tag size="small" type="info">{{ t("logs.list.total", { total }) }}</n-tag>
            <n-button size="small" :loading="listLoading" @click="loadExecutions">
              {{ t("logs.list.refresh") }}
            </n-button>
            <n-popconfirm
              :positive-text="t('common.confirm')"
              :negative-text="t('common.cancel')"
              @positive-click="clearExecutions"
            >
              <template #trigger>
                <n-button size="small" type="error" secondary :disabled="executions.length === 0">
                  {{ t("logs.list.clear") }}
                </n-button>
              </template>
              {{ t("logs.list.clearConfirm") }}
            </n-popconfirm>
          </n-space>
        </template>

        <n-space vertical size="medium">
          <n-grid cols="1 760:4" x-gap="12" y-gap="10">
            <n-grid-item>
              <n-input
                v-model:value="filters.q"
                clearable
                :placeholder="t('logs.list.searchPlaceholder')"
                @keyup.enter="loadExecutions"
              />
            </n-grid-item>
            <n-grid-item>
              <n-select
                v-model:value="filters.workflow_id"
                clearable
                :options="workflowOptions"
                :placeholder="t('logs.list.workflowPlaceholder')"
                @update:value="loadExecutions"
              />
            </n-grid-item>
            <n-grid-item>
              <n-select
                v-model:value="filters.status"
                :options="statusOptions"
                :placeholder="t('logs.list.statusPlaceholder')"
                @update:value="loadExecutions"
              />
            </n-grid-item>
            <n-grid-item>
              <n-form-item :label="t('logs.list.limit')" :show-feedback="false">
                <n-input-number
                  v-model:value="filters.limit"
                  :min="10"
                  :max="500"
                  :step="10"
                  style="width: 100%"
                  @update:value="loadExecutions"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>

          <n-data-table
            class="logs-table"
            :columns="columns"
            :data="executions"
            :loading="listLoading"
            :row-key="rowKey"
            :pagination="false"
          />

          <div v-if="!listLoading && executions.length === 0" class="muted-box">
            {{ t("logs.list.empty") }}
          </div>
        </n-space>
      </n-card>

      <n-drawer v-model:show="detailOpen" placement="right" :width="drawerWidth">
        <n-drawer-content :title="t('logs.detail.title')">
          <div class="drawer-actions">
            <n-button size="small" :loading="detailLoading" :disabled="!selectedId" @click="reloadDetail">
              {{ t("logs.detail.refresh") }}
            </n-button>
            <n-popconfirm
              :positive-text="t('common.confirm')"
              :negative-text="t('common.cancel')"
              @positive-click="deleteSelectedExecution"
            >
              <template #trigger>
                <n-button size="small" type="error" secondary :disabled="!selectedId">
                  {{ t("logs.detail.delete") }}
                </n-button>
              </template>
              {{ t("logs.detail.deleteConfirm") }}
            </n-popconfirm>
          </div>

          <n-space vertical size="large">
            <div v-if="detailLoading" class="muted">{{ t("logs.detail.loading") }}</div>

            <template v-else-if="detail">
              <n-card size="small" embedded :title="t('logs.detail.summary')">
                <n-descriptions bordered size="small" label-placement="left" :column="2">
                  <n-descriptions-item :label="t('logs.table.id')" :span="2">
                    <span class="mono">{{ detail.id }}</span>
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.table.workflow')">
                    {{ detail.workflow_name || detail.workflow_id }}
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.table.status')">
                    <n-tag size="small" :type="statusTagType(detail.status)">
                      {{ statusLabel(detail.status) }}
                    </n-tag>
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.table.time')" :span="2">
                    {{ formatDate(detail.started_at) }} → {{ formatDate(detail.finished_at) }}
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.table.duration')">
                    {{ formatDuration(detail.duration_ms) }}
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.detail.triggerType')">
                    {{ detail.trigger_type || "-" }}
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.table.chat')">
                    <span class="mono">{{ detail.runtime?.chat_id || "-" }}</span>
                  </n-descriptions-item>
                  <n-descriptions-item :label="t('logs.table.user')">
                    <span class="mono">{{ detail.runtime?.user_id || "-" }}</span>
                  </n-descriptions-item>
                  <n-descriptions-item v-if="detail.await_node_id" :label="t('logs.detail.awaitNode')" :span="2">
                    <span class="mono">{{ detail.await_node_id }}</span>
                  </n-descriptions-item>
                  <n-descriptions-item v-if="detail.error" :label="t('logs.detail.error')" :span="2">
                    <span class="error-text">{{ detail.error }}</span>
                  </n-descriptions-item>
                </n-descriptions>
              </n-card>

              <n-card size="small" embedded :title="t('logs.detail.nodes')">
                <n-collapse>
                  <n-collapse-item v-for="(node, idx) in detail.nodes" :key="idx" :name="String(idx)">
                    <template #header>
                      <div class="node-item-header">
                        <n-tag size="small" :type="nodeStatusTagType(node.status)">{{ nodeStatusLabel(node.status) }}</n-tag>
                        <span class="mono node-title">{{ node.action_id }}</span>
                        <span class="muted mono">({{ node.node_id }})</span>
                        <span class="muted">{{ formatDuration(node.duration_ms) }}</span>
                        <span v-if="node.flow_output" class="muted">→ {{ node.flow_output }}</span>
                      </div>
                    </template>

                    <n-space vertical size="medium">
                      <n-tag v-if="node.error" size="small" type="error">{{ node.error }}</n-tag>

                      <n-grid cols="1 900:2" x-gap="12" y-gap="12">
                        <n-grid-item>
                          <div class="section-title">{{ t("logs.detail.inputs") }}</div>
                          <n-code
                            :code="formatJson(node.rendered_params)"
                            language="json"
                            word-wrap
                            class="code-block"
                          />
                        </n-grid-item>
                        <n-grid-item>
                          <div class="section-title">{{ t("logs.detail.outputs") }}</div>
                          <n-code
                            :code="formatJson(node.result)"
                            language="json"
                            word-wrap
                            class="code-block"
                          />
                        </n-grid-item>
                      </n-grid>
                    </n-space>
                  </n-collapse-item>
                </n-collapse>
              </n-card>

              <n-card size="small" embedded :title="t('logs.detail.finalResult')">
                <n-code :code="formatJson(detail.final_result)" language="json" word-wrap class="code-block" />
              </n-card>
            </template>

            <div v-else class="muted-box">{{ t("logs.detail.empty") }}</div>
          </n-space>
        </n-drawer-content>
      </n-drawer>
    </n-space>
  </main>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  NButton,
  NCard,
  NCode,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { apiJson } from "../services/api";
import { useAppStore } from "../stores/app";
import { useI18n } from "../i18n";

type ObsExecutionStatus = "success" | "error" | "pending";
type ObsNodeStatus = "success" | "error" | "skipped" | "pending";

interface ObservabilityConfig {
  enabled: boolean;
  keep: number;
  include_inputs: boolean;
  include_outputs: boolean;
  include_runtime: boolean;
}

interface ObsExecutionSummary {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: ObsExecutionStatus;
  started_at: number;
  finished_at?: number;
  duration_ms?: number;
  trigger_type?: string;
  chat_id?: string;
  user_id?: string;
  error?: string;
  await_node_id?: string;
}

interface ObsNodeTrace {
  node_id: string;
  action_id: string;
  action_kind: string;
  status: ObsNodeStatus;
  allowed: boolean;
  started_at: number;
  finished_at: number;
  duration_ms: number;
  flow_output?: string;
  rendered_params?: unknown;
  result?: unknown;
  error?: string;
}

interface ObsExecutionTrace {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: ObsExecutionStatus;
  started_at: number;
  finished_at?: number;
  duration_ms?: number;
  trigger_type?: string;
  trigger?: unknown;
  runtime?: any;
  nodes: ObsNodeTrace[];
  final_result?: unknown;
  error?: string;
  await_node_id?: string;
}

interface ExecListResponse {
  total: number;
  executions: ObsExecutionSummary[];
}

const store = useAppStore();
const { t, locale } = useI18n();

const configLoading = ref(false);
const configSaving = ref(false);
const configDraft = reactive<ObservabilityConfig>({
  enabled: true,
  keep: 200,
  include_inputs: true,
  include_outputs: true,
  include_runtime: true,
});

const listLoading = ref(false);
const executions = ref<ObsExecutionSummary[]>([]);
const total = ref(0);

const filters = reactive({
  q: "",
  workflow_id: "" as string | null,
  status: "all" as "all" | ObsExecutionStatus,
  limit: 100,
});

const detailOpen = ref(false);
const selectedId = ref<string | null>(null);
const detailLoading = ref(false);
const detail = ref<ObsExecutionTrace | null>(null);

const drawerWidth = ref<number | string>(760);
const updateDrawerWidth = () => {
  if (typeof window === "undefined") return;
  drawerWidth.value = window.innerWidth <= 900 ? "100%" : 760;
};

const rowKey = (row: ObsExecutionSummary) => row.id;

const workflowOptions = computed(() => {
  const options = Object.values(store.state.workflows || {}).map((wf) => ({
    label: wf.name || wf.id,
    value: wf.id,
  }));
  options.sort((a, b) => a.label.localeCompare(b.label, locale.value));
  return options;
});

const statusOptions = computed(() => [
  { label: t("logs.status.all"), value: "all" },
  { label: t("logs.status.success"), value: "success" },
  { label: t("logs.status.error"), value: "error" },
  { label: t("logs.status.pending"), value: "pending" },
]);

const statusLabel = (status: ObsExecutionStatus) => {
  if (status === "success") return t("logs.status.success");
  if (status === "pending") return t("logs.status.pending");
  return t("logs.status.error");
};

const statusTagType = (status: ObsExecutionStatus) => {
  if (status === "success") return "success";
  if (status === "pending") return "warning";
  return "error";
};

const nodeStatusLabel = (status: ObsNodeStatus) => {
  if (status === "success") return t("logs.status.success");
  if (status === "pending") return t("logs.status.pending");
  if (status === "skipped") return t("logs.status.skipped");
  return t("logs.status.error");
};

const nodeStatusTagType = (status: ObsNodeStatus) => {
  if (status === "success") return "success";
  if (status === "pending") return "warning";
  if (status === "skipped") return "default";
  return "error";
};

const formatDate = (ms?: number) => {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString(locale.value);
  } catch {
    return String(ms);
  }
};

const formatDuration = (ms?: number) => {
  if (ms === undefined || ms === null) return "-";
  if (!Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(2)} s`;
  const min = Math.floor(sec / 60);
  const rest = sec - min * 60;
  return `${min}m ${rest.toFixed(1)}s`;
};

const formatJson = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const columns = computed<DataTableColumns<ObsExecutionSummary>>(() => [
  {
    title: t("logs.table.status"),
    key: "status",
    width: 120,
    render: (row) =>
      h(
        NTag,
        { size: "small", type: statusTagType(row.status) as any },
        { default: () => statusLabel(row.status) }
      ),
  },
  {
    title: t("logs.table.workflow"),
    key: "workflow_id",
    render: (row) => row.workflow_name || row.workflow_id,
  },
  {
    title: t("logs.table.time"),
    key: "started_at",
    width: 220,
    render: (row) => formatDate(row.started_at),
  },
  {
    title: t("logs.table.duration"),
    key: "duration_ms",
    width: 120,
    render: (row) => formatDuration(row.duration_ms),
  },
  {
    title: t("logs.table.chat"),
    key: "chat_id",
    width: 140,
    render: (row) => row.chat_id || "-",
  },
  {
    title: t("logs.table.user"),
    key: "user_id",
    width: 140,
    render: (row) => row.user_id || "-",
  },
  {
    title: t("logs.table.id"),
    key: "id",
    ellipsis: { tooltip: true },
    render: (row) => row.id,
  },
  {
    title: "",
    key: "actions",
    width: 110,
    render: (row) =>
      h(
        NButton,
        {
          size: "small",
          secondary: true,
          onClick: () => openDetail(row.id),
        },
        { default: () => t("logs.detail.open") }
      ),
  },
]);

const buildListUrl = () => {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit || 100));
  if (filters.q) params.set("q", filters.q);
  if (filters.workflow_id) params.set("workflow_id", filters.workflow_id);
  if (filters.status !== "all") params.set("status", filters.status);
  return `/api/observability/executions?${params.toString()}`;
};

const loadConfig = async () => {
  configLoading.value = true;
  try {
    const cfg = await apiJson<ObservabilityConfig>("/api/observability/config");
    Object.assign(configDraft, cfg);
  } catch (error: any) {
    (window as any).showInfoModal?.(t("logs.config.loadFailed", { error: error.message || error }), true);
  } finally {
    configLoading.value = false;
  }
};

const saveConfig = async () => {
  configSaving.value = true;
  try {
    const saved = await apiJson<ObservabilityConfig>("/api/observability/config", {
      method: "PUT",
      body: JSON.stringify(configDraft),
    });
    Object.assign(configDraft, saved);
    (window as any).showInfoModal?.(t("logs.config.saveSuccess"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("logs.config.saveFailed", { error: error.message || error }), true);
  } finally {
    configSaving.value = false;
  }
};

const loadExecutions = async () => {
  listLoading.value = true;
  try {
    const data = await apiJson<ExecListResponse>(buildListUrl());
    total.value = data.total || 0;
    executions.value = data.executions || [];
  } catch (error: any) {
    (window as any).showInfoModal?.(t("logs.list.loadFailed", { error: error.message || error }), true);
  } finally {
    listLoading.value = false;
  }
};

const clearExecutions = async () => {
  try {
    await apiJson("/api/observability/executions", { method: "DELETE" });
    await loadExecutions();
    (window as any).showInfoModal?.(t("logs.list.cleared"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("logs.list.clearFailed", { error: error.message || error }), true);
  }
};

const openDetail = async (id: string) => {
  selectedId.value = id;
  detailOpen.value = true;
  await reloadDetail();
};

const reloadDetail = async () => {
  const id = selectedId.value;
  if (!id) return;
  detailLoading.value = true;
  try {
    detail.value = await apiJson<ObsExecutionTrace>(`/api/observability/executions/${encodeURIComponent(id)}`);
  } catch (error: any) {
    detail.value = null;
    (window as any).showInfoModal?.(t("logs.detail.loadFailed", { error: error.message || error }), true);
  } finally {
    detailLoading.value = false;
  }
};

const deleteSelectedExecution = async () => {
  const id = selectedId.value;
  if (!id) return;
  try {
    await apiJson(`/api/observability/executions/${encodeURIComponent(id)}`, { method: "DELETE" });
    detailOpen.value = false;
    selectedId.value = null;
    detail.value = null;
    await loadExecutions();
    (window as any).showInfoModal?.(t("logs.detail.deleted"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("logs.detail.deleteFailed", { error: error.message || error }), true);
  }
};

onMounted(async () => {
  updateDrawerWidth();
  window.addEventListener("resize", updateDrawerWidth);
  await loadConfig();
  await loadExecutions();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateDrawerWidth);
});
</script>

<style scoped>
.logs-page {
  padding: 18px 18px 26px;
}

.page-header h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0.2px;
}

.muted {
  opacity: 0.78;
}

.muted-box {
  padding: 14px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  opacity: 0.8;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.drawer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}

.error-text {
  color: #ff6b6b;
}

.node-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 30px;
}

.node-title {
  font-weight: 600;
}

.section-title {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 8px;
}

.code-block {
  border-radius: 12px;
}
</style>
