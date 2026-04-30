<template>
  <main class="mcp-page">
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
          <n-card :title="editingId ? c.form.editTitle : c.form.createTitle">
            <n-form-item :label="c.form.name">
              <n-input v-model:value="form.name" :placeholder="c.form.namePlaceholder" />
            </n-form-item>
            <n-form-item :label="c.form.id">
              <n-input v-model:value="form.id" :disabled="Boolean(editingId)" :placeholder="c.form.idPlaceholder" />
            </n-form-item>
            <n-form-item :label="c.form.url">
              <n-input v-model:value="form.endpoint_url" placeholder="https://mcp.example/rpc" />
            </n-form-item>
            <n-form-item :label="c.form.headers">
              <n-input
                v-model:value="form.headersText"
                type="textarea"
                :placeholder="c.form.headersPlaceholder"
                :autosize="{ minRows: 5, maxRows: 10 }"
              />
            </n-form-item>
            <div class="switch-row">
              <span>{{ c.form.enabled }}</span>
              <n-switch v-model:value="form.enabled" />
            </div>
            <n-space>
              <n-button type="primary" :loading="saving" @click="saveServer">{{ c.form.save }}</n-button>
              <n-button secondary @click="resetForm">{{ c.form.reset }}</n-button>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item span="1 1080:2">
          <n-card :title="c.list.title">
            <template #header-extra>
              <n-button size="small" secondary :loading="loading" @click="loadConfig">{{ c.reload }}</n-button>
            </template>

            <n-empty v-if="servers.length === 0 && !loading" :description="c.list.empty" />
            <div v-else class="server-list">
              <article v-for="server in servers" :key="server.id" class="server-card">
                <div class="server-head">
                  <div>
                    <h3>{{ server.name || server.id }}</h3>
                    <div class="tags">
                      <n-tag size="small">{{ server.id }}</n-tag>
                      <n-tag size="small" :type="server.enabled ? 'success' : 'default'">
                        {{ server.enabled ? c.enabled : c.disabled }}
                      </n-tag>
                      <n-tag size="small" type="info">{{ server.tool_count || 0 }} {{ c.tools }}</n-tag>
                    </div>
                  </div>
                  <n-space>
                    <n-button size="small" secondary @click="editServer(server)">{{ c.edit }}</n-button>
                    <n-button size="small" secondary :loading="fetchingId === server.id" @click="fetchTools(server.id)">
                      {{ c.fetchTools }}
                    </n-button>
                    <n-popconfirm :positive-text="c.confirm" :negative-text="c.cancel" @positive-click="deleteServer(server.id)">
                      <template #trigger>
                        <n-button size="small" type="error" secondary>{{ c.delete }}</n-button>
                      </template>
                      {{ c.deleteConfirm }}
                    </n-popconfirm>
                  </n-space>
                </div>
                <p class="mono muted">{{ server.endpoint_url }}</p>
                <p class="muted">
                  {{ c.headers }}:
                  <span v-if="server.header_keys.length">{{ server.header_keys.join(", ") }}</span>
                  <span v-else>{{ c.none }}</span>
                </p>
                <n-collapse v-if="server.tools.length">
                  <n-collapse-item :title="`${server.tools.length} ${c.tools}`" :name="server.id">
                    <div class="tool-list">
                      <div v-for="tool in server.tools" :key="tool.name" class="tool-row">
                        <strong>{{ tool.name }}</strong>
                        <p class="muted">{{ tool.description || c.noDescription }}</p>
                        <pre>{{ JSON.stringify(tool.input_schema || {}, null, 2) }}</pre>
                      </div>
                    </div>
                  </n-collapse-item>
                </n-collapse>
              </article>
            </div>
          </n-card>
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
  NSwitch,
  NTag,
} from "naive-ui";
import { useI18n } from "../i18n";
import { apiJson, getErrorMessage } from "../services/api";
import { showInfoModal } from "../services/uiBridge";

interface McpTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  enabled?: boolean;
}

interface McpServer {
  id: string;
  name: string;
  endpoint_url: string;
  enabled: boolean;
  header_keys: string[];
  header_count?: number;
  tools: McpTool[];
  tool_count?: number;
}

interface McpConfigResponse {
  servers: McpServer[];
}

const zh = {
  title: "MCP",
  subtitle: "配置 HTTP / Streamable HTTP MCP server，让 Agent 可以把外部 MCP tools 当作原生工具调用。",
  note: "只支持 HTTP MCP，不支持 stdio。headers 会明文存储在 Durable Object，但不会返回给 WebUI。",
  reload: "刷新",
  enabled: "启用",
  disabled: "关闭",
  tools: "工具",
  headers: "请求头",
  none: "无",
  edit: "编辑",
  delete: "删除",
  confirm: "确认",
  cancel: "取消",
  fetchTools: "获取工具",
  deleteConfirm: "删除这个 MCP server？",
  noDescription: "暂无描述",
  saved: "已保存",
  deleted: "已删除",
  fetched: "工具已更新",
  list: {
    title: "已配置的 MCP Servers",
    empty: "暂无 MCP server",
  },
  form: {
    createTitle: "新增 MCP Server",
    editTitle: "编辑 MCP Server",
    name: "名称",
    namePlaceholder: "例如 Filesystem MCP",
    id: "ID",
    idPlaceholder: "留空会从名称生成",
    url: "Endpoint URL",
    headers: "Headers JSON",
    headersPlaceholder: "{\n  \"Authorization\": \"Bearer ...\"\n}\n留空表示保持已有 headers；填 {} 表示清空。",
    enabled: "启用",
    save: "保存",
    reset: "重置",
  },
  errors: {
    load: "加载失败：{error}",
    save: "保存失败：{error}",
    fetch: "获取工具失败：{error}",
    delete: "删除失败：{error}",
    invalidHeaders: "Headers JSON 无效：{error}",
  },
};

