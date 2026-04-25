<template>
  <main class="skills-page">
    <n-space vertical size="large">
      <div class="page-header">
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.subtitle }}</p>
      </div>

      <n-alert type="info" :bordered="false">
        {{ c.agentNote }}
      </n-alert>

      <n-grid cols="1 760:3" x-gap="14" y-gap="14">
        <n-grid-item>
          <div class="metric-card">
            <div class="metric-label">{{ c.metrics.categories }}</div>
            <strong>{{ categories.length }}</strong>
          </div>
        </n-grid-item>
        <n-grid-item>
          <div class="metric-card">
            <div class="metric-label">{{ c.metrics.generated }}</div>
            <strong>{{ generatedPackCount }}</strong>
          </div>
        </n-grid-item>
        <n-grid-item>
          <div class="metric-card">
            <div class="metric-label">{{ c.metrics.uploaded }}</div>
            <strong>{{ uploadedPackCount }}</strong>
          </div>
        </n-grid-item>
      </n-grid>

      <n-grid cols="1 1120:3" x-gap="16" y-gap="16">
        <n-grid-item>
          <n-card :title="c.upload.title">
            <n-alert type="warning" :bordered="false" class="upload-note">
              {{ c.upload.safeNote }}
            </n-alert>
            <n-form-item :label="c.upload.file">
              <input
                :key="fileInputKey"
                class="file-input"
                type="file"
                accept="text/markdown,.md,.markdown,application/json,.json"
                @change="handleFileChange"
              />
            </n-form-item>
            <n-form-item :label="c.upload.json">
              <n-input
                v-model:value="uploadText"
                type="textarea"
                :placeholder="c.upload.placeholder"
                :autosize="{ minRows: 10, maxRows: 20 }"
              />
            </n-form-item>
            <n-space>
              <n-button secondary @click="loadExample">{{ c.upload.example }}</n-button>
              <n-button secondary @click="clearUpload">{{ c.upload.clear }}</n-button>
              <n-button type="primary" :loading="saving" @click="uploadSkillPack">
                {{ c.upload.submit }}
              </n-button>
            </n-space>
          </n-card>
        </n-grid-item>

        <n-grid-item span="1 1120:2">
          <n-card :title="c.list.title">
            <template #header-extra>
              <n-space>
                <n-button size="small" secondary :loading="loading" @click="loadSkills">
                  {{ c.reload }}
                </n-button>
              </n-space>
            </template>

            <div class="filters">
              <n-input v-model:value="searchText" clearable :placeholder="c.list.search" />
              <n-select v-model:value="selectedCategory" :options="categoryOptions" />
            </div>

            <n-empty v-if="visiblePacks.length === 0 && !loading" :description="c.list.empty" />
            <div v-else class="skill-list">
              <article v-for="pack in visiblePacks" :key="pack.key" class="skill-card">
                <div class="skill-card-head">
                  <div class="skill-title-block">
                    <h3>{{ pack.label || pack.key }}</h3>
                    <div class="skill-tags">
                      <n-tag size="small">{{ pack.key }}</n-tag>
                      <n-tag size="small" type="info">{{ pack.category || "custom" }}</n-tag>
                      <n-tag size="small" :type="pack.custom ? 'success' : 'default'">
                        {{ pack.custom ? c.source.uploaded : c.source.generated }}
                      </n-tag>
                    </div>
                  </div>
                  <n-popconfirm
                    v-if="pack.custom"
                    :positive-text="c.confirm"
                    :negative-text="c.cancel"
                    @positive-click="deleteSkillPack(pack.key)"
                  >
                    <template #trigger>
                      <n-button size="small" type="error" secondary>{{ c.delete }}</n-button>
                    </template>
                    {{ c.deleteConfirm }}
                  </n-popconfirm>
                </div>

                <p class="muted skill-desc">{{ pack.description || c.list.noDescription }}</p>
                <div class="risk-row">
                  <n-tag
                    v-for="item in riskCounts(pack)"
                    :key="item.key"
                    size="small"
                    :type="riskTagType(item.key)"
                  >
                    {{ item.key }}: {{ item.count }}
                  </n-tag>
                </div>

                <n-collapse>
                  <n-collapse-item :title="c.list.document" :name="`${pack.key}:doc`">
                    <div v-if="fileList(pack).length" class="file-browser">
                      <div class="file-list" role="list">
                        <button
                          v-for="file in fileList(pack)"
                          :key="file.path"
                          type="button"
                          class="file-list-item"
                          :class="{ selected: selectedFile(pack)?.path === file.path }"
                          :style="{ paddingLeft: `${10 + fileIndent(pack, file.path) * 12}px` }"
                          @click="selectFile(pack, file.path)"
                        >
                          <span class="mono">{{ shortFilePath(pack, file.path) }}</span>
                        </button>
                      </div>
                      <pre class="skill-doc">{{ selectedFile(pack)?.content_md || c.list.noDocument }}</pre>
                    </div>
                    <pre v-else class="skill-doc">{{ pack.content_md || c.list.noDocument }}</pre>
                  </n-collapse-item>
                  <n-collapse-item :title="toolTitle(pack)" :name="pack.key">
                    <div class="tool-list">
                      <div v-for="tool in pack.tools || []" :key="tool.id" class="tool-row">
                        <div class="tool-main">
                          <strong>{{ tool.name || tool.id }}</strong>
                          <span class="mono muted">{{ tool.id }}</span>
                          <p class="muted">{{ tool.description || c.list.noDescription }}</p>
                        </div>
                        <div class="tool-side">
                          <n-tag size="small">{{ tool.category || pack.category || "utility" }}</n-tag>
                          <n-tag size="small" :type="riskTagType(tool.risk_level || 'safe')">
                            {{ tool.risk_level || "safe" }}
                          </n-tag>
                        </div>
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
  NSelect,
  NSpace,
  NTag,
} from "naive-ui";
import { apiJson, getErrorMessage } from "../services/api";
import { showInfoModal } from "../services/uiBridge";
import { useAppStore } from "../stores/app";
import { useI18n } from "../i18n";

