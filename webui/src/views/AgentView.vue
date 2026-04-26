<template>
  <main class="agent-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.subtitle }}</p>
      </div>

      <n-alert type="info" :bordered="false">
        {{ c.runtimeNote }}
      </n-alert>

      <n-grid cols="1 1080:3" x-gap="16" y-gap="16">
        <n-grid-item>
          <n-space vertical size="medium">
            <n-card :title="c.settings.title">
              <n-space vertical size="medium">
                <n-space align="center">
                  <n-switch v-model:value="agentConfig.enabled">
                    <template #checked>{{ c.settings.enabled }}</template>
                    <template #unchecked>{{ c.settings.disabled }}</template>
                  </n-switch>
                  <span class="muted">{{ c.settings.enabledHelp }}</span>
                </n-space>
                <n-form-item :label="c.settings.defaultModel">
                  <n-select
                    v-model:value="agentConfig.default_model_id"
                    :options="modelOptions"
                    :placeholder="c.settings.defaultModelPlaceholder"
                    clearable
                  />
                </n-form-item>
                <n-form-item :label="c.settings.maxToolRounds">
                  <n-input-number v-model:value="agentConfig.max_tool_rounds" :min="1" :max="20" />
                </n-form-item>
                <n-space align="center">
                  <n-switch v-model:value="agentConfig.context_management_enabled">
                    <template #checked>{{ c.settings.contextOn }}</template>
                    <template #unchecked>{{ c.settings.contextOff }}</template>
                  </n-switch>
                  <span class="muted">{{ c.settings.contextHelp }}</span>
                </n-space>
                <n-grid cols="1 620:3" x-gap="12" y-gap="8">
                  <n-grid-item>
                    <n-form-item :label="c.settings.maxContextTokens">
                      <n-input-number
                        v-model:value="agentConfig.context_max_tokens"
                        :min="1000"
                        :max="1000000"
                        :step="1000"
                      />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item :label="c.settings.summaryTargetTokens">
                      <n-input-number
                        v-model:value="agentConfig.context_compression_target_tokens"
                        :min="200"
                        :max="50000"
                        :step="100"
                      />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item :label="c.settings.keepRecentMessages">
                      <n-input-number
                        v-model:value="agentConfig.context_keep_recent_messages"
                        :min="2"
                        :max="100"
                      />
                    </n-form-item>
                  </n-grid-item>
                </n-grid>
                <n-space align="center">
                  <n-switch v-model:value="agentConfig.telegram_command_enabled">
                    <template #checked>{{ c.settings.telegramCommandOn }}</template>
                    <template #unchecked>{{ c.settings.telegramCommandOff }}</template>
                  </n-switch>
                  <span class="muted">{{ c.settings.telegramCommandHelp }}</span>
                </n-space>
                <div>
                  <n-form-item :label="c.settings.telegramPrefix">
                    <n-input
                      v-model:value="agentConfig.telegram_prefix_trigger"
                      :placeholder="c.settings.telegramPrefixPlaceholder"
                      maxlength="16"
                      clearable
                    />
                  </n-form-item>
                  <p class="muted setting-help">{{ c.settings.telegramPrefixHelp }}</p>
                </div>
                <n-space align="center">
                  <n-switch v-model:value="agentConfig.telegram_private_chat_enabled">
                    <template #checked>{{ c.settings.privateChatOn }}</template>
                    <template #unchecked>{{ c.settings.privateChatOff }}</template>
                  </n-switch>
                  <span class="muted">{{ c.settings.privateChatHelp }}</span>
                </n-space>
                <n-button type="primary" :loading="savingSettings" @click="saveAgentSettings">
                  {{ c.save }}
                </n-button>
              </n-space>
            </n-card>

            <n-card :title="c.docs.title">
              <n-space vertical size="small">
                <button
                  v-for="doc in docList"
                  :key="doc.key"
                  type="button"
                  class="doc-row"
                  :class="{ selected: selectedDocKey === doc.key }"
                  @click="selectDoc(doc.key)"
                >
                  <span>
                    <strong>{{ doc.label || doc.key }}</strong>
                    <small class="mono">{{ doc.filename }}</small>
                  </span>
                  <n-tag size="small" :type="isDefaultDoc(doc.key) ? 'default' : 'success'">
                    {{ isDefaultDoc(doc.key) ? c.docs.builtin : c.docs.custom }}
                  </n-tag>
                </button>
              </n-space>

              <n-collapse class="create-doc">
                <n-collapse-item :title="c.create.title" name="create">
                  <n-form-item :label="c.create.key">
                    <n-input v-model:value="createDraft.key" :placeholder="c.create.keyPlaceholder" />
                  </n-form-item>
                  <n-form-item :label="c.create.label">
                    <n-input v-model:value="createDraft.label" :placeholder="c.create.labelPlaceholder" />
                  </n-form-item>
                  <n-form-item :label="c.create.description">
                    <n-input v-model:value="createDraft.description" :placeholder="c.create.descriptionPlaceholder" />
                  </n-form-item>
                  <n-button type="primary" secondary @click="createDoc">{{ c.create.submit }}</n-button>
                </n-collapse-item>
              </n-collapse>
            </n-card>
          </n-space>
        </n-grid-item>

        <n-grid-item span="1 1080:2">
          <n-space vertical size="medium">
            <n-card :title="c.chat.title">
              <n-alert type="warning" :bordered="false" class="chat-note">
                {{ c.chat.note }}
              </n-alert>
              <div class="chat-panel">
                <div v-if="chatMessages.length === 0" class="muted">{{ c.chat.empty }}</div>
                <div
                  v-for="(message, index) in chatMessages"
                  :key="`${message.role}:${index}`"
                  class="chat-message"
                  :class="message.role"
                >
                  <div class="chat-role">{{ message.role === "user" ? c.chat.user : c.chat.assistant }}</div>
                  <div class="chat-content">{{ message.content }}</div>
                </div>
              </div>
              <n-input
                v-model:value="chatInput"
                type="textarea"
                :placeholder="c.chat.placeholder"
                :autosize="{ minRows: 3, maxRows: 8 }"
                @keydown.ctrl.enter.prevent="sendAgentMessage"
                @keydown.meta.enter.prevent="sendAgentMessage"
              />
              <n-space class="chat-actions" align="center">
                <n-button type="primary" :loading="chatting" @click="sendAgentMessage">
                  {{ c.chat.send }}
                </n-button>
                <n-button secondary @click="clearChat">{{ c.chat.clear }}</n-button>
                <span class="muted">{{ c.chat.shortcut }}</span>
              </n-space>
              <p v-if="lastToolSummary" class="muted">{{ lastToolSummary }}</p>
            </n-card>

            <n-card :title="selectedDocTitle">
              <template #header-extra>
                <n-space>
                  <n-tag v-if="selectedDoc" size="small">{{ selectedDoc.key }}</n-tag>
                  <n-popconfirm
                    v-if="selectedDoc && !isDefaultDoc(selectedDoc.key)"
                    :positive-text="c.confirm"
                    :negative-text="c.cancel"
                    @positive-click="deleteSelectedDoc"
                  >
                    <template #trigger>
                      <n-button size="small" type="error" secondary>{{ c.delete }}</n-button>
                    </template>
                    {{ c.docs.deleteConfirm }}
                  </n-popconfirm>
                  <n-button size="small" type="primary" :loading="savingDoc" @click="saveDoc">
                    {{ c.docs.saveDoc }}
                  </n-button>
                </n-space>
              </template>

              <n-empty v-if="!selectedDoc" :description="c.docs.empty" />
              <n-space v-else vertical size="medium">
                <n-grid cols="1 760:2" x-gap="12" y-gap="8">
                  <n-grid-item>
                    <n-form-item :label="c.docs.label">
                      <n-input v-model:value="docDraft.label" />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item :label="c.docs.filename">
                      <n-input v-model:value="docDraft.filename" />
                    </n-form-item>
                  </n-grid-item>
                </n-grid>
                <n-form-item :label="c.docs.description">
                  <n-input v-model:value="docDraft.description" />
                </n-form-item>
                <n-input
                  v-model:value="docDraft.content_md"
                  type="textarea"
                  class="doc-editor"
                  :autosize="{ minRows: 20, maxRows: 36 }"
                />
                <div class="muted">
                  {{ c.docs.updatedAt }} {{ selectedDoc.updated_at ? formatTime(selectedDoc.updated_at) : "-" }}
                </div>
              </n-space>
            </n-card>

            <n-card :title="c.api.title">
              <p class="muted">{{ c.api.description }}</p>
              <div class="endpoint-list">
                <code>GET /api/agent/config</code>
                <code>PUT /api/agent/config</code>
                <code>GET /api/agent/doc/:key</code>
                <code>PUT /api/agent/doc/:key</code>
                <code>POST /api/agent/doc/:key/append</code>
              </div>
            </n-card>
          </n-space>
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
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
} from "naive-ui";
import { apiJson, getErrorMessage } from "../services/api";
import { showInfoModal } from "../services/uiBridge";
import { useI18n } from "../i18n";

