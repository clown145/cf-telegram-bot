<template>
  <main class="workflow-page">
    <section id="workflowSection">
      <!-- Header -->
      <div
        class="workflow-section-header"
        :class="{
          'workflow-section-header-mobile': isNarrowViewport,
          'workflow-section-header-fullscreen-hidden': isNarrowViewport && isFullscreen,
        }"
      >
        <div class="workflow-title-wrap">
          <h2 class="workflow-title">{{ t("workflow.title") }}</h2>
          <n-tag v-if="workflowDirty" size="small" type="warning" round>
            {{ t("workflow.unsavedShort") }}
          </n-tag>
        </div>
        
        <div v-if="!isNarrowViewport" class="workflow-header-actions">
          <div class="workflow-primary-actions">
            <!-- Workflow Selector -->
            <n-select
              id="workflowSelector"
              :value="currentWorkflowId"
              :options="workflowOptions"
              :placeholder="t('workflow.selectorAria')"
              @update:value="handleWorkflowSelect"
            />
            
            <label for="workflowNameInput" class="visually-hidden">{{ t("workflow.nameLabel") }}</label>
            <input
              type="text"
              id="workflowNameInput"
              v-model="workflowName"
              :placeholder="t('workflow.namePlaceholder')"
              :aria-label="t('workflow.nameLabel')"
            />
            
            <button
               id="editWorkflowDescriptionBtn"
               class="secondary workflow-description-btn"
               type="button"
               :title="workflowDescription ? t('workflow.legacy.descriptionTitle', { description: workflowDescription }) : t('workflow.legacy.descriptionEmptyTitle')"
               :data-has-description="!!workflowDescription"
               @click="editDescription"
            >
              {{ t("workflow.description") }}
            </button>
          </div>
          
          <div class="workflow-secondary-actions">
            <n-button type="success" id="newWorkflowBtn" @click="handleCreateWorkflow">{{ t("workflow.create") }}</n-button>
            <n-button secondary id="quickInsertNodeBtn" @click="openQuickInsert">{{ t("workflow.quickInsert.open") }}</n-button>
            <workflow-tester-panel
              :workflow-id="currentWorkflowId"
              :workflow-map="allWorkflows"
              :action-map="actionMapForTest"
              :save-workflow-before-run="handleSaveWorkflow"
              :resolve-action-name="getActionDisplayName"
            />
            <n-button :type="workflowDirty ? 'warning' : 'primary'" id="saveWorkflowBtn" @click="handleSaveWorkflow">
              {{ t("workflow.save") }}
            </n-button>
            <n-button type="error" id="deleteWorkflowBtn" @click="deleteWorkflow">{{ t("workflow.remove") }}</n-button>
          </div>
        </div>

        <div v-else class="workflow-mobile-header">
          <n-select
            id="workflowSelector"
            :value="currentWorkflowId"
            :options="workflowOptions"
            :placeholder="t('workflow.selectorAria')"
            @update:value="handleWorkflowSelect"
          />
          <div class="workflow-mobile-current">
            <div class="workflow-mobile-current-label">{{ t("workflow.mobileActions.current") }}</div>
            <div class="workflow-mobile-current-main">
              <span
                class="workflow-mobile-current-name"
                :title="workflowName || currentWorkflowId || t('workflow.defaultName')"
              >
                {{ workflowName || currentWorkflowId || t("workflow.defaultName") }}
              </span>
              <n-tag v-if="workflowDirty" size="small" type="warning" round>
                {{ t("workflow.unsavedShort") }}
              </n-tag>
            </div>
            <div class="workflow-mobile-current-tip muted">
              {{ t("workflow.mobileActions.dockHint") }}
            </div>
          </div>
        </div>
      </div>

      <!-- Editor Body -->
      <div 
        class="workflow-editor-body" 
        :class="{
          'palette-collapsed': paletteCollapsed,
          'palette-transition-skip': skipTransition,
          'is-mobile-fullscreen': isNarrowViewport && isFullscreen,
        }"
      >
        <div class="workflow-canvas-wrapper" 
             ref="canvasWrapper"
             @drop="handleDrop" 
             @dragover="handleDragOver"
        >
          <!-- Empty State Overlay -->
           <div v-if="workflowOptions.length === 0 && !currentWorkflowId" class="workflow-empty-state">
             <div class="empty-state-content">
               <div class="empty-state-icon">📦</div>
               <h3>{{ t("workflow.emptyState.title") }}</h3>
               <p>{{ t("workflow.emptyState.description") }}</p>
               <n-button type="success" @click="handleCreateWorkflow">{{ t("workflow.emptyState.action") }}</n-button>
             </div>
           </div>
          
          <!-- Drawflow Container -->
          <div id="drawflow" ref="drawflowContainer"></div>

          <div
            v-if="isNarrowViewport && showMobileNodeHint && !mobileActionsOpen && !quickInsertVisible"
            class="workflow-mobile-node-hint"
          >
            <span>{{ t("workflow.mobileActions.nodeHint") }}</span>
            <button
              type="button"
              class="workflow-mobile-node-hint-close"
              :aria-label="t('common.close')"
              @click="dismissMobileNodeHint"
            >
              ×
            </button>
          </div>
          
          <!-- Palette Pane -->
          <div class="node-palette-pane">
            <div id="node-palette" class="node-palette-container" ref="paletteContainer">
              <div class="node-palette-header">
                  <div class="node-palette-tools">
                    <n-input
                      v-model:value="paletteSearchTerm"
                      :placeholder="t('workflow.searchPlaceholder')"
                      :aria-label="t('workflow.paletteSearchAria')"
                      clearable
                      size="small"
                    />
                    <div class="node-palette-filter-row">
                      <n-popover trigger="click" placement="bottom-start">
                        <template #trigger>
                          <n-button secondary size="small" class="node-palette-filter-trigger">
                            {{ t("workflow.paletteCategoryFilter") }}
                            <n-tag v-if="paletteCategoryFilters.length > 0" type="success" size="small" round>
                              {{ paletteCategoryFilters.length }}
                            </n-tag>
                          </n-button>
                        </template>
                        <div class="node-palette-filter-panel">
                          <div class="node-palette-filter-title">{{ t("workflow.paletteCategoryPlaceholder") }}</div>
                          <n-checkbox-group v-model:value="paletteCategoryFilters">
                            <n-space vertical size="small">
                              <n-checkbox
                                v-for="option in paletteCategoryOptions"
                                :key="option.value"
                                :value="option.value"
                              >
                                {{ option.label }}
                              </n-checkbox>
                            </n-space>
                          </n-checkbox-group>
                          <n-button
                            text
                            size="small"
                            class="node-palette-filter-clear"
                            @click="clearPaletteCategoryFilters"
                          >
                            {{ t("workflow.paletteCategoryClear") }}
                          </n-button>
                        </div>
                      </n-popover>
                      <span v-if="paletteCategoryFilters.length > 0" class="muted node-palette-filter-hint">
                        {{ t("workflow.paletteCategoryApplied", { count: paletteCategoryFilters.length }) }}
                      </span>
                    </div>
                  </div>
               </div>
              
               <div id="nodePaletteList" class="node-palette-scroll" role="list">
                 <div v-if="paletteGroups.length === 0" class="node-palette-empty">
                    {{ paletteSearchTerm ? t("workflow.legacy.actionListEmptyFiltered", { term: paletteSearchTerm }) : t("workflow.legacy.actionListEmptyAll") }}
                 </div>

                 <div
                   v-for="group in paletteGroups"
                   :key="group.key"
                   class="palette-group"
                   role="group"
                 >
                   <div class="palette-group-title">{{ group.label }}</div>
                   <div class="palette-group-list">
                     <div 
                        v-for="action in group.nodes" 
                        :key="action.id" 
                        class="palette-node" 
                        draggable="true"
                        role="listitem"
                        @dragstart="onDragStart($event, action)"
                        @touchstart.passive="startTouchDrag($event, action)"
                     >
                        <div class="palette-node-banner">
                          <div class="palette-node-main">
                            <div class="palette-node-title" :title="action.displayName">{{ action.displayName }}</div>
                            <div class="palette-node-subtitle" :title="action.displayDescription">
                              {{ truncate(action.displayDescription || action.id, 54) }}
                            </div>
                          </div>
                          <span class="palette-node-id">{{ action.id }}</span>
                        </div>
                     </div>
                   </div>
                 </div>
              </div>
            </div>
            
            <button
               id="nodePaletteCollapseBtn"
               class="node-palette-collapse"
               type="button"
               :aria-expanded="!paletteCollapsed"
               @click="togglePalette"
            >
               <span class="visually-hidden node-palette-collapse-label">
                  {{ paletteCollapsed ? t("workflow.legacy.paletteExpandLabel") : t("workflow.legacy.paletteCollapseLabel") }}
               </span>
            </button>
          </div>
          
          <!-- Zoom Controls -->
          <div class="workflow-zoom-controls">
             <button @click="zoomOut">-</button>
             <span class="workflow-zoom-display">{{ Math.round(zoomValue * 100) }}%</span>
             <button @click="zoomIn">+</button>
             <button @click="resetZoom">{{ t("workflow.zoomReset") }}</button>
             <button
               class="workflow-fullscreen-btn"
               :title="isFullscreen ? t('workflow.exitFullscreen') : t('workflow.enterFullscreen')"
               :aria-label="isFullscreen ? t('workflow.exitFullscreen') : t('workflow.enterFullscreen')"
               @click="toggleFullscreen"
             >
               {{ isFullscreen ? "X" : "FS" }}
             </button>
          </div>
        </div>
      </div>
    </section>

    <n-drawer
      v-if="isNarrowViewport"
      v-model:show="mobileActionsOpen"
      placement="bottom"
      :height="mobileActionsDrawerHeight"
      :trap-focus="false"
      :block-scroll="false"
    >
      <n-drawer-content
        :title="t('workflow.mobileActions.title')"
        closable
        class="workflow-mobile-actions-drawer-content"
      >
        <div class="workflow-mobile-actions-panel">
          <label for="workflowNameInputMobile" class="workflow-mobile-input-label">{{ t("workflow.nameLabel") }}</label>
          <n-input
            id="workflowNameInputMobile"
            v-model:value="workflowName"
            :placeholder="t('workflow.namePlaceholder')"
          />

          <n-button
            secondary
            class="workflow-mobile-action-description"
            @click="handleMobileEditDescription"
          >
            {{ t("workflow.description") }}
          </n-button>

          <div class="workflow-mobile-actions-grid">
            <n-button type="primary" @click="handleMobileSave">{{ t("workflow.save") }}</n-button>
            <n-button type="success" @click="handleMobileCreate">{{ t("workflow.create") }}</n-button>
            <n-button secondary @click="handleMobileQuickInsert">{{ t("workflow.quickInsert.open") }}</n-button>
            <n-button secondary @click="handleMobileFullscreen">
              {{ isFullscreen ? t("workflow.exitFullscreen") : t("workflow.enterFullscreen") }}
            </n-button>
          </div>

          <workflow-tester-panel
            class="workflow-mobile-tester"
            :workflow-id="currentWorkflowId"
            :workflow-map="allWorkflows"
            :action-map="actionMapForTest"
            :save-workflow-before-run="handleSaveWorkflow"
            :resolve-action-name="getActionDisplayName"
          />

          <n-button type="error" secondary :disabled="!currentWorkflowId" @click="handleMobileDelete">
            {{ t("workflow.remove") }}
          </n-button>
        </div>
      </n-drawer-content>
    </n-drawer>

    <div
      v-if="isNarrowViewport && !mobileActionsOpen && !quickInsertVisible"
      class="workflow-mobile-dock"
    >
      <button
        type="button"
        class="workflow-mobile-dock-btn"
        :class="{ 'is-active': !paletteCollapsed }"
        :title="paletteCollapsed ? t('workflow.mobileActions.showPalette') : t('workflow.mobileActions.hidePalette')"
        @click="handleMobilePaletteToggle"
      >
        {{ paletteCollapsed ? t("workflow.mobileActions.showPalette") : t("workflow.mobileActions.hidePalette") }}
      </button>
      <button
        type="button"
        class="workflow-mobile-dock-btn"
        :title="t('workflow.quickInsert.open')"
        @click="handleMobileQuickInsert"
      >
        {{ t("workflow.mobileActions.quickInsert") }}
      </button>
      <button
        type="button"
        class="workflow-mobile-dock-btn"
        :title="isFullscreen ? t('workflow.exitFullscreen') : t('workflow.enterFullscreen')"
        @click="handleMobileFullscreen"
      >
        {{ isFullscreen ? t("workflow.mobileActions.exitFsShort") : t("workflow.mobileActions.enterFsShort") }}
      </button>
      <button
        type="button"
        class="workflow-mobile-dock-btn is-primary"
        :title="t('workflow.mobileActions.open')"
        @click="mobileActionsOpen = true"
      >
        {{ t("workflow.mobileActions.open") }}
      </button>
    </div>

    <n-modal
      v-model:show="quickInsertVisible"
      :mask-closable="true"
      transform-origin="center"
      class="workflow-quick-insert-modal"
    >
      <div class="workflow-quick-insert" @click.stop>
        <div class="workflow-quick-insert-head">
          <strong>{{ t("workflow.quickInsert.title") }}</strong>
          <span class="muted">{{ t("workflow.quickInsert.shortcutHint") }}</span>
        </div>
        <n-input
          v-model:value="quickInsertSearch"
          :placeholder="t('workflow.quickInsert.searchPlaceholder')"
          clearable
          size="medium"
        />
        <div class="workflow-quick-insert-list">
          <button
            v-for="(action, index) in quickInsertCandidates"
            :key="`quick-${action.id}`"
            type="button"
            class="workflow-quick-insert-item"
            :class="{ 'is-active': index === quickInsertActiveIndex }"
            @mouseenter="quickInsertActiveIndex = index"
            @click="insertQuickAction(action)"
          >
            <span class="workflow-quick-insert-main">
              <span class="workflow-quick-insert-name">{{ action.displayName }}</span>
              <span class="workflow-quick-insert-desc">{{ truncate(action.displayDescription || action.id, 72) }}</span>
            </span>
            <span class="workflow-quick-insert-id">{{ action.id }}</span>
          </button>
          <div v-if="quickInsertCandidates.length === 0" class="node-palette-empty">
            {{ t("workflow.quickInsert.empty") }}
          </div>
        </div>
        <div class="workflow-quick-insert-foot muted">{{ t("workflow.quickInsert.footerHint") }}</div>
      </div>
    </n-modal>
    <workflow-node-config-modal
      ref="nodeConfigModalRef"
      :store="store"
      :editor="editor"
      :current-workflow-id="currentWorkflowId"
      :convert-to-custom-format="convertToCustomFormat"
      :get-action-display-name="getActionDisplayName"
      :get-input-label="getInputLabel"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import {
  NSelect,
  NButton,
  NInput,
  NModal,
  NPopover,
  NCheckboxGroup,
  NCheckbox,
  NSpace,
  NTag,
  NDrawer,
  NDrawerContent,
} from 'naive-ui';
import { clearEditorBridge, registerEditorBridge, type TgButtonEditorBridge } from "../services/editorBridge";
import { showConfirmModal, showInputModal } from "../services/uiBridge";
import WorkflowTesterPanel from "../components/workflow/WorkflowTesterPanel.vue";
import WorkflowNodeConfigModal from "../components/workflow/WorkflowNodeConfigModal.vue";
import { useAppStore } from '../stores/app';
import { useI18n } from '../i18n';
import { useDrawflow } from '../composables/workflow/useDrawflow';
import { useZoom } from '../composables/workflow/useZoom';
import { useNodePalette } from '../composables/workflow/useNodePalette';
import { useWorkflowManager } from '../composables/workflow/useWorkflowManager';
import { useDragDrop } from '../composables/workflow/useDragDrop';
import { useNodeUtils } from '../composables/workflow/useNodeUtils';
import { useWorkflowConverter } from '../composables/workflow/useWorkflowConverter';
import { CONTROL_INPUT_NAMES, isControlFlowOutputName } from "../composables/workflow/constants";

