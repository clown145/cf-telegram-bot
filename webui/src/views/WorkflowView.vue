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
              <h3>暂无工作流</h3>
              <p>点击上方"新建"按钮创建您的第一个工作流</p>
              <n-button type="success" @click="createWorkflow">新建工作流</n-button>
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

         <div v-if="upstreamNodeOptions.length" style="margin-bottom: 12px;">
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
               <span class="muted" style="min-width: 84px;">上游字段</span>
               <n-select
                  v-model:value="upstreamPicker.nodeId"
                  :options="upstreamNodeOptions"
                  placeholder="选择上游节点（控制线上游）"
                  filterable
                  style="flex: 1; min-width: 240px;"
               />
               <n-input
                  v-model:value="upstreamPicker.subpath"
                  placeholder="可选子路径（补充），如 raw_event.message.text"
                  style="width: 320px;"
                  :disabled="!upstreamPicker.nodeId || !upstreamPicker.output"
               />
            </div>

            <div v-if="upstreamPicker.nodeId" style="display: flex; gap: 12px; align-items: stretch;">
               <div style="flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; max-height: 220px; overflow: auto;">
                  <n-tree
                     :data="upstreamTreeData"
                     :selected-keys="upstreamPicker.selectedKey ? [upstreamPicker.selectedKey] : []"
                     selectable
                     block-line
                     @update:selected-keys="onUpstreamTreeSelect"
                  />
               </div>
               <div style="width: 320px; display: flex; flex-direction: column; gap: 8px;">
                  <div class="muted" style="font-size: 12px;">
                     当前选择：<span v-if="upstreamPicker.output">{{ upstreamPicker.output }}{{ upstreamPicker.subpath ? '.' + upstreamPicker.subpath : '' }}</span><span v-else>未选择</span>
                  </div>
                  <n-input
                     type="textarea"
                     :value="upstreamPicker.nodeId && upstreamPicker.output ? buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath) : ''"
                     placeholder="选择左侧字段后自动生成表达式"
                     rows="3"
                     readonly
                  />
               </div>
            </div>
         </div>

         <n-collapse v-if="nodeModal.nodeId">
           <n-collapse-item title="隐藏数据线（在设置里连，不在画布显示）" name="hidden_edges">
              <div class="muted" style="font-size: 12px; margin-bottom: 8px;">
                只建议用于“直接传值”（无子路径）。有子路径时请用上面的引用表达式（nodes.*）。
              </div>

              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                <n-select
                  v-model:value="dataLinkTargetInput"
                  :options="dataLinkInputOptions"
                  placeholder="选择要接收的输入"
                  filterable
                  style="flex: 1; min-width: 220px;"
                />
                <n-button
                  size="small"
                  secondary
                  :disabled="!dataLinkTargetInput || !upstreamPicker.nodeId || !upstreamPicker.output"
                  @click="addHiddenDataEdge()"
                >
                  创建隐藏数据线
                </n-button>
              </div>

              <div v-if="hiddenDataEdges.length" style="display: flex; flex-direction: column; gap: 6px;">
                <div
                  v-for="edge in hiddenDataEdges"
                  :key="edge.id || `${edge.source_node}-${edge.source_output}-${edge.target_input}`"
                  style="display: flex; gap: 8px; align-items: center; justify-content: space-between; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px;"
                >
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <span class="muted">{{ edge.target_input }}</span>
                      <span class="muted"> ← </span>
                      <span>{{ getNodeLabel(edge.source_node) }}.{{ edge.source_output }}</span>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <n-button size="tiny" secondary @click="convertHiddenDataEdgeToRef(edge)">转为引用</n-button>
                    <n-button size="tiny" type="error" secondary @click="removeHiddenDataEdge(edge)">删除</n-button>
                  </div>
                </div>
              </div>
              <div v-else class="muted" style="font-size: 12px;">暂无隐藏数据线</div>
           </n-collapse-item>
         </n-collapse>
         
         <n-form label-placement="top">
            <template v-for="input in nodeInputs" :key="input.name">
               <n-form-item :label="getInputLabel(nodeModal.action, input)" :path="input.name">
                   <div style="display: flex; justify-content: flex-end; margin-bottom: 6px;">
                      <n-checkbox v-model:checked="refEnabled[input.name]" style="font-size: 12px;">
                         引用上游（nodes.*）
                      </n-checkbox>
                   </div>
                   <template v-if="input.type === 'boolean' || input.type === 'bool'">
                      <template v-if="refEnabled[input.name]">
                        <n-input type="textarea" v-model:value="formValues[input.name]" rows="2" />
                      </template>
                      <template v-else>
                        <n-switch v-model:value="formValues[input.name]" />
                      </template>
                   </template>
                   <template v-else-if="input.options && input.options.length">
                      <template v-if="refEnabled[input.name]">
                        <n-input type="textarea" v-model:value="formValues[input.name]" rows="2" />
                      </template>
                      <template v-else>
                        <n-select 
                           v-model:value="formValues[input.name]" 
                           :options="input.options.map((opt:any) => ({ label: opt.label || opt.value, value: opt.value }))"
                           filterable
                        />
                      </template>
                   </template>
                   <template v-else>
                      <n-input type="textarea" v-model:value="formValues[input.name]" rows="3" />
                   </template>
                   <div v-if="upstreamNodeOptions.length" style="margin-top: 6px; display: flex; justify-content: flex-end;">
                      <n-button
                        size="tiny"
                        secondary
                        :disabled="!upstreamPicker.nodeId || !upstreamPicker.output"
                        @click="setUpstreamRef(input.name)"
                      >
                        使用所选上游字段
                      </n-button>
                   </div>
                   <div v-if="refEnabled[input.name] && describeUpstreamRef(formValues[input.name])" class="muted" style="margin-top: 6px; font-size: 12px;">
                      {{ describeUpstreamRef(formValues[input.name]) }}
                   </div>
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
  NModal, NForm, NFormItem, NInput, NCheckbox, NSwitch, NSelect, NButton, NCollapse, NCollapseItem, NTree
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