interface SkillCategory {
  key: string;
  label?: string;
  count?: number;
  order?: number;
}

interface SkillTool {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  risk_level?: string;
  side_effects?: boolean;
  allow_network?: boolean;
}

interface SkillFile {
  path: string;
  title?: string;
  kind?: string;
  category?: string;
  tool_id?: string;
  content_md?: string;
  source?: string;
}

interface SkillPack {
  key: string;
  label?: string;
  category?: string;
  description?: string;
  tool_count?: number;
  tool_ids?: string[];
  content_md?: string;
  filename?: string;
  format?: string;
  custom?: boolean;
  source?: string;
  created_at?: number;
  updated_at?: number;
  tools?: SkillTool[];
  files?: SkillFile[];
}

interface SkillsResponse {
  categories: SkillCategory[];
  skill_packs: SkillPack[];
  custom_skill_packs?: unknown[];
}

const zh = {
  title: "Skills",
  subtitle: "查看当前节点自动生成的技能包，也可以上传技能包元数据，把已有节点打包成更小的工具集合。",
  agentNote:
    "Agent 不应该作为普通节点塞进工作流；它更适合作为框架级能力，按需读取这些 skills，再调用其中的节点工具。",
  reload: "刷新",
  confirm: "确认",
  cancel: "取消",
  delete: "删除",
  deleteConfirm: "只会删除上传的技能包元数据，不会删除节点本身。确定继续吗？",
  saved: "已保存",
  deleted: "已删除",
  metrics: {
    categories: "节点分类",
    generated: "自动技能包",
    uploaded: "上传技能包",
  },
  source: {
    generated: "自动生成",
    uploaded: "已上传",
  },
  upload: {
    title: "上传 Skill.md",
    safeNote: "当前只支持上传 Markdown 文档。文档通过 frontmatter 的 tool_ids 引用已有节点；不会上传或执行外部代码。",
    file: "Markdown 文件",
    json: "Markdown 内容",
    placeholder: "粘贴 Skill.md 内容",
    example: "填入 Markdown 示例",
    clear: "清空",
    submit: "上传",
    empty: "请先填写 Markdown 内容",
    invalidJson: "JSON 兼容格式无效：{error}",
  },
  list: {
    title: "技能包列表",
    search: "搜索 key / 名称 / 描述 / 工具 ID",
    allCategories: "全部分类",
    empty: "没有匹配的技能包",
    noDescription: "暂无描述",
    document: "文件树",
    noDocument: "暂无 Markdown 文档",
    tools: "工具",
  },
  errors: {
    loadFailed: "加载失败：{error}",
    uploadFailed: "上传失败：{error}",
    deleteFailed: "删除失败：{error}",
    fileReadFailed: "读取文件失败：{error}",
  },
};