const store = useAppStore();
const { t } = useI18n();

// Composables
const { editor, initEditor } = useDrawflow();
const drawflowContainer = ref<HTMLElement | null>(null);
const canvasWrapper = ref<HTMLElement | null>(null);

const { zoomValue, zoomIn, zoomOut, resetZoom, updateZoomDisplay } = useZoom(editor, drawflowContainer);
const {
  searchTerm: paletteSearchTerm,
  selectedCategories: paletteCategoryFilters,
  categoryOptions: paletteCategoryOptions,
  allPaletteNodes,
  paletteGroups
} = useNodePalette(store);
const { 
  currentWorkflowId, workflowName, workflowDescription, 
  loadWorkflowIntoEditor, createWorkflow, saveWorkflow, deleteWorkflow 
} = useWorkflowManager(store, editor);

const { buildNodeHtml, buildDefaultNodeData, getActionDisplayName, getInputLabel, getFlowOutputs } = useNodeUtils();
const { convertToCustomFormat } = useWorkflowConverter();
const workflowEditorBridge: TgButtonEditorBridge = {
  saveCurrentWorkflow: saveWorkflow,
  refreshPalette: () => {
    // Palette and workflows are reactive from store state.
  },
  refreshWorkflows: () => {
    // No-op, kept for backward compatibility.
  },
  updateNodeConfig: (id: string, newData: Record<string, unknown>) => {
    if (!editor.value) return;
    const node = editor.value.getNodeFromId(id);
    if (!node || !node.data) return;
    const updatedNodeData = { ...node.data, data: newData };
    editor.value.updateNodeDataFromId(id, updatedNodeData);
  },
};

