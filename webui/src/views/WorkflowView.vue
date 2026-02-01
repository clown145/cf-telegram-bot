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
            <button id="newWorkflowBtn" class="secondary" type="button" @click="createWorkflow">{{ t("workflow.create") }}</button>
            <button id="saveWorkflowBtn" type="button" @click="saveWorkflow">{{ t("workflow.save") }}</button>
            <button id="deleteWorkflowBtn" class="danger" type="button" @click="deleteWorkflow">{{ t("workflow.remove") }}</button>
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
              <h3>暂无工作流</h3>
              <p>点击上方"新建"按钮创建您的第一个工作流</p>
              <button type="button" class="primary" @click="createWorkflow">新建工作流</button>
            </div>
          </div>
          
          <!-- Drawflow Container -->
          <div id="drawflow" ref="drawflowContainer"></div>
          
          <!-- Palette Pane -->
          <div class="node-palette-pane">
            <div id="node-palette" class="node-palette-container" ref="paletteContainer">
              <div class="node-palette-header">
                 <div>
                   <h4>{{ t("workflow.paletteTitle") }}</h4>
                   <p class="muted">{{ t("workflow.paletteSubtitle") }}</p>
                 </div>
                 <div class="node-palette-tools">
                   <input 
              type="text" 
              class="search-input" 
              :placeholder="t('workflow.searchPlaceholder')" 
              v-model="paletteSearchTerm"
              :aria-label="t('workflow.paletteSearchAria')"
            />
                   <button 
                      id="uploadModularActionBtn" 
                      class="secondary compact" 
                      type="button" 
                      @click="triggerUpload"
                   >
                      {{ t("workflow.paletteUpload") }}
                   </button>
                   <input type="file" ref="fileInput" accept=".py,.json,.js" style="display:none" @change="handleFileUpload" />
                 </div>
              </div>
              
              <div id="nodePaletteList" class="node-palette-scroll" role="list">
                 <div v-if="paletteNodes.length === 0" class="node-palette-empty">
                    {{ paletteSearchTerm ? t("workflow.legacy.actionListEmptyFiltered", { term: paletteSearchTerm }) : t("workflow.legacy.actionListEmptyAll") }}
                 </div>
                 
                 <div 
                    v-for="action in paletteNodes" 
                    :key="action.id" 
                    class="palette-node" 
                    draggable="true"
                    role="listitem"
                    @dragstart="onDragStart($event, action)"
                    @touchstart.passive="startTouchDrag($event, action)"
                 >
                    <div class="palette-node-header">
                       <div class="palette-node-title" :title="action.displayName">{{ action.displayName }}</div>
                       <div class="node-actions">
                          <a 
                            :href="`/api/actions/modular/download/${encodeURIComponent(action.id)}`" 
                            :download="action.filename || `${action.id}.py`"
                            class="secondary node-action-btn download-action-btn"
                            @click.stop
                          >&#x2B07;</a> 
                          <a 
                            href="#" 
                            class="secondary node-action-btn delete-action-btn"
                            @click.stop.prevent="handleDeleteAction(action)"
                          >&#x1F5D1;</a>
                       </div>
                    </div>
                    <p class="palette-node-description" :title="action.displayDescription">{{ truncate(action.displayDescription, 80) }}</p>
                    <div class="palette-node-footer">
                        <span class="muted">{{ action.id }}</span>
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
    
    <!-- Node Configuration Modal -->
    <n-modal
      v-model:show="nodeModal.visible"
      preset="card"
      :title="t('workflow.nodeEdit')"
      style="width: 600px; max-width: 90vw;"
      @close="closeNodeModal"
    >
      <div v-if="nodeModal.action">
         <p class="muted" style="margin-bottom: 16px;">{{ getActionDisplayName(nodeModal.action.id, nodeModal.action) }}</p>
         
         <n-form label-placement="top">
            <template v-for="input in nodeInputs" :key="input.name">
               <n-form-item :label="getInputLabel(nodeModal.action, input)" :path="input.name">
                   <template v-if="input.type === 'boolean' || input.type === 'bool'">
                      <n-switch v-model:value="formValues[input.name]" />
                   </template>
                   <template v-else-if="input.options && input.options.length">
                      <n-select 
                         v-model:value="formValues[input.name]" 
                         :options="input.options.map((opt:any) => ({ label: opt.label || opt.value, value: opt.value }))"
                         filterable
                      />
                   </template>
                   <template v-else>
                      <n-input type="textarea" v-model:value="formValues[input.name]" rows="3" />
                   </template>
                   <template #feedback v-if="input.description">
                      {{ input.description }}
                   </template>
               </n-form-item>
            </template>
         </n-form>
         
         <n-collapse>
           <n-collapse-item :title="t('workflow.advancedJson')" name="json">
              <n-input type="textarea" v-model:value="rawJson" rows="6" />
              <n-checkbox v-model:checked="useRawJson" style="margin-top: 8px;">
                 {{ t("workflow.useRawJson") }}
              </n-checkbox>
           </n-collapse-item>
         </n-collapse>
      </div>
      <div v-else class="muted">{{ t("workflow.nodeMissing") }}</div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
           <n-button @click="closeNodeModal">{{ t("common.cancel") }}</n-button>
           <n-button type="primary" @click="saveNodeConfig">{{ t("common.ok") }}</n-button>
        </div>
      </template>
    </n-modal>
  </main>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { 
  NModal, NForm, NFormItem, NInput, NCheckbox, NSwitch, NSelect, NButton, NCollapse, NCollapseItem 
} from 'naive-ui';
import { useAppStore } from '../stores/app';
import { useI18n } from '../i18n';
import { useDrawflow } from '../composables/workflow/useDrawflow';
import { useZoom } from '../composables/workflow/useZoom';
import { useNodePalette } from '../composables/workflow/useNodePalette';
import { useWorkflowManager } from '../composables/workflow/useWorkflowManager';
import { useDragDrop } from '../composables/workflow/useDragDrop';
import { useNodeUtils } from '../composables/workflow/useNodeUtils';