interface AgentDocument {
  key: string;
  filename: string;
  label: string;
  description: string;
  content_md: string;
  created_at?: number;
  updated_at?: number;
}

interface AgentConfigResponse {
  enabled: boolean;
  default_model_id: string;
  max_tool_rounds: number;
  context_management_enabled: boolean;
  context_max_tokens: number;
  context_compression_target_tokens: number;
  context_keep_recent_messages: number;
  telegram_command_enabled: boolean;
  telegram_prefix_trigger: string;
  telegram_private_chat_enabled: boolean;
  docs: Record<string, AgentDocument>;
  created_at?: number;
  updated_at?: number;
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatResponse {
  status: string;
  message: string;
  history?: ChatMessage[];
  context?: Record<string, unknown>;
  tool_results?: Array<Record<string, unknown>>;
  config?: AgentConfigResponse;
}

const zh = {
  title: "Agent 配置",
  subtitle: "配置框架级 agent 的人格、长期记忆、任务文档和默认模型。",
  runtimeNote: "Agent 通过模型原生工具调用读取 Markdown 文档、Skills 文件树和节点工具；可从 WebUI、Telegram /agent 或前缀触发入口对话。",
  save: "保存设置",
  saved: "已保存",
  confirm: "确认",
  cancel: "取消",
  delete: "删除",
  chat: {
    title: "Agent 对话",
    note: "Agent 会按需读取 Markdown 文档和已启用 skills，并通过原生工具调用更新文档或执行节点。真实节点执行由 Skills 页开关控制。",
    empty: "暂无对话。",
    user: "你",
    assistant: "Agent",
    placeholder: "例如：帮我整理当前任务，必要时更新 tasks.md",
    send: "发送",
    clear: "清空对话",
    shortcut: "Ctrl/⌘ + Enter 发送",
    toolsUsed: "工具调用：{count} 次",
  },
  settings: {
    title: "运行设置",
    enabled: "启用",
    disabled: "停用",
    enabledHelp: "启用后 Telegram /agent 入口和私聊直连才会生效。",
    defaultModel: "默认模型",
    defaultModelPlaceholder: "选择已启用模型，可留空",
    noModel: "不绑定默认模型",
    maxToolRounds: "最大工具轮数",
    contextOn: "上下文管理开",
    contextOff: "上下文管理关",
    contextHelp: "达到上下文预算时自动把旧对话压缩为当前会话摘要；摘要按 Telegram 会话或 WebUI 会话独立保存。",
    maxContextTokens: "最大上下文 tokens",
    summaryTargetTokens: "摘要目标 tokens",
    keepRecentMessages: "保留最近消息数",
    telegramCommandOn: "/agent 开",
    telegramCommandOff: "/agent 关",
    telegramCommandHelp: "允许在 Telegram 中使用 /agent 直接对话。",
    telegramPrefix: "Telegram 前缀触发词",
    telegramPrefixPlaceholder: "例如 *，留空关闭",
    telegramPrefixHelp: "群聊或普通消息以此前缀开头时，后面的内容会直接发送给 Agent。默认是 *。",
    privateChatOn: "私聊直连开",
    privateChatOff: "私聊直连关",
    privateChatHelp: "开启后，私聊中没有命中工作流触发器的普通文本会转给 Agent。",
  },
  docs: {
    title: "Markdown 文档",
    builtin: "内置",
    custom: "自定义",
    empty: "请选择一个文档",
    label: "显示名称",
    filename: "文件名",
    description: "说明",
    saveDoc: "保存文档",
    updatedAt: "更新时间：",
    deleteConfirm: "删除这个自定义文档吗？内置文档不能删除。",
  },
  create: {
    title: "新建自定义文档",
    key: "Key",
    keyPlaceholder: "例如 project-notes",
    label: "名称",
    labelPlaceholder: "例如 项目笔记",
    description: "说明",
    descriptionPlaceholder: "这个文档什么时候应该被 agent 读取",
    submit: "创建",
  },
  api: {
    title: "Agent 文档 API",
    description: "后续 agent runner 可以通过这些接口读取和更新人格、记忆、任务等文档。",
  },
  errors: {
    loadFailed: "加载失败：{error}",
    saveFailed: "保存失败：{error}",
    keyRequired: "请填写文档 key",
    keyExists: "文档 key 已存在",
  },
};

const en = {
  title: "Agent Config",
  subtitle: "Configure framework-level agent persona, long-term memory, task docs, and default model.",
  runtimeNote: "The agent uses native model tool calls to read Markdown docs, the Skills file tree, and node tools. Chat is available in WebUI, Telegram /agent, or a Telegram prefix trigger.",
  save: "Save Settings",
  saved: "Saved",
  confirm: "Confirm",
  cancel: "Cancel",
  delete: "Delete",
  chat: {
    title: "Agent Chat",
    note: "The agent reads Markdown docs and enabled skills on demand, then updates docs or executes nodes through native tool calls. Real node execution is controlled in Skills.",
    empty: "No messages yet.",
    user: "You",
    assistant: "Agent",
    placeholder: "Example: summarize current tasks and update tasks.md if needed",
    send: "Send",
    clear: "Clear Chat",
    shortcut: "Ctrl/⌘ + Enter to send",
    toolsUsed: "Tool calls: {count}",
  },
  settings: {
    title: "Runtime Settings",
    enabled: "Enabled",
    disabled: "Disabled",
    enabledHelp: "Telegram /agent and private-chat routing only work when the agent is enabled.",
    defaultModel: "Default Model",
    defaultModelPlaceholder: "Select an enabled model, optional",
    noModel: "No default model",
    maxToolRounds: "Max Tool Rounds",
    contextOn: "Context On",
    contextOff: "Context Off",
    contextHelp: "When the context budget is reached, older turns are compressed into a per-session summary for each Telegram or WebUI session.",
    maxContextTokens: "Max Context Tokens",
    summaryTargetTokens: "Summary Target Tokens",
    keepRecentMessages: "Keep Recent Messages",
    telegramCommandOn: "/agent On",
    telegramCommandOff: "/agent Off",
    telegramCommandHelp: "Allow Telegram users to chat with the agent via /agent.",
    telegramPrefix: "Telegram Prefix Trigger",
    telegramPrefixPlaceholder: "e.g. *, empty disables it",
    telegramPrefixHelp: "When a group or normal message starts with this prefix, the remaining text is sent to the agent. Default is *.",
    privateChatOn: "Private Direct On",
    privateChatOff: "Private Direct Off",
    privateChatHelp: "When on, unmatched private-chat text is routed to the agent.",
  },
  docs: {
    title: "Markdown Docs",
    builtin: "Built-in",
    custom: "Custom",
    empty: "Select a document",
    label: "Label",
    filename: "Filename",
    description: "Description",
    saveDoc: "Save Doc",
    updatedAt: "Updated: ",
    deleteConfirm: "Delete this custom document? Built-in docs cannot be deleted.",
  },
  create: {
    title: "Create Custom Doc",
    key: "Key",
    keyPlaceholder: "e.g. project-notes",
    label: "Label",
    labelPlaceholder: "e.g. Project Notes",
    description: "Description",
    descriptionPlaceholder: "When the agent should read this doc",
    submit: "Create",
  },
  api: {
    title: "Agent Doc API",
    description: "The future agent runner can use these endpoints to read and update persona, memory, tasks, and related docs.",
  },
  errors: {
    loadFailed: "Load failed: {error}",
    saveFailed: "Save failed: {error}",
    keyRequired: "Document key is required",
    keyExists: "Document key already exists",
  },
};

const DEFAULT_DOC_ORDER = ["persona", "memory", "tasks", "instructions"];

const { locale } = useI18n();
const c = computed(() => (locale.value === "zh-CN" ? zh : en));
const loading = ref(false);
const savingSettings = ref(false);
const savingDoc = ref(false);
const chatting = ref(false);
const selectedDocKey = ref("persona");
const chatInput = ref("");
const chatMessages = ref<ChatMessage[]>([]);
const agentSessionId = ref("");
const lastToolResults = ref<Array<Record<string, unknown>>>([]);
const llmConfig = ref<LlmConfigResponse>({ providers: {}, models: {} });
const agentConfig = ref<AgentConfigResponse>({
  enabled: false,
  default_model_id: "",
  max_tool_rounds: 5,
  context_management_enabled: true,
  context_max_tokens: 24000,
  context_compression_target_tokens: 1200,
  context_keep_recent_messages: 8,
  telegram_command_enabled: true,
  telegram_prefix_trigger: "*",
  telegram_private_chat_enabled: false,
  docs: {},
});

const docDraft = reactive({
  label: "",
  filename: "",
  description: "",
  content_md: "",
});

const createDraft = reactive({
  key: "",
  label: "",
  description: "",
});

const normalizeDocKey = (input: string) =>
  String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const isDefaultDoc = (key: string) => DEFAULT_DOC_ORDER.includes(key);

const createAgentSessionId = () => {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `webui:${randomId}`;
};

const ensureAgentSessionId = () => {
  if (agentSessionId.value) return agentSessionId.value;
  const key = "agent_chat_session_id";
  const stored = localStorage.getItem(key);
  if (stored) {
    agentSessionId.value = stored;
    return stored;
  }
  const next = createAgentSessionId();
  localStorage.setItem(key, next);
  agentSessionId.value = next;
  return next;
};

const docList = computed(() =>
  Object.values(agentConfig.value.docs || {}).sort((a, b) => {
    const aIndex = DEFAULT_DOC_ORDER.indexOf(a.key);
    const bIndex = DEFAULT_DOC_ORDER.indexOf(b.key);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return a.key.localeCompare(b.key);
  })
);

const selectedDoc = computed(() => agentConfig.value.docs?.[selectedDocKey.value] || null);
const selectedDocTitle = computed(() => selectedDoc.value?.label || selectedDoc.value?.key || c.value.docs.empty);
const lastToolSummary = computed(() =>
  lastToolResults.value.length ? c.value.chat.toolsUsed.replace("{count}", String(lastToolResults.value.length)) : ""
);

const modelOptions = computed(() => [
  { value: "", label: c.value.settings.noModel },
  ...Object.values(llmConfig.value.models || {}).map((model) => {
    const provider = llmConfig.value.providers?.[model.provider_id];
    return {
      value: model.id,
      label: `${provider?.name || model.provider_id} / ${model.name || model.model}`,
    };
  }),
]);

const syncDraftFromSelected = () => {
  const doc = selectedDoc.value;
  docDraft.label = doc?.label || "";
  docDraft.filename = doc?.filename || "";
  docDraft.description = doc?.description || "";
  docDraft.content_md = doc?.content_md || "";
};

const applyConfig = (config: AgentConfigResponse) => {
  agentConfig.value = {
    enabled: config.enabled === true,
    default_model_id: config.default_model_id || "",
    max_tool_rounds: Math.max(1, Math.min(20, Math.trunc(Number(config.max_tool_rounds) || 5))),
    context_management_enabled: config.context_management_enabled !== false,
    context_max_tokens: Math.max(1000, Math.min(1000000, Math.trunc(Number(config.context_max_tokens) || 24000))),
    context_compression_target_tokens: Math.max(
      200,
      Math.min(50000, Math.trunc(Number(config.context_compression_target_tokens) || 1200))
    ),
    context_keep_recent_messages: Math.max(
      2,
      Math.min(100, Math.trunc(Number(config.context_keep_recent_messages) || 8))
    ),
    telegram_command_enabled: config.telegram_command_enabled !== false,
    telegram_prefix_trigger: typeof config.telegram_prefix_trigger === "string" ? config.telegram_prefix_trigger : "*",
    telegram_private_chat_enabled: config.telegram_private_chat_enabled === true,
    docs: config.docs || {},
    created_at: config.created_at,
    updated_at: config.updated_at,
  };
  if (!agentConfig.value.docs[selectedDocKey.value]) {
    selectedDocKey.value = agentConfig.value.docs.persona ? "persona" : docList.value[0]?.key || "";
  }
  syncDraftFromSelected();
};

const loadAll = async () => {
  loading.value = true;
  try {
    const [agent, llm] = await Promise.all([
      apiJson<AgentConfigResponse>("/api/agent/config"),
      apiJson<LlmConfigResponse>("/api/llm/config"),
    ]);
    llmConfig.value = { providers: llm.providers || {}, models: llm.models || {} };
    applyConfig(agent);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    loading.value = false;
  }
};

const selectDoc = (key: string) => {
  selectedDocKey.value = key;
  syncDraftFromSelected();
};

const saveAgentSettings = async () => {
  savingSettings.value = true;
  try {
    const data = await apiJson<{ status: string; config: AgentConfigResponse }>("/api/agent/config", {
      method: "PUT",
      body: JSON.stringify({
        enabled: agentConfig.value.enabled,
        default_model_id: agentConfig.value.default_model_id || "",
        max_tool_rounds: agentConfig.value.max_tool_rounds,
        context_management_enabled: agentConfig.value.context_management_enabled,
        context_max_tokens: agentConfig.value.context_max_tokens,
        context_compression_target_tokens: agentConfig.value.context_compression_target_tokens,
        context_keep_recent_messages: agentConfig.value.context_keep_recent_messages,
        telegram_command_enabled: agentConfig.value.telegram_command_enabled,
        telegram_prefix_trigger: agentConfig.value.telegram_prefix_trigger || "",
        telegram_private_chat_enabled: agentConfig.value.telegram_private_chat_enabled,
      }),
    });
    applyConfig(data.config);
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    savingSettings.value = false;
  }
};

const saveDoc = async () => {
  const doc = selectedDoc.value;
  if (!doc) return;
  savingDoc.value = true;
  try {
    const data = await apiJson<{ status: string; doc: AgentDocument; config: AgentConfigResponse }>(
      `/api/agent/doc/${encodeURIComponent(doc.key)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          label: docDraft.label,
          filename: docDraft.filename,
          description: docDraft.description,
          content_md: docDraft.content_md,
        }),
      }
    );
    applyConfig(data.config);
    selectDoc(data.doc.key);
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    savingDoc.value = false;
  }
};

const createDoc = async () => {
  const key = normalizeDocKey(createDraft.key);
  if (!key) {
    showInfoModal(c.value.errors.keyRequired, true);
    return;
  }
  if (agentConfig.value.docs[key]) {
    showInfoModal(c.value.errors.keyExists, true);
    return;
  }
  try {
    const label = createDraft.label.trim() || key;
    const data = await apiJson<{ status: string; doc: AgentDocument; config: AgentConfigResponse }>(
      `/api/agent/doc/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          label,
          filename: `${key}.md`,
          description: createDraft.description.trim(),
          content_md: [`# ${label}`, "", createDraft.description.trim() || "Custom agent document."].join("\n"),
        }),
      }
    );
    createDraft.key = "";
    createDraft.label = "";
    createDraft.description = "";
    applyConfig(data.config);
    selectDoc(data.doc.key);
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const deleteSelectedDoc = async () => {
  const doc = selectedDoc.value;
  if (!doc || isDefaultDoc(doc.key)) return;
  try {
    const data = await apiJson<{ status: string; config: AgentConfigResponse }>(
      `/api/agent/doc/${encodeURIComponent(doc.key)}`,
      { method: "DELETE" }
    );
    selectedDocKey.value = "persona";
    applyConfig(data.config);
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const sendAgentMessage = async () => {
  const content = chatInput.value.trim();
  if (!content || chatting.value) return;
  const history = chatMessages.value.slice(-500);
  chatMessages.value = [...chatMessages.value, { role: "user", content }];
  chatInput.value = "";
  chatting.value = true;
  try {
    const data = await apiJson<AgentChatResponse>("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({
        message: content,
        history,
        session_id: ensureAgentSessionId(),
        model_id: agentConfig.value.default_model_id || "",
      }),
    });
    chatMessages.value = Array.isArray(data.history)
      ? data.history
      : [...chatMessages.value, { role: "assistant", content: data.message || "" }];
    lastToolResults.value = data.tool_results || [];
    if (data.config) {
      applyConfig(data.config);
    }
  } catch (error) {
    showInfoModal(c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)), true);
    chatMessages.value = [
      ...chatMessages.value,
      { role: "assistant", content: c.value.errors.saveFailed.replace("{error}", getErrorMessage(error)) },
    ];
  } finally {
    chatting.value = false;
  }
};