// Drag & Drop
const onAddNode = (action: any, x: number, y: number) => {
   if (!editor.value || !action) return;
   
   const flowOutputs = getFlowOutputs(action);
   const numInputs = 1;
   const numOutputs = flowOutputs.length ? flowOutputs.length : 1;
   const html = buildNodeHtml(action);
   const data = {
      action: action,
      data: buildDefaultNodeData(action)
   };
   
   editor.value.addNode(
      action.id,
      Math.max(1, numInputs),
      Math.max(1, numOutputs),
      x,
      y,
      'workflow-node',
      data,
      html
   );
   scheduleWorkflowDirtyCheck();
};

const { handleDragOver, handleDrop, startTouchDrag } = useDragDrop(canvasWrapper, editor, onAddNode);

// Palette Drag Start (Desktop)
const onDragStart = (event: DragEvent, action: any) => {
    if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', JSON.stringify(action));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event.dataTransfer as any).effectAllowed = 'copy';
    }
};

// UI State
const allWorkflows = computed(() => store.state.workflows || {});
const workflowOptions = computed(() => 
  Object.entries(allWorkflows.value).map(([id, wf]) => ({
    label: wf.name || id,
    value: id
  }))
);
const actionMapForTest = computed(() => (store.state.actions || {}) as Record<string, any>);
const paletteCollapsed = ref(false);
const skipTransition = ref(false);
const paletteContainer = ref<HTMLElement | null>(null);
const isNarrowViewport = ref(false);
const isFullscreen = ref(false);
const mobileActionsOpen = ref(false);
const mobileActionsDrawerHeight = ref(420);
const quickInsertVisible = ref(false);
const quickInsertSearch = ref("");
const quickInsertActiveIndex = ref(0);
const showMobileNodeHint = ref(false);
const MOBILE_NODE_HINT_KEY = "workflow-mobile-node-hint-dismissed-v1";
let lastTouchedNodeId = "";
let lastTouchedNodeAt = 0;
const workflowDirty = ref(false);
const workflowBaselineSignature = ref("");
let workflowDirtyRaf = 0;
const editorMutationEvents = [
  "nodeCreated",
  "nodeRemoved",
  "connectionCreated",
  "connectionRemoved",
  "nodeMoved",
  "nodeDataChanged",
  "rerouteMoved",
] as const;
type WorkflowNodeConfigModalExpose = {
  openNodeModal: (nodeId: string) => void;
  closeNodeModal: () => void;
  handleWireResize: () => void;
};
const nodeConfigModalRef = ref<WorkflowNodeConfigModalExpose | null>(null);

const sortDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const next: Record<string, unknown> = {};
  for (const [key, val] of entries) {
    next[key] = sortDeep(val);
  }
  return next;
};

const stableStringify = (value: unknown) => JSON.stringify(sortDeep(value));

const resolveWorkflowShape = (workflowRaw: any) => {
  if (!workflowRaw || typeof workflowRaw !== "object") return null;
  if (
    workflowRaw.nodes &&
    typeof workflowRaw.nodes === "object" &&
    !Array.isArray(workflowRaw.nodes) &&
    Array.isArray(workflowRaw.edges)
  ) {
    return workflowRaw;
  }
  if (workflowRaw.data && typeof workflowRaw.data === "object" && workflowRaw.data.nodes) {
    return workflowRaw.data;
  }
  if (typeof workflowRaw.data === "string") {
    try {
      const parsed = JSON.parse(workflowRaw.data);
      if (parsed && typeof parsed === "object" && parsed.nodes) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
};

const getHiddenDataEdgesFromStore = (workflowId: string) => {
  const workflowRaw = (store.state.workflows || {})[workflowId];
  const workflow = resolveWorkflowShape(workflowRaw);
  const edges = Array.isArray(workflow?.edges) ? workflow.edges : [];
  return edges
    .filter((edge: any) => {
      if (!edge) return false;
      if (CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) return false;
      if (isControlFlowOutputName(String(edge.source_output || ""))) return false;
      return true;
    })
    .map((edge: any) => ({ ...edge }));
};

const normalizeWorkflowComparable = (workflow: any, name: string, description: string) => {
  const nodesRaw = (workflow?.nodes || {}) as Record<string, unknown>;
  const normalizedNodes: Record<string, unknown> = {};
  for (const key of Object.keys(nodesRaw).sort((a, b) => a.localeCompare(b))) {
    normalizedNodes[key] = sortDeep(nodesRaw[key]);
  }
  const edgesRaw = Array.isArray(workflow?.edges) ? workflow.edges : [];
  const normalizedEdges = edgesRaw
    .map((edge: unknown) => sortDeep(edge))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));

  return {
    name: String(name || ""),
    description: String(description || ""),
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };
};