const store = useAppStore();
const { t } = useI18n();

// Composables
const { editor, initEditor } = useDrawflow();
const drawflowContainer = ref<HTMLElement | null>(null);
const canvasWrapper = ref<HTMLElement | null>(null);

const { zoomValue, zoomIn, zoomOut, resetZoom, updateZoomDisplay } = useZoom(editor, drawflowContainer);
const { searchTerm: paletteSearchTerm, paletteNodes, uploadAction, deleteAction } = useNodePalette(store);
const { 
  currentWorkflowId, workflowName, workflowDescription, 
  loadWorkflowIntoEditor, createWorkflow, saveWorkflow, deleteWorkflow 
} = useWorkflowManager(store, editor);

const { buildNodeHtml, buildDefaultNodeData, getActionDisplayName, getInputLabel } = useNodeUtils();

// Drag & Drop
const onAddNode = (action: any, x: number, y: number) => {
   if (!editor.value || !action) return;
   
   const numInputs = action.isModular ? (action.inputs || []).length : 1;
   const numOutputs = action.isModular ? (action.outputs || []).length : 1;
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
const paletteCollapsed = ref(false);
const skipTransition = ref(false);
const paletteContainer = ref<HTMLElement | null>(null);

const togglePalette = () => {
   paletteCollapsed.value = !paletteCollapsed.value;
   localStorage.setItem('workflow-palette-collapsed', paletteCollapsed.value ? '1' : '0');
};

const truncate = (str: string, len: number) => {
   if (!str) return '';
   return str.length > len ? str.substring(0, len) + '...' : str;
};

// Node Config Modal
const nodeModal = reactive({
   visible: false,
   nodeId: '',
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   action: null as any,
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   originalData: {} as any
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formValues = reactive<Record<string, any>>({});
const rawJson = ref('');
const useRawJson = ref(false);

const nodeInputs = computed(() => {
   const action = nodeModal.action;
   if (!action) return [];
   return action.inputs || action.parameters || [];
});

const openNodeModal = (nodeId: string) => {
    if (!editor.value) return;
    const node = editor.value.getNodeFromId(nodeId);
    if (!node) return;
    
    // Refresh palette ensures we have latest action defs
    const actionId = node.data?.action?.id;
    // We assume the action inside node data is sufficient, or look it up from store
    // Use store palette lookup for fresh definition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
    const action = palette[actionId] || node.data.action;
    
    nodeModal.nodeId = nodeId;
    nodeModal.action = action;
    nodeModal.originalData = { ...(node.data.data || {}) };
    nodeModal.visible = true;
    
    // Reset form
    Object.keys(formValues).forEach(k => delete formValues[k]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeInputs.value.forEach((input: any) => {
        formValues[input.name] = nodeModal.originalData[input.name] ?? input.default ?? "";
    });
    
    rawJson.value = JSON.stringify(nodeModal.originalData, null, 2);
    useRawJson.value = false;
};

const closeNodeModal = () => nodeModal.visible = false;

const saveNodeConfig = () => {
    let finalData = { ...nodeModal.originalData };
    if (useRawJson.value) {
       try {
         finalData = JSON.parse(rawJson.value);
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
       } catch(e: any) {
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         (window as any).showInfoModal(t("workflow.jsonParseFailed", { error: e.message }), true);
         return;
       }
    } else {
       Object.assign(finalData, formValues);
    }
    
    if (editor.value) {
       const node = editor.value.getNodeFromId(nodeModal.nodeId);
       if (node && node.data) {
          // 使用 Drawflow API 正确更新节点数据，确保内部状态同步
          const updatedNodeData = { ...node.data, data: finalData };
          editor.value.updateNodeDataFromId(nodeModal.nodeId, updatedNodeData);
       }
    }
    closeNodeModal();
};

// Double Click handling
const handleNodeDblClick = (e: MouseEvent) => {
   const target = e.target as HTMLElement;
   const nodeEl = target.closest('.drawflow-node');
   if (nodeEl) {
      const id = nodeEl.id.replace('node-', '');
      openNodeModal(id);
   }
};

// Description Editing
const editDescription = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).showInputModal(
        t("workflow.legacy.descriptionEditTitle"),
        t("workflow.legacy.descriptionEditPrompt"),
        'textarea',
        t("workflow.legacy.descriptionEditPlaceholder"),
        (val: string) => { workflowDescription.value = val; },
        undefined,
        { defaultValue: workflowDescription.value, rows: 5 }
    );
};

// File Upload
const fileInput = ref<HTMLInputElement | null>(null);
const triggerUpload = () => fileInput.value?.click();
const handleFileUpload = async (e: Event) => {
   const files = (e.target as HTMLInputElement).files;
   if (!files || files.length === 0) return;
   
   const file = files[0];
   if (store.secureUploadEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).showInputModal(
          t("workflow.legacy.passwordRequired"),
          "Enter upload password",
          'password',
          '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pw: any) => uploadAction(file, pw)
      );
   } else {
      await uploadAction(file);
   }
   if (fileInput.value) fileInput.value.value = '';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleDeleteAction = (action: any) => {
    const confirmDelete = (pw?: string) => deleteAction(action.id, pw);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).showConfirmModal(
       t("workflow.legacy.deleteActionConfirmTitle"), 
       t("workflow.legacy.deleteActionConfirmMessage", { name: action.displayName }),
       () => {
          if (store.secureUploadEnabled) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).showInputModal(
                  t("workflow.legacy.passwordRequired"), 
                  "Enter delete password", 
                  'password', 
                  '', 
                  confirmDelete
              );
          } else {
              confirmDelete();
          }
       }
    );
};

