<template>
  <main class="agent-sessions-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.subtitle }}</p>
      </div>

      <n-grid cols="1 1080:3" x-gap="16" y-gap="16">
        <n-grid-item>
          <n-card :title="c.sessions.title">
            <template #header-extra>
              <n-button size="small" secondary :loading="loading" @click="loadSessions">{{ c.refresh }}</n-button>
            </template>
            <n-space vertical size="small">
              <n-empty v-if="sessions.length === 0" :description="c.sessions.empty" />
              <template v-else>
                <button
                  v-for="session in sessions"
                  :key="session.session_id"
                  type="button"
                  class="session-row"
                  :class="{ selected: selectedSessionId === session.session_id }"
                  @click="selectSession(session.session_id)"
                >
                  <strong>{{ session.session_id }}</strong>
                  <small>{{ session.kind }} · {{ c.sessions.tools }} {{ session.tool_call_count || 0 }}</small>
                  <small>
                    {{ c.sessions.recent }} {{ session.recent_history_count || 0 }} · {{ formatTime(session.updated_at) }}
                  </small>
                </button>
              </template>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item span="1 1080:2">
          <n-space vertical size="medium">
            <n-card :title="selectedSession?.session_id || c.detail.title">
              <template #header-extra>
                <n-space v-if="selectedSession">
                  <n-button
                    size="small"
                    type="primary"
                    secondary
                    :loading="saving"
                    @click="promoteSelectedSession"
                  >
                    {{ c.actions.promote }}
                  </n-button>
                  <n-popconfirm
                    :positive-text="c.confirm"
                    :negative-text="c.cancel"
                    @positive-click="clearSelectedSession"
                  >
                    <template #trigger>
                      <n-button size="small" type="error" secondary :loading="saving">{{ c.actions.clear }}</n-button>
                    </template>
                    {{ c.actions.clearConfirm }}
                  </n-popconfirm>
                </n-space>
              </template>

              <n-empty v-if="!selectedSession" :description="c.detail.empty" />
              <n-space v-else vertical size="medium">
                <n-alert type="info" :bordered="false">
                  {{ c.detail.help }}
                </n-alert>
                <n-form-item :label="c.memory.label">
                  <n-input
                    v-model:value="memoryDraft"
                    type="textarea"
                    :placeholder="c.memory.placeholder"
                    :autosize="{ minRows: 3, maxRows: 8 }"
                  />
                </n-form-item>

                <n-card size="small" :title="c.summary.title">
                  <pre class="code-block">{{ selectedSession.summary || c.summary.empty }}</pre>
                </n-card>

                <n-card size="small" :title="c.context.title">
                  <n-grid cols="1 760:2" x-gap="12" y-gap="12">
                    <n-grid-item>
                      <h4>{{ c.context.meta }}</h4>
                      <pre class="code-block">{{ formatJson(selectedSession.last_context || {}) }}</pre>
                    </n-grid-item>
                    <n-grid-item>
                      <h4>{{ c.context.history }}</h4>
                      <div class="history-list">
                        <div
                          v-for="(message, index) in selectedSession.recent_history || []"
                          :key="`${message.role}:${index}`"
                          class="history-message"
                          :class="message.role"
                        >
                          <strong>{{ message.role }}</strong>
                          <p>{{ message.content }}</p>
                        </div>
                        <n-empty
                          v-if="!selectedSession.recent_history?.length"
                          :description="c.context.noHistory"
                        />
                      </div>
                    </n-grid-item>
                  </n-grid>
                </n-card>

                <n-card size="small" :title="c.tools.title">
                  <n-empty v-if="!selectedSession.tool_calls?.length" :description="c.tools.empty" />
                  <n-space v-else vertical size="small">
                    <div
                      v-for="(record, index) in selectedSession.tool_calls"
                      :key="record.id || `${record.tool}:${index}`"
                      class="tool-row"
                    >
                      <div class="tool-row-head">
                        <strong>{{ record.tool }}</strong>
                        <span class="muted">{{ formatTime(record.created_at) }}</span>
                      </div>
                      <n-collapse>
                        <n-collapse-item :title="c.tools.arguments" :name="`args-${index}`">
                          <pre class="code-block">{{ formatJson(record.arguments || {}) }}</pre>
                        </n-collapse-item>
                        <n-collapse-item :title="c.tools.result" :name="`result-${index}`">
                          <pre class="code-block">{{ formatJson(record.result || {}) }}</pre>
                        </n-collapse-item>
                      </n-collapse>
                    </div>
                  </n-space>
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
import { computed, onMounted, ref } from "vue";
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
  NSpace,
} from "naive-ui";
import { apiJson, getErrorMessage } from "../services/api";
import { showInfoModal } from "../services/uiBridge";
import { useI18n } from "../i18n";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolLog {
  id: string;
  tool_call_id: string;
  tool: string;
  arguments: unknown;
  result: unknown;
  created_at: number;
}

interface AgentSession {
  session_id: string;
  kind: string;
  summary: string;
  preview?: string;
  compressed_turns: number;
  recent_history_count?: number;
  recent_history?: ChatMessage[];
  tool_call_count?: number;
  tool_calls?: ToolLog[];
  last_context?: Record<string, unknown>;
  last_message?: string;
  last_answer?: string;
  created_at: number;
  updated_at: number;
}