const getStoredWorkflowComparable = (workflowId: string) => {
  const workflowRaw = (store.state.workflows || {})[workflowId];
  const workflow = resolveWorkflowShape(workflowRaw);
  if (!workflow) return null;
  return normalizeWorkflowComparable(workflow, workflowRaw?.name || "", workflowRaw?.description || "");
};

const getCurrentWorkflowComparable = () => {
  if (!editor.value || !currentWorkflowId.value) return null;
  try {
    const custom = convertToCustomFormat(editor.value.export());
    const hiddenEdges = getHiddenDataEdgesFromStore(currentWorkflowId.value);
    custom.edges = [...(Array.isArray(custom.edges) ? custom.edges : []), ...hiddenEdges];
    return normalizeWorkflowComparable(custom, workflowName.value, workflowDescription.value);
  } catch {
    return null;
  }
};

const captureWorkflowBaseline = (workflowId?: string) => {
  const targetId = String(workflowId || currentWorkflowId.value || "").trim();
  if (!targetId) {
    workflowBaselineSignature.value = "";
    workflowDirty.value = false;
    return;
  }
  const stored = getStoredWorkflowComparable(targetId);
  workflowBaselineSignature.value = stored ? stableStringify(stored) : "";
  workflowDirty.value = false;
};

const recomputeWorkflowDirty = () => {
  const baseline = String(workflowBaselineSignature.value || "");
  if (!baseline || !currentWorkflowId.value) {
    workflowDirty.value = false;
    return;
  }
  const current = getCurrentWorkflowComparable();
  if (!current) {
    workflowDirty.value = false;
    return;
  }
  workflowDirty.value = stableStringify(current) !== baseline;
};

const scheduleWorkflowDirtyCheck = () => {
  if (typeof window === "undefined") return;
  if (workflowDirtyRaf) return;
  workflowDirtyRaf = window.requestAnimationFrame(() => {
    workflowDirtyRaf = 0;
    recomputeWorkflowDirty();
  });
};

const clearPaletteCategoryFilters = () => {
  paletteCategoryFilters.value = [];
};

const quickInsertCandidates = computed(() => {
  const term = quickInsertSearch.value.trim().toLowerCase();
  const list = (allPaletteNodes.value || []) as Array<Record<string, any>>;
  if (!term) return list.slice(0, 40);
  return list
    .filter((item) => {
      const name = String(item.displayName || "").toLowerCase();
      const desc = String(item.displayDescription || "").toLowerCase();
      const id = String(item.id || "").toLowerCase();
      return name.includes(term) || desc.includes(term) || id.includes(term);
    })
    .slice(0, 40);
});