// Lifecycle
onMounted(async () => {
   if (drawflowContainer.value) {
      await initEditor(drawflowContainer.value);
      
      // Bind DblClick
      if (editor.value) {
         editor.value.on('click', () => { /* maybe select logic */ });
         // Drawflow captures native events, so we might need to listen on container
         drawflowContainer.value.addEventListener('dblclick', handleNodeDblClick);
         
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
      
      // Expose for App.vue
      (window as any).tgButtonEditor = {
         saveCurrentWorkflow: saveWorkflow,
         refreshPalette: () => { /* auto-reactive now */ },
         refreshWorkflows: () => { /* auto-reactive */ },
         updateNodeConfig: (id: string, newData: any) => {
             if (editor.value) {
                const node = editor.value.getNodeFromId(id);
                if (node && node.data) {
                   const updatedNodeData = { ...node.data, data: newData };
                   editor.value.updateNodeDataFromId(id, updatedNodeData);
                }
             }
         }
      };
      
      // Restore collapsed state
      if (localStorage.getItem('workflow-palette-collapsed') === '1') {
         skipTransition.value = true;
         paletteCollapsed.value = true;
         setTimeout(() => skipTransition.value = false, 100);
      }
   }
});

onBeforeUnmount(() => {
   if (drawflowContainer.value) {
      drawflowContainer.value.removeEventListener('dblclick', handleNodeDblClick);
   }
   delete (window as any).tgButtonEditor;
});
</script>