const { buildNodeHtml, buildDefaultNodeData, getActionDisplayName, getInputLabel, getFlowOutputs } = useNodeUtils();

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
const refEnabled = reactive<Record<string, boolean>>({});
const rawJson = ref('');
const useRawJson = ref(false);
const upstreamPicker = reactive({
   nodeId: '',
   output: '',
   subpath: '',
   selectedKey: ''
});
const dataLinkTargetInput = ref<string>("");

const nodeInputs = computed(() => {
   const action = nodeModal.action;
   if (!action) return [];
   return action.inputs || action.parameters || [];
});

const CONTROL_INPUT_NAMES = new Set(["__control__", "control_input"]);
const isControlFlowOutputName = (name: string) => {
   const v = String(name || "").trim();
   return v === "next" || v === "true" || v === "false" || v === "try" || v === "catch";
};

const upstreamNodes = computed(() => {
   if (!currentWorkflowId.value) return [];
   const workflow = store.state.workflows?.[currentWorkflowId.value];
   if (!workflow || !workflow.nodes || !nodeModal.nodeId) return [];

   const reverse: Record<string, string[]> = {};
   (workflow.edges || []).forEach((edge: any) => {
      if (!edge || edge.target_node !== nodeModal.nodeId) return;
      if (!CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) return;
      const src = String(edge.source_node || "");
      if (!src) return;
      reverse[nodeModal.nodeId] = reverse[nodeModal.nodeId] || [];
      reverse[nodeModal.nodeId].push(src);
   });

   // Build full ancestor set (control edges only)
   const reverseAll: Record<string, string[]> = {};
   (workflow.edges || []).forEach((edge: any) => {
      if (!edge) return;
      if (!CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) return;
      const dst = String(edge.target_node || "");
      const src = String(edge.source_node || "");
      if (!dst || !src) return;
      reverseAll[dst] = reverseAll[dst] || [];
      reverseAll[dst].push(src);
   });

   const seen = new Set<string>();
   const queue: string[] = (reverseAll[nodeModal.nodeId] || []).slice();
   while (queue.length) {
      const id = queue.shift() as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      (reverseAll[id] || []).forEach((p) => {
         if (!seen.has(p)) queue.push(p);
      });
   }

   const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
   const result = Array.from(seen).map((id) => {
      const node = workflow.nodes?.[id];
      const actionId = node?.action_id || '';
      const action = palette[actionId];
      const name = getActionDisplayName(actionId, action) || actionId || id;
      return { id, label: `${name} (${id})`, actionId, action };
   });

   result.sort((a, b) => a.label.localeCompare(b.label));
   return result;
});

