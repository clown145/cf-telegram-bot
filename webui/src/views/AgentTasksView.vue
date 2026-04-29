<template>
  <main class="agent-tasks-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.subtitle }}</p>
      </div>

      <n-alert type="info" :bordered="false">
        {{ c.note }}
      </n-alert>

      <n-grid cols="1 1080:3" x-gap="16" y-gap="16">
        <n-grid-item>
          <n-card :title="c.create.title">
            <n-space vertical size="medium">
              <n-form-item :label="c.create.message">
                <n-input
                  v-model:value="draft.message"
                  type="textarea"
                  :autosize="{ minRows: 5, maxRows: 12 }"
                  :placeholder="c.create.messagePlaceholder"
                />
              </n-form-item>

              <n-form-item :label="c.create.titleLabel">
                <n-input v-model:value="draft.title" :placeholder="c.create.titlePlaceholder" clearable />
              </n-form-item>

              <n-grid cols="1 680:2" x-gap="12" y-gap="8">
                <n-grid-item>
                  <n-form-item :label="c.create.model">
                    <n-select
                      v-model:value="draft.model_id"
                      :options="modelOptions"
                      :placeholder="c.create.modelPlaceholder"
                      clearable
                    />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item>
                  <n-form-item :label="c.create.session">
                    <n-input v-model:value="draft.session_id" :placeholder="c.create.sessionPlaceholder" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item>
                  <n-form-item :label="c.create.notifyChat">
                    <n-input v-model:value="draft.notify_chat_id" :placeholder="c.create.notifyChatPlaceholder" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item>
                  <n-form-item :label="c.create.maxAttempts">
                    <n-input-number v-model:value="draft.max_attempts" :min="1" :max="10" style="width: 100%" />
                  </n-form-item>
                </n-grid-item>
              </n-grid>

              <n-space align="center">
                <n-switch v-model:value="draft.schedule_enabled">
                  <template #checked>{{ c.create.scheduleOn }}</template>
                  <template #unchecked>{{ c.create.scheduleOff }}</template>
                </n-switch>
                <span class="muted">{{ c.create.scheduleHelp }}</span>
              </n-space>

              <n-form-item v-if="draft.schedule_enabled" :label="c.create.delayMinutes">
                <n-input-number
                  v-model:value="draft.delay_minutes"
                  :min="1"
                  :max="525600"
                  :step="5"
                  style="width: 100%"
                />
              </n-form-item>

              <n-space>
                <n-button type="primary" :loading="creating" @click="createTask">{{ c.create.submit }}</n-button>
                <n-button secondary @click="resetDraft">{{ c.create.reset }}</n-button>
              </n-space>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item span="1 1080:2">
          <n-space vertical size="medium">
            <n-card :title="c.list.title">
              <template #header-extra>
                <n-space size="small">
                  <n-tag size="small" type="info">{{ c.list.total.replace("{count}", String(tasks.length)) }}</n-tag>
                  <n-button size="small" secondary :loading="loading" @click="loadTasks">{{ c.refresh }}</n-button>
                </n-space>
              </template>

              <n-space vertical size="medium">
                <n-grid cols="1 720:3" x-gap="12" y-gap="10">
                  <n-grid-item>
                    <n-select
                      v-model:value="filters.status"
                      :options="statusOptions"
                      :placeholder="c.list.statusFilter"
                      @update:value="loadTasks"
                    />
                  </n-grid-item>
                  <n-grid-item>
                    <n-input-number
                      v-model:value="filters.limit"
                      :min="10"
                      :max="300"
                      :step="10"
                      style="width: 100%"
                      @update:value="loadTasks"
                    />
                  </n-grid-item>
                  <n-grid-item>
                    <n-space align="center">
                      <n-switch v-model:value="autoRefresh" />
                      <span class="muted">{{ c.list.autoRefresh }}</span>
                    </n-space>
                  </n-grid-item>
                </n-grid>

                <n-empty v-if="!loading && tasks.length === 0" :description="c.list.empty" />
                <div v-else class="task-list">
                  <button
                    v-for="task in tasks"
                    :key="task.id"
                    type="button"
                    class="task-row"
                    :class="{ selected: selectedTaskId === task.id }"
                    @click="selectTask(task.id)"
                  >
                    <div class="task-row-main">
                      <strong>{{ task.title || task.id }}</strong>
                      <n-tag size="small" :type="statusTagType(task.status)">{{ statusLabel(task.status) }}</n-tag>
                    </div>
                    <small class="muted mono">{{ task.id }}</small>
                    <small class="muted">
                      {{ c.list.updated }} {{ formatTime(task.updated_at) }} ·
                      {{ c.list.attempt }} {{ task.attempt }}/{{ task.max_attempts }}
                    </small>
                    <n-progress
                      v-if="typeof task.progress === 'number'"
                      type="line"
                      :percentage="Math.round(task.progress * 100)"
                      :height="6"
                      :show-indicator="false"
                    />
                  </button>
                </div>
              </n-space>
            </n-card>

            <n-card :title="selectedTask?.title || c.detail.title">
              <template #header-extra>
                <n-space v-if="selectedTask" size="small">
                  <n-button size="small" secondary :loading="detailLoading" @click="reloadSelected">{{ c.refresh }}</n-button>
                  <n-button
                    size="small"
                    type="warning"
                    secondary
                    :disabled="!canCancel(selectedTask)"
                    :loading="acting"
                    @click="cancelSelectedTask"
                  >
                    {{ c.actions.cancel }}
                  </n-button>
                  <n-button
                    size="small"
                    type="primary"
                    secondary
                    :disabled="!canRetry(selectedTask)"
                    :loading="acting"
                    @click="retrySelectedTask"
                  >
                    {{ c.actions.retry }}
                  </n-button>
                </n-space>
              </template>

              <n-empty v-if="!selectedTask" :description="c.detail.empty" />
              <n-space v-else vertical size="medium">
                <n-grid cols="1 760:3" x-gap="12" y-gap="12">
                  <n-grid-item>
                    <div class="stat-card">
                      <span>{{ c.detail.status }}</span>
                      <strong>
                        <n-tag :type="statusTagType(selectedTask.status)">{{ statusLabel(selectedTask.status) }}</n-tag>
                      </strong>
                    </div>
                  </n-grid-item>
                  <n-grid-item>
                    <div class="stat-card">
                      <span>{{ c.detail.runner }}</span>
                      <strong>{{ selectedTask.runner || "-" }}</strong>
                    </div>
                  </n-grid-item>
                  <n-grid-item>
                    <div class="stat-card">
                      <span>{{ c.detail.heartbeat }}</span>
                      <strong>{{ formatTime(selectedTask.heartbeat_at) }}</strong>
                    </div>
                  </n-grid-item>
                </n-grid>

                <n-card size="small" :title="c.detail.message">
                  <pre class="code-block">{{ selectedTask.message }}</pre>
                </n-card>

                <n-grid cols="1 860:2" x-gap="12" y-gap="12">
                  <n-grid-item>
                    <n-card size="small" :title="c.detail.meta">
                      <pre class="code-block">{{ formatJson(taskMeta) }}</pre>
                    </n-card>
                  </n-grid-item>
                  <n-grid-item>
                    <n-card size="small" :title="c.detail.result">
                      <pre class="code-block">{{ selectedTask.result_message || formatJson(selectedTask.result || {}) }}</pre>
                    </n-card>
                  </n-grid-item>
                </n-grid>

                <n-card size="small" :title="c.detail.logs">
                  <n-empty v-if="!selectedTask.logs?.length" :description="c.detail.noLogs" />
                  <div v-else class="log-list">
                    <div v-for="(log, index) in selectedTask.logs" :key="`${log.at}:${index}`" class="log-row">
                      <div class="log-head">
                        <n-tag size="small" :type="logTagType(log.level)">{{ log.level }}</n-tag>
                        <span class="muted">{{ formatTime(log.at) }}</span>
                      </div>
                      <div>{{ log.message }}</div>
                      <pre v-if="log.data !== undefined" class="code-block compact">{{ formatJson(log.data) }}</pre>
                    </div>
                  </div>
                </n-card>
              </n-space>
            </n-card>
          </n-space>
        </n-grid-item>
      </n-grid>
    </n-space>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NProgress,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
} from "naive-ui";
import { apiJson, getErrorMessage } from "../services/api";
import { showInfoModal } from "../services/uiBridge";
import { useI18n } from "../i18n";