const focusQuickInsertInput = () => {
  const input = document.querySelector<HTMLInputElement>(
    ".workflow-quick-insert input, .workflow-quick-insert .n-input__input-el"
  );
  if (input) {
    input.focus();
    input.select();
  }
};

const openQuickInsert = () => {
  quickInsertVisible.value = true;
};

const closeQuickInsert = () => {
  quickInsertVisible.value = false;
};

const getCanvasCenterPosition = () => {
  if (!editor.value || !drawflowContainer.value) return { x: 120, y: 120 };
  const containerRect = drawflowContainer.value.getBoundingClientRect();
  const centerX = containerRect.left + containerRect.width / 2;
  const centerY = containerRect.top + containerRect.height / 2;
  const preRect = editor.value.precanvas.getBoundingClientRect();
  return {
    x: (centerX - preRect.left) / editor.value.zoom,
    y: (centerY - preRect.top) / editor.value.zoom,
  };
};

const insertQuickAction = (action: any) => {
  if (!action) return;
  const { x, y } = getCanvasCenterPosition();
  onAddNode(action, x, y);
  closeQuickInsert();
};

const clampQuickInsertIndex = () => {
  if (quickInsertCandidates.value.length === 0) {
    quickInsertActiveIndex.value = -1;
    return;
  }
  if (quickInsertActiveIndex.value < 0 || quickInsertActiveIndex.value >= quickInsertCandidates.value.length) {
    quickInsertActiveIndex.value = 0;
  }
};

watch(quickInsertVisible, async (visible) => {
  if (!visible) return;
  quickInsertSearch.value = "";
  quickInsertActiveIndex.value = 0;
  await nextTick();
  focusQuickInsertInput();
});

watch(quickInsertSearch, () => {
  quickInsertActiveIndex.value = 0;
});

watch(quickInsertCandidates, () => {
  clampQuickInsertIndex();
});

watch(isNarrowViewport, (narrow, previousNarrow) => {
  if (!narrow) {
    mobileActionsOpen.value = false;
    showMobileNodeHint.value = false;
  }
  if (narrow && previousNarrow === false && !paletteCollapsed.value) {
    paletteCollapsed.value = true;
  }
  if (narrow && previousNarrow === false) {
    const dismissed = localStorage.getItem(MOBILE_NODE_HINT_KEY) === "1";
    showMobileNodeHint.value = !dismissed;
  }
});

watch(
  () => [workflowName.value, workflowDescription.value],
  () => {
    scheduleWorkflowDirtyCheck();
  }
);

watch(
  () => currentWorkflowId.value,
  (nextId, prevId) => {
    if (nextId !== prevId) {
      captureWorkflowBaseline(nextId);
    }
    scheduleWorkflowDirtyCheck();
  }
);

watch(
  () => store.state.workflows?.[currentWorkflowId.value],
  () => {
    scheduleWorkflowDirtyCheck();
  },
  { deep: true }
);

const handleWorkflowSelect = (id: string) => {
  const targetId = String(id || "").trim();
  if (!targetId || targetId === currentWorkflowId.value) return;

  const applyLoad = async () => {
    loadWorkflowIntoEditor(targetId);
    await nextTick();
    captureWorkflowBaseline(targetId);
    scheduleWorkflowDirtyCheck();
  };

  if (!workflowDirty.value) {
    void applyLoad();
    return;
  }

  showConfirmModal(
    t("workflow.unsavedConfirmTitle"),
    t("workflow.unsavedSwitchMessage"),
    () => {
      void applyLoad();
    }
  );
};

const handleSaveWorkflow = async () => {
  await Promise.resolve(saveWorkflow());
  captureWorkflowBaseline();
  scheduleWorkflowDirtyCheck();
};

const handleCreateWorkflow = async () => {
  const applyCreate = async () => {
    await Promise.resolve(createWorkflow());
    await nextTick();
    captureWorkflowBaseline();
    scheduleWorkflowDirtyCheck();
  };

  if (!currentWorkflowId.value || !workflowDirty.value) {
    await applyCreate();
    return;
  }

  showConfirmModal(
    t("workflow.unsavedConfirmTitle"),
    t("workflow.unsavedCreateMessage"),
    () => {
      void applyCreate();
    }
  );
};

const togglePalette = () => {
   paletteCollapsed.value = !paletteCollapsed.value;
   localStorage.setItem('workflow-palette-collapsed', paletteCollapsed.value ? '1' : '0');
};

const dismissMobileNodeHint = () => {
  showMobileNodeHint.value = false;
  localStorage.setItem(MOBILE_NODE_HINT_KEY, "1");
};

const handleMobilePaletteToggle = () => {
  togglePalette();
};

const truncate = (str: string, len: number) => {
   if (!str) return '';
   return str.length > len ? str.substring(0, len) + '...' : str;
};

const resolveNodeIdFromTarget = (target: EventTarget | null): string => {
  const element = target instanceof Element ? target : null;
  const nodeEl = element?.closest(".drawflow-node") as HTMLElement | null;
  if (!nodeEl) return "";

  const rawId = String(nodeEl.id || "").trim();
  if (!rawId) return "";
  if (rawId.startsWith("node-")) {
    return rawId.slice(5);
  }
  return rawId;
};