const en = {
  title: "Skills",
  subtitle: "Inspect dynamic skill packs generated from nodes, or upload metadata that groups existing nodes into smaller tool sets.",
  agentNote:
    "Agent should not be a normal workflow node. It fits better as a framework-level capability that loads these skills on demand and calls node tools.",
  reload: "Reload",
  confirm: "Confirm",
  cancel: "Cancel",
  delete: "Delete",
  deleteConfirm: "This only deletes uploaded skill metadata, not the underlying nodes. Continue?",
  saved: "Saved",
  deleted: "Deleted",
  metrics: {
    categories: "Categories",
    generated: "Generated Packs",
    uploaded: "Uploaded Packs",
  },
  source: {
    generated: "Generated",
    uploaded: "Uploaded",
  },
  upload: {
    title: "Upload Skill.md",
    safeNote: "Only Markdown documents are accepted by default. The frontmatter references existing nodes via tool_ids and never uploads or executes external code.",
    file: "Markdown File",
    json: "Markdown",
    placeholder: "Paste Skill.md content",
    example: "Load Markdown Example",
    clear: "Clear",
    submit: "Upload",
    empty: "Please enter Markdown content first",
    invalidJson: "Invalid legacy JSON: {error}",
  },
  list: {
    title: "Skill Packs",
    search: "Search key / name / description / tool id",
    allCategories: "All Categories",
    empty: "No matching skill packs",
    noDescription: "No description",
    document: "File Tree",
    noDocument: "No Markdown document",
    tools: "tools",
  },
  errors: {
    loadFailed: "Load failed: {error}",
    uploadFailed: "Upload failed: {error}",
    deleteFailed: "Delete failed: {error}",
    fileReadFailed: "File read failed: {error}",
  },
};

const { locale } = useI18n();
const store = useAppStore();
const c = computed(() => (locale.value === "zh-CN" ? zh : en));
const loading = ref(false);
const saving = ref(false);
const searchText = ref("");
const selectedCategory = ref("");
const uploadText = ref("");
const uploadFilename = ref("");
const fileInputKey = ref(0);
const selectedFilePaths = ref<Record<string, string>>({});
const response = ref<SkillsResponse>({
  categories: [],
  skill_packs: [],
});

const categories = computed(() => response.value.categories || []);
const skillPacks = computed(() => response.value.skill_packs || []);
const generatedPackCount = computed(() => skillPacks.value.filter((pack) => !pack.custom).length);
const uploadedPackCount = computed(() => skillPacks.value.filter((pack) => pack.custom).length);
const categoryOptions = computed(() => {
  const map = new Map<string, string>();
  for (const category of categories.value) {
    if (category.key) {
      map.set(category.key, category.label || category.key);
    }
  }
  for (const pack of skillPacks.value) {
    const key = pack.category || "custom";
    map.set(key, map.get(key) || key);
  }
  return [
    { value: "", label: c.value.list.allCategories },
    ...Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, label]) => ({ value, label })),
  ];
});

const visiblePacks = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  return skillPacks.value.filter((pack) => {
    if (selectedCategory.value && (pack.category || "custom") !== selectedCategory.value) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      pack.key,
      pack.label || "",
      pack.description || "",
      pack.category || "",
      ...(pack.tools || []).flatMap((tool) => [tool.id, tool.name || "", tool.description || ""]),
      ...(pack.files || []).flatMap((file) => [file.path, file.title || "", file.category || "", file.tool_id || ""]),
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
});