const clearChat = () => {
  const next = createAgentSessionId();
  localStorage.setItem("agent_chat_session_id", next);
  agentSessionId.value = next;
  chatMessages.value = [];
  lastToolResults.value = [];
};

const formatTime = (value: number) => new Date(value).toLocaleString(locale.value);

onMounted(() => {
  ensureAgentSessionId();
  void loadAll();
});
</script>

<style scoped>
.agent-page {
  padding: 18px;
}

.doc-row {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  text-align: left;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.doc-row:hover,
.doc-row.selected {
  border-color: rgba(0, 255, 127, 0.42);
  background: rgba(0, 255, 127, 0.05);
}

.doc-row span {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.chat-note,
.chat-actions {
  margin-top: 12px;
}

.setting-help {
  margin: -14px 0 0;
  font-size: 12px;
}

.chat-panel {
  display: grid;
  gap: 10px;
  max-height: 360px;
  overflow: auto;
  margin: 12px 0;
  padding: 12px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.16);
}

.chat-message {
  max-width: 86%;
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  white-space: pre-wrap;
}

.chat-message.user {
  justify-self: end;
  background: rgba(0, 255, 127, 0.1);
}

.chat-message.assistant {
  justify-self: start;
}

.chat-role {
  margin-bottom: 5px;
  color: rgba(225, 225, 225, 0.58);
  font-size: 12px;
}

.chat-content {
  overflow-wrap: anywhere;
}

.create-doc {
  margin-top: 14px;
}

.doc-editor :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  line-height: 1.55;
}

.endpoint-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.endpoint-list code {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
  color: rgba(225, 225, 225, 0.9);
  overflow-wrap: anywhere;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow-wrap: anywhere;
}

.muted {
  color: rgba(225, 225, 225, 0.62);
}
</style>