const updateViewportMode = () => {
  if (typeof window === "undefined") return;
  isNarrowViewport.value = window.innerWidth <= 960;
  mobileActionsDrawerHeight.value = Math.max(320, Math.min(640, Math.round(window.innerHeight * 0.78)));
};

const lockLandscapeIfPossible = async () => {
  if (!isNarrowViewport.value || typeof screen === "undefined") return;
  const orientation = (screen as Screen & { orientation?: { lock?: (value: string) => Promise<void> } }).orientation;
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // Ignore browsers that do not allow orientation lock.
  }
};

const unlockOrientationIfPossible = () => {
  if (typeof screen === "undefined") return;
  const orientation = (screen as Screen & { orientation?: { unlock?: () => void } }).orientation;
  if (!orientation?.unlock) return;
  try {
    orientation.unlock();
  } catch {
    // Ignore unsupported unlock.
  }
};

const getFullscreenElement = () => {
  if (typeof document === "undefined") return null;
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return doc.fullscreenElement || doc.webkitFullscreenElement || null;
};

const updateFullscreenState = () => {
  const fullscreenEl = getFullscreenElement();
  isFullscreen.value = Boolean(fullscreenEl && fullscreenEl === document.documentElement);
};

const requestElementFullscreen = async (el: HTMLElement) => {
  const target = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  if (target.requestFullscreen) {
    await target.requestFullscreen();
    return;
  }
  if (target.webkitRequestFullscreen) {
    await target.webkitRequestFullscreen();
  }
};

const exitDocumentFullscreen = async () => {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (doc.exitFullscreen) {
    await doc.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
};

const toggleFullscreen = async () => {
  if (typeof document === "undefined") return;
  const target = document.documentElement as HTMLElement;

  try {
    const fullscreenEl = getFullscreenElement();
    if (fullscreenEl) {
      await exitDocumentFullscreen();
      unlockOrientationIfPossible();
    } else {
      if (isNarrowViewport.value) {
        mobileActionsOpen.value = false;
        closeQuickInsert();
        paletteCollapsed.value = true;
        localStorage.setItem('workflow-palette-collapsed', '1');
      }
      await requestElementFullscreen(target);
      await lockLandscapeIfPossible();
    }
  } catch (error) {
    console.error("Failed to toggle fullscreen", error);
  } finally {
    updateFullscreenState();
  }
};

const handleFullscreenChange = () => {
  updateFullscreenState();
  if (!getFullscreenElement()) {
    unlockOrientationIfPossible();
  }
};

const closeMobileActions = () => {
  mobileActionsOpen.value = false;
};

const handleMobileSave = async () => {
  await handleSaveWorkflow();
  closeMobileActions();
};

const handleMobileCreate = async () => {
  await handleCreateWorkflow();
  closeMobileActions();
};

const handleMobileQuickInsert = () => {
  closeMobileActions();
  openQuickInsert();
};

const handleMobileDelete = () => {
  closeMobileActions();
  deleteWorkflow();
};

const handleMobileEditDescription = () => {
  closeMobileActions();
  editDescription();
};

const handleMobileFullscreen = async () => {
  closeMobileActions();
  await toggleFullscreen();
};

// Drawflow may stop bubbling on native dblclick, so use click(detail===2) in capture phase.
const handleNodeDoubleClickIntent = (e: MouseEvent) => {
  if (e.detail < 2) return;
  const nodeId = resolveNodeIdFromTarget(e.target);
  if (!nodeId) return;
  if (isNarrowViewport.value) {
    dismissMobileNodeHint();
  }
  nodeConfigModalRef.value?.openNodeModal(nodeId);
};

const handleNodeTouchIntent = (e: TouchEvent) => {
  if (!isNarrowViewport.value) return;
  if (e.changedTouches.length !== 1) return;
  const nodeId = resolveNodeIdFromTarget(e.target);
  if (!nodeId) return;
  const now = Date.now();
  const isDoubleTap = nodeId === lastTouchedNodeId && now - lastTouchedNodeAt < 360;
  if (isDoubleTap) {
    e.preventDefault();
    nodeConfigModalRef.value?.openNodeModal(nodeId);
    dismissMobileNodeHint();
    lastTouchedNodeId = "";
    lastTouchedNodeAt = 0;
    return;
  }
  lastTouchedNodeId = nodeId;
  lastTouchedNodeAt = now;
};

const handleWindowResize = () => {
  updateViewportMode();
  nodeConfigModalRef.value?.handleWireResize();
};

const handleEditorMutation = () => {
  scheduleWorkflowDirtyCheck();
};

const registerEditorMutationListeners = () => {
  if (!editor.value) return;
  editorMutationEvents.forEach((eventName) => {
    try {
      editor.value?.on(eventName, handleEditorMutation);
    } catch {
      // Ignore unsupported event names across drawflow versions.
    }
  });
};

const unregisterEditorMutationListeners = () => {
  if (!editor.value) return;
  editorMutationEvents.forEach((eventName) => {
    try {
      editor.value?.removeListener(eventName, handleEditorMutation);
    } catch {
      // Ignore unsupported event names across drawflow versions.
    }
  });
};

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  recomputeWorkflowDirty();
  if (!workflowDirty.value) return;
  event.preventDefault();
  event.returnValue = t("workflow.unsavedLeavePrompt");
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  const key = String(event.key || "");
  const lowered = key.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && lowered === "s") {
    event.preventDefault();
    void handleSaveWorkflow();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && lowered === "k") {
    if (!quickInsertVisible.value && isEditableTarget(event.target)) {
      return;
    }
    event.preventDefault();
    if (quickInsertVisible.value) {
      closeQuickInsert();
    } else {
      openQuickInsert();
    }
    return;
  }

  if (!quickInsertVisible.value) return;

  if (key === "Escape") {
    event.preventDefault();
    closeQuickInsert();
    return;
  }

  const total = quickInsertCandidates.value.length;
  if (total === 0) return;

  if (key === "ArrowDown") {
    event.preventDefault();
    quickInsertActiveIndex.value = (quickInsertActiveIndex.value + 1 + total) % total;
    return;
  }

  if (key === "ArrowUp") {
    event.preventDefault();
    quickInsertActiveIndex.value = (quickInsertActiveIndex.value - 1 + total) % total;
    return;
  }

  if (key === "Enter") {
    event.preventDefault();
    const action = quickInsertCandidates.value[quickInsertActiveIndex.value];
    if (action) insertQuickAction(action);
  }
};