const upstreamNodeOptions = computed(() => upstreamNodes.value.map((n) => ({ label: n.label, value: n.id })));

const dataLinkInputOptions = computed(() => {
   const action = nodeModal.action;
   const inputs = nodeInputs.value as any[];
   return inputs
      .map((input) => ({ label: getInputLabel(action, input) || input.name, value: input.name }))
      .filter((opt) => opt.value && String(opt.value) !== "__control__");
});

const hiddenDataEdges = computed(() => {
   if (!currentWorkflowId.value || !nodeModal.nodeId) return [];
   const workflow = store.state.workflows?.[currentWorkflowId.value];
   const edges = (workflow?.edges || []) as any[];
   return edges.filter((e) => {
      if (!e) return false;
      if (e.target_node !== nodeModal.nodeId) return false;
      if (String(e.target_input || "") === "__control__") return false;
      if (isControlFlowOutputName(String(e.source_output || ""))) return false;
      return true;
   });
});

const getNodeLabel = (nodeId: string) => {
   if (!currentWorkflowId.value) return nodeId;
   const workflow = store.state.workflows?.[currentWorkflowId.value];
   const node = workflow?.nodes?.[nodeId];
   if (!node) return nodeId;
   const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
   const actionId = node?.action_id || "";
   const action = palette[actionId];
   const name = getActionDisplayName(actionId, action) || actionId || nodeId;
   return `${name} (${nodeId})`;
};

const removeHiddenDataEdge = (edge: any) => {
   if (!currentWorkflowId.value) return;
   const workflow = store.state.workflows?.[currentWorkflowId.value];
   if (!workflow?.edges) return;
   workflow.edges = (workflow.edges as any[]).filter((e) => e !== edge && e?.id !== edge?.id);
};

const convertHiddenDataEdgeToRef = (edge: any) => {
   const targetInput = String(edge?.target_input || "");
   const sourceNode = String(edge?.source_node || "");
   const sourceOutput = String(edge?.source_output || "");
   if (!targetInput || !sourceNode || !sourceOutput) return;
   if (targetInput in formValues) {
      refEnabled[targetInput] = true;
      formValues[targetInput] = buildUpstreamExpr(sourceNode, sourceOutput, "");
   }
   removeHiddenDataEdge(edge);
};

const addHiddenDataEdge = () => {
   if (!currentWorkflowId.value || !nodeModal.nodeId) return;
   if (!dataLinkTargetInput.value || !upstreamPicker.nodeId || !upstreamPicker.output) return;

   // If subpath is set, edge can't represent it; fall back to template reference.
   if (String(upstreamPicker.subpath || "").trim()) {
      refEnabled[dataLinkTargetInput.value] = true;
      formValues[dataLinkTargetInput.value] = buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath);
      (window as any).showInfoModal?.("已使用 nodes.* 引用（因为你选择了子路径）。");
      return;
   }

   const workflow = store.state.workflows?.[currentWorkflowId.value];
   if (!workflow) return;
   workflow.edges = Array.isArray(workflow.edges) ? workflow.edges : [];

   // Ensure single data edge per target input
   workflow.edges = (workflow.edges as any[]).filter((e) => {
      if (!e) return true;
      if (e.target_node !== nodeModal.nodeId) return true;
      if (String(e.target_input || "") !== dataLinkTargetInput.value) return true;
      if (String(e.target_input || "") === "__control__") return true;
      if (isControlFlowOutputName(String(e.source_output || ""))) return true;
      return false;
   });

   (workflow.edges as any[]).push({
      id: `edge-hidden-${upstreamPicker.nodeId}-${nodeModal.nodeId}-${dataLinkTargetInput.value}-${upstreamPicker.output}-${Date.now().toString(36)}`,
      source_node: upstreamPicker.nodeId,
      source_output: upstreamPicker.output,
      target_node: nodeModal.nodeId,
      target_input: dataLinkTargetInput.value
   });

   (window as any).showInfoModal?.("已创建隐藏数据线（直接传值）。");
};

