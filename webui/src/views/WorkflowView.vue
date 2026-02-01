<template>
  <main class="workflow-page">
    <section id="workflowSection">
      <div class="workflow-section-header">
        <h2 class="workflow-title">{{ t("workflow.title") }}</h2>
        <div class="workflow-header-actions">
          <div class="workflow-primary-actions">
            <select id="workflowSelector" class="secondary" :aria-label="t('workflow.selectorAria')"></select>
            <label for="workflowNameInput" class="visually-hidden">{{ t("workflow.nameLabel") }}</label>
            <input
              type="text"
              id="workflowNameInput"
              :placeholder="t('workflow.namePlaceholder')"
              :aria-label="t('workflow.nameLabel')"
            />
            <button
              id="editWorkflowDescriptionBtn"
              class="secondary workflow-description-btn"
              type="button"
              aria-haspopup="dialog"
              data-has-description="false"
            >
              {{ t("workflow.description") }}
            </button>
          </div>
          <div class="workflow-secondary-actions">
            <button id="newWorkflowBtn" class="secondary" type="button">{{ t("workflow.create") }}</button>
            <button id="saveWorkflowBtn" type="button">{{ t("workflow.save") }}</button>
            <button id="deleteWorkflowBtn" class="danger" type="button">{{ t("workflow.remove") }}</button>
          </div>
        </div>
      </div>
      <input type="hidden" id="workflowDescriptionInput" />
      <div class="workflow-editor-body">
        <div class="workflow-canvas-wrapper">
          <div id="drawflow"></div>
          <div class="node-palette-pane">
            <div id="node-palette" class="node-palette-container">
              <div class="node-palette-header">
                <div>
                  <h4>{{ t("workflow.paletteTitle") }}</h4>
                  <p class="muted">{{ t("workflow.paletteSubtitle") }}</p>
                </div>
                <div class="node-palette-tools">
                  <input
                    type="search"
                    id="nodePaletteSearch"
                    :placeholder="t('workflow.paletteSearch')"
                    :aria-label="t('workflow.paletteSearchAria')"
                  />
                  <button id="uploadModularActionBtn" class="secondary compact" type="button">{{ t("workflow.paletteUpload") }}</button>
                </div>
              </div>
              <input type="file" id="nodePaletteUploadInput" accept=".py" hidden />
              <div id="nodePaletteList" class="node-palette-scroll" role="list" :aria-label="t('workflow.paletteList')">
                <!-- 节点列表将注入到这里 -->
              </div>
            </div>
            <button
              id="nodePaletteCollapseBtn"
              class="node-palette-collapse"
              type="button"
              aria-expanded="true"
              aria-controls="node-palette"
              :aria-label="t('workflow.paletteCollapse')"
            >
              <span class="visually-hidden node-palette-collapse-label">{{ t("workflow.paletteCollapse") }}</span>
            </button>
          </div>
          <div class="workflow-zoom-controls" role="group" :aria-label="t('workflow.zoomLabel')">
            <button id="workflowZoomOut" class="secondary" type="button" :title="t('workflow.zoomOut')">-</button>
            <span id="workflowZoomValue" class="workflow-zoom-display">100%</span>
            <button id="workflowZoomIn" class="secondary" type="button" :title="t('workflow.zoomIn')">+</button>
            <button id="workflowZoomReset" class="secondary" type="button" :title="t('workflow.zoomReset')">{{ t("workflow.zoomReset") }}</button>
          </div>
        </div>
      </div>
    </section>

    <div v-if="nodeModal.visible" class="modal-overlay visible" @click.self="closeNodeModal">
      <div class="modal-container">
        <div class="modal-header">
          <h2>{{ t("workflow.nodeEdit") }}</h2>
          <button class="close-btn" @click="closeNodeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="nodeModal.action">
            <p class="muted">{{ getActionName(nodeModal.action) }}</p>
            <div v-for="input in nodeInputs" :key="input.name" class="field">
              <label>{{ getInputLabel(nodeModal.action, input) }}</label>
              <div class="field-input">
                <template v-if="input.type === 'boolean' || input.type === 'bool'">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="formValues[input.name]" />
                    {{ getInputDescription(nodeModal.action, input) || getInputLabel(nodeModal.action, input) }}
                  </label>
                </template>
                <template v-else-if="input.options && input.options.length">
                  <select v-model="formValues[input.name]">
                    <option value="">{{ t("workflow.selectPlaceholder") }}</option>
                    <option v-for="opt in input.options" :key="opt.value" :value="opt.value">
                      {{ opt.label || opt.value }}
                    </option>
                  </select>
                </template>
                <template v-else>
                  <textarea
                    v-model="formValues[input.name]"
                    rows="3"
                    :placeholder="getInputPlaceholder(nodeModal.action, input)"
                  ></textarea>
                </template>
              </div>
              <p v-if="getInputDescription(nodeModal.action, input)" class="field-description muted">
                {{ getInputDescription(nodeModal.action, input) }}
              </p>
            </div>

            <details style="margin-top: 12px;">
              <summary>{{ t("workflow.advancedJson") }}</summary>
              <textarea v-model="rawJson" rows="6"></textarea>
              <label class="checkbox-label" style="margin-top: 8px;">
                <input type="checkbox" v-model="useRawJson" />
                {{ t("workflow.useRawJson") }}
              </label>
            </details>
          </div>
          <div v-else class="muted">{{ t("workflow.nodeMissing") }}</div>
        </div>
        <div class="modal-footer">
          <button class="secondary" @click="closeNodeModal">{{ t("common.cancel") }}</button>
          <button @click="saveNodeConfig">{{ t("common.ok") }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useAppStore } from "../stores/app";