const zh = {
  title: "Agent 会话",
  subtitle: "查看每个会话的压缩摘要、最近上下文和工具调用记录，也可以把会话摘要提升到长期记忆。",
  refresh: "刷新",
  saved: "已保存",
  confirm: "确认",
  cancel: "取消",
  sessions: {
    title: "会话列表",
    empty: "暂无会话。Agent 对话后会自动记录。",
    tools: "工具调用",
    recent: "最近消息",
  },
  detail: {
    title: "会话详情",
    empty: "请选择一个会话。",
    help: "摘要来自上下文压缩；上下文快照是最近一次请求的预算、保留消息和压缩状态；工具调用按该会话保存。",
  },
  memory: {
    label: "写入 memory.md 的内容",
    placeholder: "留空则使用完整摘要；也可以只写需要长期记住的事实。",
  },
  summary: {
    title: "压缩摘要",
    empty: "该会话还没有压缩摘要。",
  },
  context: {
    title: "上下文快照",
    meta: "上下文元数据",
    history: "最近对话",
    noHistory: "暂无最近对话。",
  },
  tools: {
    title: "工具调用",
    empty: "这个会话还没有工具调用。",
    arguments: "参数",
    result: "结果",
  },
  actions: {
    promote: "提升到长期记忆",
    clear: "清空会话",
    clearConfirm: "确定清空这个会话的摘要、上下文和工具调用记录吗？Telegram 会话也会同时清理短历史。",
  },
  errors: {
    loadFailed: "加载失败：{error}",
    actionFailed: "操作失败：{error}",
  },
};

const en = {
  title: "Agent Sessions",
  subtitle: "Inspect each session's compressed summary, latest context snapshot, and tool calls. Promote durable facts to memory.",
  refresh: "Refresh",
  saved: "Saved",
  confirm: "Confirm",
  cancel: "Cancel",
  sessions: {
    title: "Sessions",
    empty: "No sessions yet. Agent chats will be recorded automatically.",
    tools: "tool calls",
    recent: "recent messages",
  },
  detail: {
    title: "Session Detail",
    empty: "Select a session.",
    help: "Summary comes from context compression. Context snapshot shows the latest budget, retained messages, and compression state. Tool calls are stored per session.",
  },
  memory: {
    label: "Content to write into memory.md",
    placeholder: "Leave empty to use the full summary, or write only durable facts to remember.",
  },
  summary: {
    title: "Compressed Summary",
    empty: "This session has no compressed summary yet.",
  },
  context: {
    title: "Context Snapshot",
    meta: "Context Metadata",
    history: "Recent Conversation",
    noHistory: "No recent conversation.",
  },
  tools: {
    title: "Tool Calls",
    empty: "This session has no tool calls.",
    arguments: "Arguments",
    result: "Result",
  },
  actions: {
    promote: "Promote to Memory",
    clear: "Clear Session",
    clearConfirm: "Clear this session's summary, context, and tool logs? Telegram short history will also be cleared.",
  },
  errors: {
    loadFailed: "Load failed: {error}",
    actionFailed: "Action failed: {error}",
  },
};

const { locale } = useI18n();
const c = computed(() => (locale.value === "zh-CN" ? zh : en));
const loading = ref(false);
const saving = ref(false);
const sessions = ref<AgentSession[]>([]);
const selectedSessionId = ref("");
const selectedSession = ref<AgentSession | null>(null);
const memoryDraft = ref("");

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatTime = (value?: number) => (value ? new Date(value).toLocaleString(locale.value) : "-");

const loadSessionDetail = async (sessionId: string) => {
  if (!sessionId) {
    selectedSession.value = null;
    return;
  }
  const data = await apiJson<{ session: AgentSession }>(`/api/agent/session/${encodeURIComponent(sessionId)}`);
  selectedSession.value = data.session;
};

const loadSessions = async () => {
  loading.value = true;
  try {
    const data = await apiJson<{ sessions: AgentSession[] }>("/api/agent/sessions");
    sessions.value = data.sessions || [];
    const nextId = selectedSessionId.value && sessions.value.some((session) => session.session_id === selectedSessionId.value)
      ? selectedSessionId.value
      : sessions.value[0]?.session_id || "";
    selectedSessionId.value = nextId;
    await loadSessionDetail(nextId);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    loading.value = false;
  }
};

const selectSession = async (sessionId: string) => {
  selectedSessionId.value = sessionId;
  memoryDraft.value = "";
  try {
    await loadSessionDetail(sessionId);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const promoteSelectedSession = async () => {
  const session = selectedSession.value;
  if (!session) return;
  saving.value = true;
  try {
    await apiJson(`/api/agent/session/${encodeURIComponent(session.session_id)}/promote-memory`, {
      method: "POST",
      body: JSON.stringify({
        text: memoryDraft.value.trim(),
        heading: `Session memory: ${session.session_id}`,
      }),
    });
    memoryDraft.value = "";
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.actionFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    saving.value = false;
  }
};

const clearSelectedSession = async () => {
  const session = selectedSession.value;
  if (!session) return;
  saving.value = true;
  try {
    await apiJson(`/api/agent/session/${encodeURIComponent(session.session_id)}`, { method: "DELETE" });
    selectedSessionId.value = "";
    selectedSession.value = null;
    memoryDraft.value = "";
    await loadSessions();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.actionFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    saving.value = false;
  }
};

onMounted(loadSessions);
</script>

<style scoped>
.agent-sessions-page {
  padding: 18px;
}

.session-row {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 4px;
  padding: 12px;
  text-align: left;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.session-row:hover,
.session-row.selected {
  border-color: rgba(0, 255, 127, 0.42);
  background: rgba(0, 255, 127, 0.05);
}

.session-row strong,
.session-row small {
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

.history-list {
  display: grid;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}

.history-message {
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
}

.history-message.user {
  background: rgba(0, 255, 127, 0.08);
}

.history-message p {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tool-row {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.tool-row-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}

.muted {
  color: rgba(225, 225, 225, 0.62);
}
</style>