const normalizeSubpath = (subpath: string) => {
   const trimmed = String(subpath || '').trim();
   if (!trimmed) return '';
   if (trimmed.startsWith('.') || trimmed.startsWith('[')) return trimmed;
   return `.${trimmed}`;
};

const buildUpstreamExpr = (nodeId: string, output: string, subpath: string) => {
   const suffix = normalizeSubpath(subpath);
   return `{{ nodes.${nodeId}.${output}${suffix} }}`;
};

const makeTreeKey = (output: string, subpath: string) => `${output}|${subpath || ''}`;
const parseTreeKey = (key: string) => {
   const idx = key.indexOf('|');
   if (idx < 0) return { output: key, subpath: '' };
   return { output: key.slice(0, idx), subpath: key.slice(idx + 1) };
};

const upstreamTreeData = computed(() => {
   const selected = upstreamNodes.value.find((n) => n.id === upstreamPicker.nodeId);
   const outputs = ((selected?.action?.outputs || []) as Array<{ name?: string }>) || [];
   const outputNames = outputs.map((o) => String(o?.name || '').trim()).filter(Boolean);
   const names = outputNames.length ? outputNames : ['event'];

   return names.map((name) => {
      if (name !== 'event') {
         return { label: name, key: makeTreeKey(name, '') };
      }

      const children = [
         { label: 'type', key: makeTreeKey('event', 'type') },
         { label: 'node_id', key: makeTreeKey('event', 'node_id') },
         { label: 'workflow_id', key: makeTreeKey('event', 'workflow_id') },
         { label: 'timestamp', key: makeTreeKey('event', 'timestamp') },
         {
            label: 'raw_event',
            key: makeTreeKey('event', 'raw_event'),
            children: [
               { label: 'message', key: makeTreeKey('event', 'raw_event.message') },
               { label: 'callback_query', key: makeTreeKey('event', 'raw_event.callback_query') },
               { label: 'chat', key: makeTreeKey('event', 'raw_event.chat') },
               { label: 'from', key: makeTreeKey('event', 'raw_event.from') },
               { label: 'data', key: makeTreeKey('event', 'raw_event.data') },
            ],
         },
      ];

      return { label: name, key: makeTreeKey(name, ''), children };
   });
});

const onUpstreamTreeSelect = (keys: Array<string | number>) => {
   const key = keys && keys.length ? String(keys[0]) : '';
   upstreamPicker.selectedKey = key;
   if (!key) {
      upstreamPicker.output = '';
      upstreamPicker.subpath = '';
      return;
   }
   const parsed = parseTreeKey(key);
   upstreamPicker.output = parsed.output;
   upstreamPicker.subpath = parsed.subpath;
};

watch(
   () => upstreamPicker.nodeId,
   () => {
      upstreamPicker.output = '';
      upstreamPicker.subpath = '';
      upstreamPicker.selectedKey = '';
   }
);

const setUpstreamRef = (inputName: string) => {
   if (!upstreamPicker.nodeId || !upstreamPicker.output) return;
   refEnabled[inputName] = true;
   formValues[inputName] = buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath);
};

const describeUpstreamRef = (value: unknown) => {
   const str = typeof value === 'string' ? value : '';
   if (!str) return '';
   const matches = str.match(/\{\{\s*nodes\.[^}]+\}\}/g) || [];
   if (!matches.length) return '';
   const firstMatch = matches[0];
   if (!firstMatch) return '';
   const first = firstMatch.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
   if (matches.length === 1) return `引用：${first}`;
   return `引用：${first}（共 ${matches.length} 处）`;
};

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
    Object.keys(refEnabled).forEach(k => delete refEnabled[k]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeInputs.value.forEach((input: any) => {
        formValues[input.name] = nodeModal.originalData[input.name] ?? input.default ?? "";
        const v = formValues[input.name];
        refEnabled[input.name] = typeof v === "string" && v.includes("{{") && v.includes("nodes.");
    });
    
    rawJson.value = JSON.stringify(nodeModal.originalData, null, 2);
    useRawJson.value = false;

    upstreamPicker.nodeId = '';
    upstreamPicker.output = '';
    upstreamPicker.subpath = '';
    upstreamPicker.selectedKey = '';
    dataLinkTargetInput.value = '';
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