const fileList = (pack: SkillPack) => {
  const files = Array.isArray(pack.files) ? pack.files : [];
  if (files.length > 0) {
    return files;
  }
  if (pack.content_md) {
    return [
      {
        path: `${pack.custom ? "custom" : "generated"}/${pack.key}/SKILL.md`,
        title: pack.label || pack.key,
        kind: "root",
        content_md: pack.content_md,
        source: pack.source,
      },
    ];
  }
  return [];
};

const selectedFile = (pack: SkillPack) => {
  const files = fileList(pack);
  if (!files.length) {
    return null;
  }
  const selectedPath = selectedFilePaths.value[pack.key];
  return files.find((file) => file.path === selectedPath) || files[0];
};

const selectFile = (pack: SkillPack, path: string) => {
  selectedFilePaths.value = { ...selectedFilePaths.value, [pack.key]: path };
};

const shortFilePath = (pack: SkillPack, path: string) => {
  const directPrefix = `${pack.key}/`;
  const generatedPrefix = `generated/${pack.key}/`;
  const customPrefix = `custom/${pack.key}/`;
  if (path.startsWith(directPrefix)) {
    return path.slice(directPrefix.length);
  }
  if (path.startsWith(generatedPrefix)) {
    return path.slice(generatedPrefix.length);
  }
  if (path.startsWith(customPrefix)) {
    return path.slice(customPrefix.length);
  }
  return path;
};

const fileIndent = (pack: SkillPack, path: string) => {
  const parts = path.split("/").filter(Boolean);
  const relativeParts = ["generated", "custom"].includes(parts[0])
    ? parts.slice(2)
    : parts[0] === pack.key
      ? parts.slice(1)
      : parts;
  return Math.max(0, relativeParts.length - 1);
};

const exampleMarkdown = () =>
  [
    "---",
    "key: message_ai_compose",
    `label: ${locale.value === "zh-CN" ? "消息 + AI 生成" : "Message + AI Compose"}`,
    "category: ai",
    "tool_ids:",
    "  - llm_generate",
    "  - send_message",
    "  - edit_message_text",
    "---",
    "",
    `# ${locale.value === "zh-CN" ? "消息 + AI 生成" : "Message + AI Compose"}`,
    "",
    locale.value === "zh-CN"
      ? "当 agent 需要先生成文本，再发送或编辑 Telegram 消息时加载这个 skill。"
      : "Load this skill when an agent needs to generate text and then send or edit Telegram messages.",
    "",
    "## When To Use",
    "",
    "- Use `llm_generate` to produce the message body.",
    "- Use `send_message` for a new Telegram message.",
    "- Use `edit_message_text` when updating an existing message.",
    "",
    "## Boundaries",
    "",
    "- Do not expose unrelated Telegram admin tools in this skill.",
    "- Confirm required chat/message ids before calling side-effect tools.",
  ].join("\n");

const syncStoreSkillPacks = (data: SkillsResponse) => {
  store.skillPacks = data.skill_packs || [];
};