type AgentTaskStatus = "queued" | "waiting" | "running" | "succeeded" | "failed" | "cancelled" | "stalled";

interface AgentTaskLog {
  at: number;
  level: "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

interface AgentTask {
  id: string;
  type: string;
  status: AgentTaskStatus;
  title: string;
  source: string;
  message: string;
  session_id: string;
  model_id: string;
  notify_chat_id: string;
  scheduled_at: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
  heartbeat_at: number | null;
  current_step: string;
  progress: number | null;
  attempt: number;
  max_attempts: number;
  workflow_instance_id: string;
  runner: string;
  cancel_requested: boolean;
  result_message: string;
  result: unknown;
  error: string;
  logs: AgentTaskLog[];
}

interface LlmModelPublic {
  id: string;
  provider_id: string;
  model: string;
  name: string;
  enabled: boolean;
}

interface LlmProviderPublic {
  id: string;
  name: string;
}

interface LlmConfigResponse {
  providers: Record<string, LlmProviderPublic>;
  models: Record<string, LlmModelPublic>;
}

const zh = {
  title: "Agent 任务队列",
  subtitle: "把 Agent 对话变成可追踪的后台任务，支持未来执行、心跳、失败重试、Telegram 结果通知。",
  note: "Cloudflare Workflows 可用时会作为长期任务 runner；没有绑定时使用 Durable Object alarm 和 waitUntil 兜底。",
  refresh: "刷新",
  saved: "已提交",
  create: {
    title: "创建任务",
    titleLabel: "任务标题",
    titlePlaceholder: "可选，默认使用消息前 160 字",
    message: "任务指令",
    messagePlaceholder: "例如：明天上午检查今天失败的工作流，并把结果发到这个群",
    model: "指定模型",
    modelPlaceholder: "留空使用 Agent 默认模型",
    session: "会话 ID",
    sessionPlaceholder: "可选，例如 task:daily-check",
    notifyChat: "结果通知 chat_id",
    notifyChatPlaceholder: "可选，Telegram chat_id",
    maxAttempts: "最大尝试次数",
    scheduleOn: "定时执行",
    scheduleOff: "立即执行",
    scheduleHelp: "定时任务会进入 waiting，时间到后再运行。",
    delayMinutes: "延迟分钟数",
    submit: "提交任务",
    reset: "重置",
  },
  list: {
    title: "任务列表",
    total: "{count} 个",
    statusFilter: "按状态筛选",
    autoRefresh: "自动刷新",
    empty: "暂无任务。",
    updated: "更新",
    attempt: "尝试",
  },
  detail: {
    title: "任务详情",
    empty: "请选择一个任务。",
    status: "状态",
    runner: "Runner",
    heartbeat: "心跳",
    message: "任务指令",
    meta: "元数据",
    result: "执行结果",
    logs: "任务日志",
    noLogs: "暂无日志。",
  },
  actions: {
    cancel: "取消",
    retry: "重试",
  },
  statuses: {
    all: "全部状态",
    queued: "排队",
    waiting: "等待",
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    cancelled: "已取消",
    stalled: "心跳超时",
  },
  errors: {
    loadFailed: "加载失败：{error}",
    createFailed: "创建失败：{error}",
    actionFailed: "操作失败：{error}",
    messageRequired: "请先填写任务指令。",
  },
};

const en = {
  title: "Agent Task Queue",
  subtitle: "Run agent chats as trackable background tasks with scheduling, heartbeat, retries, and Telegram notifications.",
  note: "Cloudflare Workflows is used as the durable runner when bound; otherwise the Worker falls back to Durable Object alarms and waitUntil.",
  refresh: "Refresh",
  saved: "Submitted",
  create: {
    title: "Create Task",
    titleLabel: "Task Title",
    titlePlaceholder: "Optional. Defaults to the first 160 chars of the message.",
    message: "Task Prompt",
    messagePlaceholder: "Example: tomorrow morning, check failed workflows and send a summary to this group",
    model: "Model",
    modelPlaceholder: "Empty uses the agent default model",
    session: "Session ID",
    sessionPlaceholder: "Optional, e.g. task:daily-check",
    notifyChat: "Notify chat_id",
    notifyChatPlaceholder: "Optional Telegram chat_id",
    maxAttempts: "Max Attempts",
    scheduleOn: "Scheduled",
    scheduleOff: "Run Now",
    scheduleHelp: "Scheduled tasks stay waiting until their due time.",
    delayMinutes: "Delay Minutes",
    submit: "Submit Task",
    reset: "Reset",
  },
  list: {
    title: "Tasks",
    total: "{count}",
    statusFilter: "Filter by status",
    autoRefresh: "Auto refresh",
    empty: "No tasks yet.",
    updated: "Updated",
    attempt: "Attempt",
  },
  detail: {
    title: "Task Detail",
    empty: "Select a task.",
    status: "Status",
    runner: "Runner",
    heartbeat: "Heartbeat",
    message: "Prompt",
    meta: "Metadata",
    result: "Result",
    logs: "Logs",
    noLogs: "No logs.",
  },
  actions: {
    cancel: "Cancel",
    retry: "Retry",
  },
  statuses: {
    all: "All Statuses",
    queued: "Queued",
    waiting: "Waiting",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
    stalled: "Stalled",
  },
  errors: {
    loadFailed: "Load failed: {error}",
    createFailed: "Create failed: {error}",
    actionFailed: "Action failed: {error}",
    messageRequired: "Please enter a task prompt first.",
  },
};

const { locale } = useI18n();
const c = computed(() => (locale.value === "zh-CN" ? zh : en));
const loading = ref(false);
const detailLoading = ref(false);
const creating = ref(false);
const acting = ref(false);
const autoRefresh = ref(true);
const tasks = ref<AgentTask[]>([]);
const selectedTask = ref<AgentTask | null>(null);
const selectedTaskId = ref("");
const llmConfig = ref<LlmConfigResponse>({ providers: {}, models: {} });
let refreshTimer: number | undefined;

const filters = reactive({
  status: "",
  limit: 100,
});

const draft = reactive({
  title: "",
  message: "",
  model_id: "",
  session_id: "",
  notify_chat_id: "",
  max_attempts: 3,
  schedule_enabled: false,
  delay_minutes: 60,
});

const statusOptions = computed(() => [
  { value: "", label: c.value.statuses.all },
  { value: "queued", label: c.value.statuses.queued },
  { value: "waiting", label: c.value.statuses.waiting },
  { value: "running", label: c.value.statuses.running },
  { value: "succeeded", label: c.value.statuses.succeeded },
  { value: "failed", label: c.value.statuses.failed },
  { value: "cancelled", label: c.value.statuses.cancelled },
  { value: "stalled", label: c.value.statuses.stalled },
]);

const modelOptions = computed(() =>
  Object.values(llmConfig.value.models || {}).map((model) => {
    const provider = llmConfig.value.providers?.[model.provider_id];
    return {
      value: model.id,
      label: `${provider?.name || model.provider_id} / ${model.name || model.model}`,
    };
  })
);

const taskMeta = computed(() => {
  const task = selectedTask.value;
  if (!task) return {};
  return {
    id: task.id,
    source: task.source,
    session_id: task.session_id,
    model_id: task.model_id,
    notify_chat_id: task.notify_chat_id,
    current_step: task.current_step,
    scheduled_at: task.scheduled_at,
    created_at: task.created_at,
    started_at: task.started_at,
    finished_at: task.finished_at,
    workflow_instance_id: task.workflow_instance_id,
    cancel_requested: task.cancel_requested,
    error: task.error,
  };
});

const resetDraft = () => {
  draft.title = "";
  draft.message = "";
  draft.model_id = "";
  draft.session_id = "";
  draft.notify_chat_id = "";
  draft.max_attempts = 3;
  draft.schedule_enabled = false;
  draft.delay_minutes = 60;
};

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatTime = (value?: number | null) => (value ? new Date(value).toLocaleString(locale.value) : "-");

const statusLabel = (status: AgentTaskStatus) => c.value.statuses[status] || status;

const statusTagType = (status: AgentTaskStatus) => {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "stalled") return "error";
  if (status === "running") return "info";
  if (status === "waiting" || status === "queued") return "warning";
  return "default";
};

