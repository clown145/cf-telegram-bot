<template>
  <main class="workflow-page">
    <section id="workflowSection">
      <!-- Header -->
      <div class="workflow-section-header">
        <h2 class="workflow-title">{{ t("workflow.title") }}</h2>
        <div class="workflow-header-actions">
          <div class="workflow-primary-actions">
            <!-- Workflow Selector -->
            <n-select
              id="workflowSelector"
              v-model:value="currentWorkflowId"
              :options="workflowOptions"
              :placeholder="t('workflow.selectorAria')"
              style="min-width: 150px;"
              @update:value="loadWorkflowIntoEditor"
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
            <n-button type="success" id="newWorkflowBtn" @click="createWorkflow">{{ t("workflow.create") }}</n-button>
            <workflow-tester-panel
              :workflow-id="currentWorkflowId"
              :workflow-map="allWorkflows"
              :action-map="actionMapForTest"
              :save-workflow-before-run="saveWorkflow"
              :resolve-action-name="getActionDisplayName"
            />
            <n-button type="primary" id="saveWorkflowBtn" @click="saveWorkflow">{{ t("workflow.save") }}</n-button>
            <n-button type="error" id="deleteWorkflowBtn" @click="deleteWorkflow">{{ t("workflow.remove") }}</n-button>
          </div>
        </div>
      </div>

      <!-- Editor Body -->
      <div 
        class="workflow-editor-body" 
        :class="{ 'palette-collapsed': paletteCollapsed, 'palette-transition-skip': skipTransition }"
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
               <n-button type="success" @click="createWorkflow">{{ t("workflow.emptyState.action") }}</n-button>
             </div>
           </div>
          
          <!-- Drawflow Container -->
          <div id="drawflow" ref="drawflowContainer"></div>
          
          <!-- Palette Pane -->
          <div class="node-palette-pane">
            <div id="node-palette" class="node-palette-container" ref="paletteContainer">
              <div class="node-palette-header">
                 <div class="node-palette-tools" style="width: 100%">
                   <input 
              type="text" 
              class="search-input" 
              :placeholder="t('workflow.searchPlaceholder')" 
              v-model="paletteSearchTerm"
              :aria-label="t('workflow.paletteSearchAria')"
              style="width: 100%"
            />
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
                        <div class="palette-node-header">
                           <div class="palette-node-title" :title="action.displayName">{{ action.displayName }}</div>

                        </div>
                        <p class="palette-node-description" :title="action.displayDescription">{{ truncate(action.displayDescription, 80) }}</p>
                        <div class="palette-node-footer">
                            <span class="muted">{{ action.id }}</span>
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
          </div>
        </div>
      </div>
    </section>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { NSelect, NButton } from 'naive-ui';
import { clearEditorBridge, registerEditorBridge, type TgButtonEditorBridge } from "../services/editorBridge";
import { showInputModal } from "../services/uiBridge";
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

const store = useAppStore();
const { t } = useI18n();

// Composables
const { editor, initEditor } = useDrawflow();
const drawflowContainer = ref<HTMLElement | null>(null);
const canvasWrapper = ref<HTMLElement | null>(null);

const { zoomValue, zoomIn, zoomOut, resetZoom, updateZoomDisplay } = useZoom(editor, drawflowContainer);
const { searchTerm: paletteSearchTerm, paletteGroups } = useNodePalette(store);
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
type WorkflowNodeConfigModalExpose = {
  openNodeModal: (nodeId: string) => void;
  closeNodeModal: () => void;
  handleWireResize: () => void;
};
const nodeConfigModalRef = ref<WorkflowNodeConfigModalExpose | null>(null);

const togglePalette = () => {
   paletteCollapsed.value = !paletteCollapsed.value;
   localStorage.setItem('workflow-palette-collapsed', paletteCollapsed.value ? '1' : '0');
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

// Drawflow may stop bubbling on native dblclick, so use click(detail===2) in capture phase.
const handleNodeDoubleClickIntent = (e: MouseEvent) => {
  if (e.detail < 2) return;
  const nodeId = resolveNodeIdFromTarget(e.target);
  if (!nodeId) return;
  nodeConfigModalRef.value?.openNodeModal(nodeId);
};

const handleWindowResize = () => {
  nodeConfigModalRef.value?.handleWireResize();
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
   if (drawflowContainer.value) {
      await initEditor(drawflowContainer.value);
      
      // Bind node open gesture
      if (editor.value) {
         editor.value.on('click', () => { /* maybe select logic */ });
         drawflowContainer.value.addEventListener("click", handleNodeDoubleClickIntent, true);
         
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
      } else {
          // No workflows exist, clear editor
          currentWorkflowId.value = '';
          workflowName.value = '';
      }
      
	      registerEditorBridge(workflowEditorBridge);
      
       // Restore collapsed state
       if (localStorage.getItem('workflow-palette-collapsed') === '1') {
          skipTransition.value = true;
          paletteCollapsed.value = true;
          setTimeout(() => skipTransition.value = false, 100);
       }
    }
    window.addEventListener("resize", handleWindowResize);
});

onBeforeUnmount(() => {
   window.removeEventListener("resize", handleWindowResize);
   nodeConfigModalRef.value?.closeNodeModal();
   if (drawflowContainer.value) {
      drawflowContainer.value.removeEventListener("click", handleNodeDoubleClickIntent, true);
   }
   clearEditorBridge(workflowEditorBridge);
});
</script>