const en = {
  title: "MCP",
  subtitle: "Configure HTTP / Streamable HTTP MCP servers so the agent can call external MCP tools as native tools.",
  note: "Only HTTP MCP is supported, not stdio. Headers are stored in Durable Object but never returned to WebUI.",
  reload: "Reload",
  enabled: "Enabled",
  disabled: "Off",
  tools: "tools",
  headers: "Headers",
  none: "None",
  edit: "Edit",
  delete: "Delete",
  confirm: "Confirm",
  cancel: "Cancel",
  fetchTools: "Fetch Tools",
  deleteConfirm: "Delete this MCP server?",
  noDescription: "No description",
  saved: "Saved",
  deleted: "Deleted",
  fetched: "Tools updated",
  list: {
    title: "Configured MCP Servers",
    empty: "No MCP servers yet",
  },
  form: {
    createTitle: "Add MCP Server",
    editTitle: "Edit MCP Server",
    name: "Name",
    namePlaceholder: "e.g. Filesystem MCP",
    id: "ID",
    idPlaceholder: "Blank generates from name",
    url: "Endpoint URL",
    headers: "Headers JSON",
    headersPlaceholder: "{\n  \"Authorization\": \"Bearer ...\"\n}\nBlank keeps existing headers; {} clears them.",
    enabled: "Enabled",
    save: "Save",
    reset: "Reset",
  },
  errors: {
    load: "Load failed: {error}",
    save: "Save failed: {error}",
    fetch: "Fetch tools failed: {error}",
    delete: "Delete failed: {error}",
    invalidHeaders: "Invalid headers JSON: {error}",
  },
};

const { locale } = useI18n();
const c = computed(() => (locale.value === "zh-CN" ? zh : en));
const loading = ref(false);
const saving = ref(false);
const fetchingId = ref("");
const editingId = ref("");
const servers = ref<McpServer[]>([]);
const form = ref({
  id: "",
  name: "",
  endpoint_url: "",
  enabled: true,
  headersText: "",
});

const resetForm = () => {
  editingId.value = "";
  form.value = {
    id: "",
    name: "",
    endpoint_url: "",
    enabled: true,
    headersText: "",
  };
};

const editServer = (server: McpServer) => {
  editingId.value = server.id;
  form.value = {
    id: server.id,
    name: server.name,
    endpoint_url: server.endpoint_url,
    enabled: server.enabled,
    headersText: "",
  };
};

const loadConfig = async () => {
  loading.value = true;
  try {
    const data = await apiJson<McpConfigResponse>("/api/mcp/config");
    servers.value = data.servers || [];
  } catch (error) {
    showInfoModal(c.value.errors.load.replace("{error}", getErrorMessage(error)), true);
  } finally {
    loading.value = false;
  }
};

const parseHeaders = () => {
  const raw = form.value.headersText.trim();
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as Record<string, string>;
};

const saveServer = async () => {
  let headers: Record<string, string> | undefined;
  try {
    headers = parseHeaders();
  } catch (error) {
    showInfoModal(c.value.errors.invalidHeaders.replace("{error}", getErrorMessage(error)), true);
    return;
  }
  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      id: form.value.id || undefined,
      name: form.value.name,
      endpoint_url: form.value.endpoint_url,
      enabled: form.value.enabled,
    };
    if (headers !== undefined) {
      payload.headers = headers;
    }
    const data = await apiJson<{ config: McpConfigResponse }>("/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    servers.value = data.config?.servers || [];
    resetForm();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.save.replace("{error}", getErrorMessage(error)), true);
  } finally {
    saving.value = false;
  }
};

const fetchTools = async (serverId: string) => {
  fetchingId.value = serverId;
  try {
    const data = await apiJson<{ config: McpConfigResponse }>(`/api/mcp/servers/${encodeURIComponent(serverId)}/fetch-tools`, {
      method: "POST",
    });
    servers.value = data.config?.servers || [];
    showInfoModal(c.value.fetched);
  } catch (error) {
    showInfoModal(c.value.errors.fetch.replace("{error}", getErrorMessage(error)), true);
  } finally {
    fetchingId.value = "";
  }
};

const deleteServer = async (serverId: string) => {
  try {
    const data = await apiJson<{ config: McpConfigResponse }>(`/api/mcp/servers/${encodeURIComponent(serverId)}`, {
      method: "DELETE",
    });
    servers.value = data.config?.servers || [];
    if (editingId.value === serverId) {
      resetForm();
    }
    showInfoModal(c.value.deleted);
  } catch (error) {
    showInfoModal(c.value.errors.delete.replace("{error}", getErrorMessage(error)), true);
  }
};

onMounted(loadConfig);
</script>

<style scoped>
.mcp-page {
  max-width: 1260px;
  margin: 0 auto;
}

.page-header h2 {
  margin: 0 0 6px;
}

.muted {
  color: rgba(255, 255, 255, 0.62);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.switch-row,
.server-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.server-list {
  display: grid;
  gap: 14px;
}

.server-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
}

.server-card h3 {
  margin: 0 0 8px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-list {
  display: grid;
  gap: 12px;
}

.tool-row pre {
  overflow: auto;
  max-height: 220px;
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
}

@media (max-width: 760px) {
  .server-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