import { initWorkflowEditor } from "../legacy/editor";
import type { CombinedActionDefinition, ModularActionInput } from "../stores/app";
import { useI18n } from "../i18n";

const store = useAppStore();
const { t, locale } = useI18n();
let initialized = false;
const nodeModal = reactive({
  visible: false,
  nodeId: "",
  action: null as CombinedActionDefinition | null,
  originalData: {} as Record<string, unknown>,
});
const formValues = reactive<Record<string, any>>({});
const rawJson = ref("");
const useRawJson = ref(false);

const nodeInputs = computed<ModularActionInput[]>(() => {
  if (!nodeModal.action) return [];
  if (nodeModal.action.isModular) {
    return nodeModal.action.inputs || [];
  }
  if (nodeModal.action.isLocal) {
    return nodeModal.action.parameters || [];
  }
  return nodeModal.action.inputs || [];
});

const resolveI18nValue = (
  entry: Record<string, string> | undefined,
  fallback: string
) => {
  if (!entry) return fallback;
  const direct = entry[locale.value];
  if (direct) return direct;
  return entry["zh-CN"] || entry["en-US"] || fallback;
};

const getActionName = (action: CombinedActionDefinition | null) => {
  if (!action) return "";
  const i18nName = action.i18n?.name;
  return resolveI18nValue(i18nName, action.name || action.id || "");
};

const getInputLabel = (action: CombinedActionDefinition | null, input: ModularActionInput) => {
  if (!action) return input.name;
  const entry = action.i18n?.inputs?.[input.name]?.label;
  return resolveI18nValue(entry, input.label || input.name);
};

const getInputDescription = (action: CombinedActionDefinition | null, input: ModularActionInput) => {
  if (!action) return input.description || "";
  const entry = action.i18n?.inputs?.[input.name]?.description;
  return resolveI18nValue(entry, input.description || "");
};

const getInputPlaceholder = (action: CombinedActionDefinition | null, input: ModularActionInput) => {
  if (!action) return input.placeholder || "";
  const entry = action.i18n?.inputs?.[input.name]?.placeholder;
  return resolveI18nValue(entry, input.placeholder || "");
};

const refreshPalette = async () => {
  const editor = (window as any).tgButtonEditor;
  if (!editor?.refreshPalette) return;
  await nextTick();
  const palette = store.buildActionPalette();
  editor.refreshPalette(palette, store.secureUploadEnabled);
};

const openNodeModal = (node: any) => {
  const palette = store.buildActionPalette();
  const actionId = node?.data?.action?.id || node?.data?.action?.action_id;
  const action = palette[actionId] || null;
  nodeModal.visible = true;
  nodeModal.nodeId = String(node?.id || "");
  nodeModal.action = action;
  nodeModal.originalData = { ...(node?.data?.data || {}) };

  Object.keys(formValues).forEach((key) => delete formValues[key]);
  nodeInputs.value.forEach((input) => {
    formValues[input.name] = nodeModal.originalData[input.name] ?? input.default ?? "";
  });

  rawJson.value = JSON.stringify(nodeModal.originalData || {}, null, 2);
  useRawJson.value = false;
};

const closeNodeModal = () => {
  nodeModal.visible = false;
};

const saveNodeConfig = () => {
  let finalData: Record<string, unknown> = { ...(nodeModal.originalData || {}) };
  if (useRawJson.value) {
    try {
      finalData = JSON.parse(rawJson.value || "{}");
    } catch (error: any) {
      (window as any).showInfoModal?.(t("workflow.jsonParseFailed", { error: error.message || error }), true);
      return;
    }
  } else {
    for (const [key, value] of Object.entries(formValues)) {
      finalData[key] = value;
    }
  }
  const editor = (window as any).tgButtonEditor;
  if (editor && typeof editor.updateNodeConfig === "function") {
    editor.updateNodeConfig(nodeModal.nodeId, finalData);
  }
  nodeModal.visible = false;
};

onMounted(async () => {
  if (!store.loading && (store.modularActions.length === 0 || store.localActions.length === 0)) {
    await store.loadAll();
  }

  if (!initialized) {
    await nextTick();
    initWorkflowEditor();
    initialized = true;
  }

  await refreshPalette();
  const editor = (window as any).tgButtonEditor;
  if (editor?.refreshWorkflows) {
    editor.refreshWorkflows();
  }
  window.dispatchEvent(new Event("workflowTabShown"));

  const handler = (event: Event) => {
    const custom = event as CustomEvent;
    if (custom.detail?.node) {
      openNodeModal(custom.detail.node);
    }
  };
  document.getElementById("drawflow")?.addEventListener("opennodeconfig", handler as EventListener);
});

watch(
  () => locale.value,
  async () => {
    await refreshPalette();
  }
);

watch(
  () => [store.modularActions.length, store.localActions.length, store.secureUploadEnabled],
  async () => {
    if (store.loading) return;
    await refreshPalette();
  }
);
</script>