// Description Editing
const editDescription = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    showInputModal(
        t("workflow.legacy.descriptionEditTitle"),
        t("workflow.legacy.descriptionEditPrompt"),
        'textarea',
        t("workflow.legacy.descriptionEditPlaceholder"),
        (val: string) => { workflowDescription.value = val; },
        undefined,
        { defaultValue: workflowDescription.value, rows: 5 }
    );
};

// Lifecycle
onMounted(async () => {
   updateViewportMode();
   updateFullscreenState();
   const dismissed = localStorage.getItem(MOBILE_NODE_HINT_KEY) === "1";
   showMobileNodeHint.value = isNarrowViewport.value && !dismissed;
   if (drawflowContainer.value) {
      await initEditor(drawflowContainer.value);
      
      // Bind node open gesture
      if (editor.value) {
         editor.value.on('click', () => { /* maybe select logic */ });
         drawflowContainer.value.addEventListener("click", handleNodeDoubleClickIntent, true);
         drawflowContainer.value.addEventListener("touchend", handleNodeTouchIntent, true);
         registerEditorMutationListeners();
         
         // Update Zoom on start
         updateZoomDisplay();
         
         // Event mapping for zoom update
         editor.value.on('zoom', updateZoomDisplay);
      }
      
      // Load initial data if not yet loaded
      if (!store.loading && !store.state.version) {
         await store.loadAll();
      }
      
      // Wait a tick for store to update after loadAll
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const ids = Object.keys(store.state.workflows || {});
      if (ids.length > 0) {
          loadWorkflowIntoEditor(ids[0]);
          await nextTick();
          captureWorkflowBaseline(ids[0]);
          scheduleWorkflowDirtyCheck();
      } else {
          // No workflows exist, clear editor
          currentWorkflowId.value = '';
          workflowName.value = '';
          captureWorkflowBaseline("");
      }
      
	      registerEditorBridge(workflowEditorBridge);
      
       // Restore collapsed state
       const savedPaletteCollapsed = localStorage.getItem('workflow-palette-collapsed');
       if (savedPaletteCollapsed === '1' || (savedPaletteCollapsed === null && isNarrowViewport.value)) {
          skipTransition.value = true;
          paletteCollapsed.value = true;
          setTimeout(() => skipTransition.value = false, 100);
       }
    }
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange as EventListener);
});

onBeforeUnmount(() => {
   if (workflowDirtyRaf) {
     window.cancelAnimationFrame(workflowDirtyRaf);
     workflowDirtyRaf = 0;
   }
   window.removeEventListener("resize", handleWindowResize);
   window.removeEventListener("keydown", handleGlobalKeydown);
   window.removeEventListener("beforeunload", handleBeforeUnload);
   document.removeEventListener("fullscreenchange", handleFullscreenChange);
   document.removeEventListener("webkitfullscreenchange", handleFullscreenChange as EventListener);
   closeQuickInsert();
   closeMobileActions();
   nodeConfigModalRef.value?.closeNodeModal();
   if (isFullscreen.value) {
     void exitDocumentFullscreen().catch(() => undefined);
   }
   unlockOrientationIfPossible();
   if (drawflowContainer.value) {
      drawflowContainer.value.removeEventListener("click", handleNodeDoubleClickIntent, true);
      drawflowContainer.value.removeEventListener("touchend", handleNodeTouchIntent, true);
   }
   unregisterEditorMutationListeners();
   clearEditorBridge(workflowEditorBridge);
});
</script>