const loadSkills = async () => {
  loading.value = true;
  try {
    const data = await apiJson<SkillsResponse>("/api/actions/skills/available");
    response.value = {
      categories: data.categories || [],
      skill_packs: data.skill_packs || [],
      custom_skill_packs: data.custom_skill_packs || [],
    };
    syncStoreSkillPacks(response.value);
  } catch (error) {
    showInfoModal(c.value.errors.loadFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    loading.value = false;
  }
};

const refreshActionDefinitions = async () => {
  try {
    await store.loadAll();
  } catch (error) {
    console.warn("[skills] refresh action definitions failed:", getErrorMessage(error));
  }
};

const loadExample = () => {
  uploadText.value = exampleMarkdown();
};

const clearUpload = () => {
  uploadText.value = "";
  uploadFilename.value = "";
  fileInputKey.value += 1;
};

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  try {
    uploadFilename.value = file.name;
    uploadText.value = await file.text();
  } catch (error) {
    showInfoModal(c.value.errors.fileReadFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const uploadSkillPack = async () => {
  let payload: unknown;
  const raw = uploadText.value.trim();
  if (!raw) {
    showInfoModal(c.value.upload.empty, true);
    return;
  }
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      showInfoModal(c.value.upload.invalidJson.replace("{error}", getErrorMessage(error)), true);
      return;
    }
  } else {
    payload = {
      content_md: uploadText.value,
      filename: uploadFilename.value || undefined,
    };
  }
  saving.value = true;
  try {
    const data = await apiJson<SkillsResponse>("/api/actions/skills/upload", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    response.value = {
      categories: response.value.categories,
      skill_packs: data.skill_packs || [],
      custom_skill_packs: data.custom_skill_packs || [],
    };
    syncStoreSkillPacks(response.value);
    await refreshActionDefinitions();
    clearUpload();
    showInfoModal(c.value.saved);
  } catch (error) {
    showInfoModal(c.value.errors.uploadFailed.replace("{error}", getErrorMessage(error)), true);
  } finally {
    saving.value = false;
  }
};

const deleteSkillPack = async (key: string) => {
  try {
    const data = await apiJson<SkillsResponse>(`/api/actions/skills/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    response.value = {
      categories: response.value.categories,
      skill_packs: data.skill_packs || [],
      custom_skill_packs: data.custom_skill_packs || [],
    };
    syncStoreSkillPacks(response.value);
    await refreshActionDefinitions();
    showInfoModal(c.value.deleted);
  } catch (error) {
    showInfoModal(c.value.errors.deleteFailed.replace("{error}", getErrorMessage(error)), true);
  }
};

const toolTitle = (pack: SkillPack) => `${pack.tool_count || pack.tools?.length || 0} ${c.value.list.tools}`;

const riskCounts = (pack: SkillPack) => {
  const counts = new Map<string, number>();
  for (const tool of pack.tools || []) {
    const key = tool.risk_level || "safe";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
};

const riskTagType = (risk: string): "default" | "success" | "warning" | "error" | "info" => {
  if (risk === "safe") return "success";
  if (risk === "network") return "info";
  if (risk === "side_effect") return "warning";
  if (risk === "high") return "error";
  return "default";
};

onMounted(loadSkills);
</script>

<style scoped>
.skills-page {
  padding: 18px;
}

.metric-card,
.skill-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.metric-card {
  padding: 16px;
}

.metric-card strong {
  display: block;
  margin-top: 6px;
  font-size: 28px;
  color: #00ff7f;
}

.metric-label,
.muted {
  color: rgba(225, 225, 225, 0.62);
}

.upload-note {
  margin-bottom: 14px;
}

.file-input {
  width: 100%;
  color: rgba(225, 225, 225, 0.78);
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 12px;
  margin-bottom: 14px;
}

.skill-list {
  display: grid;
  gap: 14px;
}

.skill-card {
  padding: 16px;
}

.skill-card-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.skill-title-block {
  min-width: 0;
}

.skill-title-block h3 {
  margin: 0 0 8px;
  font-size: 18px;
}

.skill-tags,
.risk-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-desc {
  margin: 12px 0;
}

.file-browser {
  display: grid;
  grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
  gap: 12px;
}

.file-list {
  max-height: 520px;
  overflow: auto;
  padding: 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
}

.file-list-item {
  width: 100%;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: rgba(225, 225, 225, 0.72);
  cursor: pointer;
  display: block;
  margin: 2px 0;
  padding-bottom: 7px;
  padding-right: 8px;
  padding-top: 7px;
  text-align: left;
}

.file-list-item:hover,
.file-list-item.selected {
  background: rgba(0, 255, 127, 0.1);
  color: rgba(225, 225, 225, 0.96);
}

.skill-doc {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  color: rgba(225, 225, 225, 0.82);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tool-list {
  display: grid;
  gap: 10px;
}

.tool-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.16);
}

.tool-main {
  min-width: 0;
}

.tool-main strong,
.tool-main span {
  display: block;
}

.tool-main p {
  margin: 6px 0 0;
}

.tool-side {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
  justify-content: flex-end;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .skill-card-head,
  .tool-row {
    flex-direction: column;
  }

  .file-browser {
    grid-template-columns: 1fr;
  }

  .tool-side {
    justify-content: flex-start;
  }
}
</style>