const logTagType = (level: AgentTaskLog["level"]) => {
  if (level === "error") return "error";
  if (level === "warn") return "warning";
  return "info";
};

const canCancel = (task: AgentTask) => !["succeeded", "failed", "cancelled"].includes(task.status);
const canRetry = (task: AgentTask) => ["failed", "stalled", "cancelled"].includes(task.status);

const loadModels = async () => {
  const data = await apiJson<LlmConfigResponse>("/api/llm/config");
  llmConfig.value = { providers: data.providers || {}, models: data.models || {} };
};

const loadTaskDetail = async (taskId: string) => {
  if (!taskId) {
    selectedTask.value = null;
    return;
  }
  detailLoading.value = true;
  try {
    const data = await apiJson<{ task: AgentTask }>(`/api/tasks/${encodeURIComponent(taskId)}`);
    selectedTask.value = data.task;
  } finally {
    detailLoading.value = false;
  }
};

const loadTasks = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    params.set("limit", String(filters.limit || 100));
    const data = await apiJson<{ tasks: AgentTask[] }>(`/api/tasks?${params.toString()}`);
    tasks.value = data.tasks || [];
    const nextId =
      selectedTaskId.value && tasks.value.some((task) => task.id === selectedTaskId.value)
        ? selectedTaskId.value
        : tasks.value[0]?.id || "";
    selectedTaskId.value = nextId;
    await loadTaskDetail(nextId);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    loading.value = false;
  }
};

const selectTask = async (taskId: string) => {
  selectedTaskId.value = taskId;
  try {
    await loadTaskDetail(taskId);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const reloadSelected = async () => {
  if (!selectedTaskId.value) return;
  try {
    await loadTaskDetail(selectedTaskId.value);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const createTask = async () => {
  const message = draft.message.trim();
  if (!message) {
    showInfoModal(c.value.errors.messageRequired, true);
    return;
  }
  creating.value = true;
  try {
    const scheduledAt = draft.schedule_enabled
      ? Date.now() + Math.max(1, Number(draft.delay_minutes) || 1) * 60_000
      : undefined;
    const data = await apiJson<{ task: AgentTask }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: draft.title.trim(),
        message,
        model_id: draft.model_id || "",
        session_id: draft.session_id.trim(),
        notify_chat_id: draft.notify_chat_id.trim(),
        max_attempts: draft.max_attempts,
        scheduled_at: scheduledAt,
        source: "webui",
      }),
    });
    resetDraft();
    selectedTaskId.value = data.task.id;
    showInfoModal(c.value.saved);
    await loadTasks();
  } catch (error) {
    showInfoModal(c.value.errors.createFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    creating.value = false;
  }
};

const cancelSelectedTask = async () => {
  const task = selectedTask.value;
  if (!task) return;
  acting.value = true;
  try {
    const data = await apiJson<{ task: AgentTask }>(`/api/tasks/${encodeURIComponent(task.id)}/cancel`, {
      method: "POST",
    });
    selectedTask.value = data.task;
    await loadTasks();
  } catch (error) {
    showInfoModal(c.value.errors.actionFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    acting.value = false;
  }
};

const retrySelectedTask = async () => {
  const task = selectedTask.value;
  if (!task) return;
  acting.value = true;
  try {
    const data = await apiJson<{ task: AgentTask }>(`/api/tasks/${encodeURIComponent(task.id)}/retry`, {
      method: "POST",
    });
    selectedTask.value = data.task;
    await loadTasks();
  } catch (error) {
    showInfoModal(c.value.errors.actionFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    acting.value = false;
  }
};

const startRefreshTimer = () => {
  if (refreshTimer !== undefined) {
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  if (!autoRefresh.value) return;
  refreshTimer = window.setInterval(() => {
    void loadTasks();
  }, 10_000);
};

watch(autoRefresh, startRefreshTimer);

onMounted(() => {
  void Promise.all([loadModels(), loadTasks()]);
  startRefreshTimer();
});

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) {
    window.clearInterval(refreshTimer);
  }
});
</script>

<style scoped>
.agent-tasks-page {
  padding: 18px;
}

.task-list {
  display: grid;
  gap: 10px;
  max-height: 560px;
  overflow: auto;
}

.task-row {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 7px;
  padding: 12px;
  text-align: left;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.task-row:hover,
.task-row.selected {
  border-color: rgba(0, 255, 127, 0.42);
  background: rgba(0, 255, 127, 0.05);
}

.task-row-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.task-row-main strong {
  overflow-wrap: anywhere;
}

.stat-card {
  display: grid;
  gap: 6px;
  min-height: 74px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-card span {
  color: rgba(225, 225, 225, 0.62);
  font-size: 12px;
}

.stat-card strong {
  overflow-wrap: anywhere;
}

.code-block {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
  color: rgba(225, 225, 225, 0.9);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.code-block.compact {
  max-height: 220px;
  margin-top: 8px;
  font-size: 12px;
}

.log-list {
  display: grid;
  gap: 10px;
  max-height: 420px;
  overflow: auto;
}

.log-row {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow-wrap: anywhere;
}

.muted {
  color: rgba(225, 225, 225, 0.62);
}
</style>
