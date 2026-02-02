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

         <n-tabs v-model:value="nodeModalTab" type="line" animated>
            <n-tab-pane name="params" tab="参数">
               <n-form label-placement="top">
                  <template v-for="input in nodeInputs" :key="input.name">
                     <n-form-item :label="getInputLabel(nodeModal.action, input)" :path="input.name">
                        <div style="display: flex; justify-content: flex-end; margin-bottom: 6px;">
                           <n-radio-group
                              :value="inputMode[input.name]"
                              size="small"
                              @update:value="(val) => setInputMode(input, val)"
                           >
                              <n-radio-button value="literal">值</n-radio-button>
                              <n-radio-button value="wire">连线</n-radio-button>
                              <n-radio-button value="ref">引用</n-radio-button>
                           </n-radio-group>
                        </div>

                        <template v-if="inputMode[input.name] === 'wire'">
                           <div class="muted" style="font-size: 12px; margin-bottom: 8px;">
                              <template v-if="getHiddenEdgeByInput(input.name)">
                                 当前：{{ input.name }} ← {{ getNodeLabel(getHiddenEdgeByInput(input.name).source_node) }}.{{ getHiddenEdgeByInput(input.name).source_output }}<span v-if="getHiddenEdgeByInput(input.name).source_path">.{{ getHiddenEdgeByInput(input.name).source_path }}</span>
                              </template>
                              <template v-else>
                                 当前：未连接（点击“连接上游”）
                              </template>
                           </div>
                           <n-space justify="end" size="small">
                              <n-button size="tiny" secondary :disabled="!upstreamNodeOptions.length" @click="openUpstreamSelector(input.name, 'wire')">
                                 连接上游
                              </n-button>
                              <n-button size="tiny" secondary :disabled="!getHiddenEdgeByInput(input.name)" @click="convertHiddenDataEdgeToRefByInput(input.name)">
                                 转为引用
                              </n-button>
                              <n-button size="tiny" type="error" secondary :disabled="!getHiddenEdgeByInput(input.name)" @click="removeHiddenDataEdgeByInput(input.name)">
                                 断开
                              </n-button>
                           </n-space>
                        </template>

                        <template v-else-if="inputMode[input.name] === 'ref'">
                           <n-input type="textarea" v-model:value="formValues[input.name]" :rows="input.type === 'boolean' || input.type === 'bool' ? 2 : 3" />
                           <n-space justify="end" size="small" style="margin-top: 6px;">
                              <n-button size="tiny" secondary :disabled="!upstreamNodeOptions.length" @click="openUpstreamSelector(input.name, 'ref')">
                                 选择上游字段
                              </n-button>
                           </n-space>
                           <div v-if="describeUpstreamRef(formValues[input.name])" class="muted" style="margin-top: 6px; font-size: 12px;">
                              {{ describeUpstreamRef(formValues[input.name]) }}
                           </div>
                        </template>

                        <template v-else>
                           <template v-if="input.type === 'boolean' || input.type === 'bool'">
                              <n-switch v-model:value="formValues[input.name]" />
                           </template>
                           <template v-else-if="(input.type === 'integer' || input.type === 'number')">
                              <n-input-number v-model:value="formValues[input.name]" style="width: 100%;" />
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
                        </template>

                        <template #feedback v-if="input.description">
                           {{ input.description }}
                        </template>
                     </n-form-item>
                  </template>
               </n-form>
            </n-tab-pane>

            <n-tab-pane name="links" tab="接线板">
               <div class="muted" style="font-size: 12px; margin-bottom: 12px;">
                  左侧是控制线上游节点的输出，右侧是当前节点的输入。先点左侧选择“源”，再点右侧输入即可连线（支持子路径）。
               </div>

               <div
                 ref="wireBoardRef"
                 style="position: relative; display: flex; gap: 12px; height: 420px;"
               >
                  <div style="flex: 1; min-width: 0; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; overflow: auto;">
                     <div class="muted" style="font-size: 12px; margin-bottom: 8px;">上游输出</div>
                     <div v-if="upstreamNodes.length">
                        <div v-for="n in upstreamNodes" :key="n.id" style="margin-bottom: 10px;">
                           <div class="muted" style="font-size: 12px; margin-bottom: 6px;">{{ n.label }}</div>
                           <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                              <div
                                v-for="out in getUpstreamDataOutputs(n)"
                                :key="`${n.id}:${out}`"
                                :ref="(el) => registerWirePortEl(makeWireSrcKey(n.id, out), el as any)"
                                @click="selectWireSource(n.id, out)"
                                :style="{
                                   display: 'inline-flex',
                                   alignItems: 'center',
                                   gap: '6px',
                                   padding: '4px 8px',
                                   borderRadius: '999px',
                                   cursor: 'pointer',
                                   border: wireActiveSource.nodeId === n.id && wireActiveSource.output === out ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                                   background: wireActiveSource.nodeId === n.id && wireActiveSource.output === out ? 'rgba(24, 160, 88, 0.12)' : 'transparent'
                                }"
                              >
                                 <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--primary-color); display: inline-block;" />
                                 <span style="font-size: 12px;">{{ out }}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div v-else class="muted" style="font-size: 12px;">没有控制线上游节点</div>

                     <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
                        <div class="muted" style="font-size: 12px; margin-bottom: 6px;">
                           当前源：
                           <span v-if="wireActiveSource.nodeId && wireActiveSource.output">{{ getNodeLabel(wireActiveSource.nodeId) }}.{{ wireActiveSource.output }}</span>
                           <span v-else>未选择</span>
                        </div>
                        <n-input
                          v-model:value="wireActiveSource.source_path"
                          size="small"
                          placeholder="可选子路径，如 raw_event.message.text"
                          :disabled="!wireActiveSource.nodeId || !wireActiveSource.output"
                        />
                        <div v-if="wireActiveSource.output === 'event'" style="margin-top: 8px; max-height: 160px; overflow: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px;">
                           <n-tree
                             :data="wireEventTreeData"
                             :selected-keys="wireActiveSource.source_path ? [wireActiveSource.source_path] : []"
                             selectable
                             block-line
                             @update:selected-keys="onWireEventTreeSelect"
                           />
                        </div>
                        <n-space justify="end" size="small" style="margin-top: 8px;">
                           <n-button size="tiny" secondary @click="clearWireSource">清除选择</n-button>
                        </n-space>
                     </div>
                  </div>

                  <div style="flex: 1; min-width: 0; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; overflow: auto;">
                     <div class="muted" style="font-size: 12px; margin-bottom: 8px;">当前节点输入（点击连接）</div>
                     <div v-for="input in nodeInputs" :key="input.name" style="margin-bottom: 8px;">
                        <div
                          :ref="(el) => registerWirePortEl(makeWireInKey(input.name), el as any)"
                          @click="connectWireToInput(input)"
                          :style="{
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'space-between',
                             gap: '10px',
                             padding: '8px 10px',
                             borderRadius: '8px',
                             cursor: upstreamNodes.length ? 'pointer' : 'not-allowed',
                             border: getHiddenEdgeByInput(input.name) ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                             opacity: upstreamNodes.length ? 1 : 0.6
                          }"
                        >
                           <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                              <span style="width: 10px; height: 10px; border-radius: 50%; background: var(--primary-color); display: inline-block;" />
                              <div style="min-width: 0;">
                                 <div style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    {{ getInputLabel(nodeModal.action, input) }} ({{ input.name }})
                                 </div>
                                 <div v-if="getHiddenEdgeByInput(input.name)" class="muted" style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ← {{ getNodeLabel(getHiddenEdgeByInput(input.name).source_node) }}.{{ getHiddenEdgeByInput(input.name).source_output }}<span v-if="getHiddenEdgeByInput(input.name).source_path">.{{ getHiddenEdgeByInput(input.name).source_path }}</span>
                                 </div>
                                 <div v-else class="muted" style="font-size: 12px;">未连接</div>
                              </div>
                           </div>
                           <n-space size="small">
                              <n-button size="tiny" secondary :disabled="!getHiddenEdgeByInput(input.name)" @click.stop="removeHiddenDataEdgeByInput(input.name)">断开</n-button>
                              <n-button size="tiny" secondary :disabled="!getHiddenEdgeByInput(input.name)" @click.stop="convertHiddenDataEdgeToRefByInput(input.name)">转为引用</n-button>
                           </n-space>
                        </div>
                     </div>
                  </div>

                  <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
                     <path
                       v-for="line in wireLines"
                       :key="line.id"
                       :d="line.d"
                       fill="none"
                       stroke="var(--primary-color)"
                       stroke-width="2"
                       opacity="0.55"
                     />
                  </svg>
               </div>

               <div style="margin-top: 12px;">
                  <n-data-table
                     :columns="hiddenEdgesColumns"
                     :data="hiddenDataEdges"
                     :bordered="false"
                     :single-line="false"
                     :pagination="false"
                  />
               </div>
            </n-tab-pane>

            <n-tab-pane name="advanced" tab="高级">
               <n-input type="textarea" v-model:value="rawJson" rows="8" />
               <n-checkbox v-model:checked="useRawJson" style="margin-top: 8px;">
                  {{ t("workflow.useRawJson") }}
               </n-checkbox>
            </n-tab-pane>
         </n-tabs>
      </div>
      <div v-else class="muted">{{ t("workflow.nodeMissing") }}</div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
           <n-button @click="closeNodeModal">{{ t("common.cancel") }}</n-button>
           <n-button type="primary" @click="saveNodeConfig">{{ t("common.ok") }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Upstream Selector Modal -->
    <n-modal
      v-model:show="upstreamModal.visible"
      preset="card"
      title="选择上游字段"
      style="width: 760px; max-width: 95vw;"
      @close="closeUpstreamSelector"
    >
      <div v-if="upstreamNodeOptions.length">
         <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <span class="muted" style="min-width: 84px;">上游节点</span>
            <n-select
               v-model:value="upstreamPicker.nodeId"
               :options="upstreamNodeOptions"
               placeholder="选择上游节点（控制线上游）"
               filterable
               style="flex: 1; min-width: 260px;"
            />
            <n-input
               v-model:value="upstreamPicker.subpath"
               placeholder="可选子路径（补充），如 raw_event.message.text"
               style="width: 340px;"
               :disabled="!upstreamPicker.nodeId || !upstreamPicker.output"
            />
         </div>

         <div v-if="upstreamPicker.nodeId" style="display: flex; gap: 12px; align-items: stretch;">
            <div style="flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; max-height: 320px; overflow: auto;">
               <n-tree
                  :data="upstreamTreeData"
                  :selected-keys="upstreamPicker.selectedKey ? [upstreamPicker.selectedKey] : []"
                  selectable
                  block-line
                  @update:selected-keys="onUpstreamTreeSelect"
               />
            </div>
            <div style="width: 340px; display: flex; flex-direction: column; gap: 8px;">
               <div class="muted" style="font-size: 12px;">
                  当前选择：<span v-if="upstreamPicker.output">{{ upstreamPicker.output }}{{ upstreamPicker.subpath ? '.' + upstreamPicker.subpath : '' }}</span><span v-else>未选择</span>
               </div>
               <n-input
                  type="textarea"
                  :value="upstreamPicker.nodeId && upstreamPicker.output ? buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath) : ''"
                  placeholder="选择左侧字段后自动生成表达式"
                  rows="4"
                  readonly
               />
               <div v-if="upstreamModal.applyAs === 'wire' && upstreamPicker.subpath" class="muted" style="font-size: 12px;">
                  已选择子路径：会自动改用“引用”（因为数据线不支持子路径）。
               </div>
            </div>
         </div>
      </div>
      <div v-else class="muted" style="font-size: 12px;">没有控制线上游节点，无法引用/连线。</div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
           <n-button @click="closeUpstreamSelector">{{ t("common.cancel") }}</n-button>
           <n-button type="primary" :disabled="!upstreamPicker.nodeId || !upstreamPicker.output" @click="applyUpstreamSelection">
              {{ upstreamModal.applyAs === 'wire' ? '应用为连线' : '应用为引用' }}
           </n-button>
        </div>
      </template>
    </n-modal>
  </main>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch, h } from 'vue';
import { 
  NModal,
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NCheckbox,
  NSwitch,
  NSelect,
  NButton,
  NRadioGroup,
  NRadioButton,
  NTree,
  NDataTable,
  NSpace
} from 'naive-ui';
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
const { searchTerm: paletteSearchTerm, paletteNodes, uploadAction, deleteAction } = useNodePalette(store);
const { 
  currentWorkflowId, workflowName, workflowDescription, 
  loadWorkflowIntoEditor, createWorkflow, saveWorkflow, deleteWorkflow 
} = useWorkflowManager(store, editor);

const { buildNodeHtml, buildDefaultNodeData, getActionDisplayName, getInputLabel, getFlowOutputs } = useNodeUtils();
const { convertToCustomFormat } = useWorkflowConverter();

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
type InputMode = "literal" | "ref" | "wire";
const inputMode = reactive<Record<string, InputMode>>({});
const nodeModalTab = ref<"params" | "links" | "advanced">("params");
const rawJson = ref('');
const useRawJson = ref(false);
const upstreamPicker = reactive({
   nodeId: '',
   output: '',
   subpath: '',
   selectedKey: ''
});
const upstreamModal = reactive({
   visible: false,
   targetInput: "",
   applyAs: "ref" as "ref" | "wire",
});
const linkEditor = reactive({
   targetInput: "",
});

const wireBoardRef = ref<HTMLElement | null>(null);
const wireLines = ref<Array<{ id: string; d: string }>>([]);
const wireActiveSource = reactive({
   nodeId: "",
   output: "",
   source_path: "",
});
const wirePortElements = new Map<string, HTMLElement>();

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

const getStoredWorkflowCustom = () => {
   if (!currentWorkflowId.value) return null;
   // store typings may not include legacy `.data` wrapper
   const wf: any = (store.state.workflows as any)?.[currentWorkflowId.value];
   if (!wf) return null;
   if (wf.nodes && wf.edges) return wf;
   if (wf.data && typeof wf.data === "object" && (wf.data as any).nodes) return wf.data;
   if (typeof wf.data === "string") {
      try {
         const parsed = JSON.parse(wf.data);
         if (parsed && parsed.nodes) return parsed;
      } catch {
         return null;
      }
   }
   return null;
};

const currentWorkflowSnapshot = computed(() => {
   const stored = getStoredWorkflowCustom();
   const storedEdges = Array.isArray(stored?.edges) ? (stored?.edges as any[]) : [];
   const hiddenEdges = storedEdges.filter((e) => {
      if (!e) return false;
      if (String(e.target_input || "") === "__control__") return false;
      if (isControlFlowOutputName(String(e.source_output || ""))) return false;
      return true;
   });

   if (!editor.value) {
      return stored || { nodes: {}, edges: hiddenEdges };
   }

   try {
      const exported = editor.value.export();
      const custom = convertToCustomFormat(exported);
      custom.edges = [...(custom.edges || []), ...hiddenEdges];
      return custom;
   } catch {
      return stored || { nodes: {}, edges: hiddenEdges };
   }
});

const upstreamNodes = computed(() => {
   if (!currentWorkflowId.value) return [];
   const workflow = currentWorkflowSnapshot.value as any;
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
      .map((input) => {
         const base = getInputLabel(action, input) || input.name;
         return { label: `${base} (${input.name})`, value: input.name };
      })
      .filter((opt) => opt.value && String(opt.value) !== "__control__");
});

const hiddenDataEdges = computed(() => {
   if (!currentWorkflowId.value || !nodeModal.nodeId) return [];
   const workflow = getStoredWorkflowCustom();
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
   const workflow = currentWorkflowSnapshot.value as any;
   const node = workflow?.nodes?.[nodeId];
   if (!node) return nodeId;
   const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
   const actionId = node?.action_id || "";
   const action = palette[actionId];
   const name = getActionDisplayName(actionId, action) || actionId || nodeId;
   return `${name} (${nodeId})`;
};

const getHiddenEdgeByInput = (inputName: string) => {
   const edges = hiddenDataEdges.value;
   return edges.find((e: any) => String(e?.target_input || "") === inputName) || null;
};

const makeWireSrcKey = (nodeId: string, output: string) => `src:${nodeId}:${output}`;
const makeWireInKey = (inputName: string) => `in:${inputName}`;

const registerWirePortEl = (key: string, el: HTMLElement | null) => {
   if (el) {
      wirePortElements.set(key, el);
   } else {
      wirePortElements.delete(key);
   }
};

const recalcWireOverlay = () => {
   const container = wireBoardRef.value;
   if (!container) {
      wireLines.value = [];
      return;
   }
   const cRect = container.getBoundingClientRect();
   const lines: Array<{ id: string; d: string }> = [];
   for (const edge of hiddenDataEdges.value as any[]) {
      const srcKey = makeWireSrcKey(String(edge?.source_node || ""), String(edge?.source_output || ""));
      const inKey = makeWireInKey(String(edge?.target_input || ""));
      const srcEl = wirePortElements.get(srcKey);
      const inEl = wirePortElements.get(inKey);
      if (!srcEl || !inEl) continue;
      const s = srcEl.getBoundingClientRect();
      const t = inEl.getBoundingClientRect();
      const sx = s.left + s.width / 2 - cRect.left;
      const sy = s.top + s.height / 2 - cRect.top;
      const tx = t.left + t.width / 2 - cRect.left;
      const ty = t.top + t.height / 2 - cRect.top;
      const cp = Math.max(60, Math.min(160, Math.abs(tx - sx) / 2));
      const d = `M ${sx} ${sy} C ${sx + cp} ${sy} ${tx - cp} ${ty} ${tx} ${ty}`;
      const id = String(edge?.id || `${srcKey}->${inKey}`);
      lines.push({ id, d });
   }
   wireLines.value = lines;
};

const handleWireResize = () => recalcWireOverlay();

watch(
   () => [nodeModal.visible, nodeModalTab.value, hiddenDataEdges.value.length, upstreamNodes.value.length],
   () => nextTick(recalcWireOverlay)
);

const getUpstreamDataOutputs = (n: any): string[] => {
   const outputs = (n?.action?.outputs || []) as any[];
   const dataOutputs = outputs
      .filter((o) => o && String(o.type || "").toLowerCase() !== "flow")
      .map((o) => String(o.name || "").trim())
      .filter(Boolean);
   return dataOutputs;
};

const selectWireSource = (nodeId: string, output: string) => {
   const changed = wireActiveSource.nodeId !== nodeId || wireActiveSource.output !== output;
   wireActiveSource.nodeId = nodeId;
   wireActiveSource.output = output;
   if (changed) {
      wireActiveSource.source_path = "";
   }
};

const clearWireSource = () => {
   wireActiveSource.nodeId = "";
   wireActiveSource.output = "";
   wireActiveSource.source_path = "";
};

const connectWireToInput = (input: any) => {
   const inputName = String(input?.name || "");
   if (!inputName) return;
   if (!upstreamNodes.value.length) return;
   if (!wireActiveSource.nodeId || !wireActiveSource.output) {
      (window as any).showInfoModal?.("请先在左侧选择一个上游输出。");
      return;
   }
   inputMode[inputName] = "wire";
   addHiddenDataEdgeForInput(inputName, wireActiveSource.nodeId, wireActiveSource.output, wireActiveSource.source_path);
   nextTick(recalcWireOverlay);
};

const wireEventTreeData = computed(() => {
   return [
      {
         label: "event",
         key: "",
         children: [
            { label: "type", key: "type" },
            { label: "node_id", key: "node_id" },
            { label: "workflow_id", key: "workflow_id" },
            { label: "timestamp", key: "timestamp" },
            {
               label: "raw_event",
               key: "raw_event",
               children: [
                  { label: "message", key: "raw_event.message" },
                  { label: "callback_query", key: "raw_event.callback_query" },
                  { label: "chat", key: "raw_event.chat" },
                  { label: "from", key: "raw_event.from" },
                  { label: "data", key: "raw_event.data" },
               ],
            },
         ],
      },
   ];
});

const onWireEventTreeSelect = (keys: Array<string | number>) => {
   const key = keys && keys.length ? String(keys[0]) : "";
   wireActiveSource.source_path = key;
};

const removeHiddenDataEdge = (edge: any) => {
   const wf = getStoredWorkflowCustom();
   if (!wf?.edges) return;
   wf.edges = (wf.edges as any[]).filter((e) => e !== edge && e?.id !== edge?.id);
};

const removeHiddenDataEdgeByInput = (inputName: string) => {
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) return;
   removeHiddenDataEdge(edge);
};

const convertHiddenDataEdgeToRef = (edge: any) => {
   const targetInput = String(edge?.target_input || "");
   const sourceNode = String(edge?.source_node || "");
   const sourceOutput = String(edge?.source_output || "");
   const sourcePath = String(edge?.source_path || "");
   if (!targetInput || !sourceNode || !sourceOutput) return;
   if (targetInput in formValues) {
      inputMode[targetInput] = "ref";
      formValues[targetInput] = buildUpstreamExpr(sourceNode, sourceOutput, sourcePath);
   }
   removeHiddenDataEdge(edge);
};

const convertHiddenDataEdgeToRefByInput = (inputName: string) => {
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) return;
   convertHiddenDataEdgeToRef(edge);
};

const addHiddenDataEdgeForInput = (targetInput: string, sourceNode: string, sourceOutput: string, sourcePath?: string) => {
   const wf = getStoredWorkflowCustom();
   if (!wf || !nodeModal.nodeId) return;
   wf.edges = Array.isArray(wf.edges) ? wf.edges : [];

   wf.edges = (wf.edges as any[]).filter((e) => {
      if (!e) return true;
      if (e.target_node !== nodeModal.nodeId) return true;
      if (String(e.target_input || "") !== targetInput) return true;
      if (String(e.target_input || "") === "__control__") return true;
      if (isControlFlowOutputName(String(e.source_output || ""))) return true;
      return false;
   });

   (wf.edges as any[]).push({
      id: `edge-hidden-${sourceNode}-${nodeModal.nodeId}-${targetInput}-${sourceOutput}-${Date.now().toString(36)}`,
      source_node: sourceNode,
      source_output: sourceOutput,
      source_path: String(sourcePath || "").trim() || undefined,
      target_node: nodeModal.nodeId,
      target_input: targetInput,
   });
};

const hiddenEdgesColumns = computed(() => {
   return [
      {
         title: "输入",
         key: "target_input",
         render: (row: any) => h("span", String(row?.target_input || "")),
      },
      {
         title: "来源",
         key: "source",
         render: (row: any) =>
            h(
               "span",
               `${getNodeLabel(String(row?.source_node || ""))}.${String(row?.source_output || "")}${row?.source_path ? "." + String(row.source_path) : ""}`
            ),
      },
      {
         title: "操作",
         key: "actions",
         render: (row: any) =>
            h(
               NSpace,
               { size: "small", justify: "end" } as any,
               {
                  default: () => [
                     h(
                        NButton,
                        {
                           size: "tiny",
                           secondary: true,
                           onClick: () => convertHiddenDataEdgeToRef(row),
                        } as any,
                        { default: () => "转为引用" }
                     ),
                     h(
                        NButton,
                        {
                           size: "tiny",
                           secondary: true,
                           type: "error",
                           onClick: () => removeHiddenDataEdge(row),
                        } as any,
                        { default: () => "删除" }
                     ),
                  ],
               }
            ),
      },
   ];
});

const openUpstreamSelector = (targetInput: string, applyAs: "ref" | "wire") => {
   upstreamModal.targetInput = targetInput;
   upstreamModal.applyAs = applyAs;
   upstreamModal.visible = true;

   if (!upstreamPicker.nodeId) {
      upstreamPicker.nodeId = upstreamNodes.value[0]?.id || "";
   }
   upstreamPicker.output = "";
   upstreamPicker.subpath = "";
   upstreamPicker.selectedKey = "";
};

const closeUpstreamSelector = () => {
   upstreamModal.visible = false;
   upstreamModal.targetInput = "";
};

const applyUpstreamSelection = () => {
   const targetInput = upstreamModal.targetInput;
   if (!targetInput) return;
   if (!upstreamPicker.nodeId || !upstreamPicker.output) return;

   if (upstreamModal.applyAs === "wire") {
      inputMode[targetInput] = "wire";
      addHiddenDataEdgeForInput(targetInput, upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath);
      closeUpstreamSelector();
      return;
   }

   inputMode[targetInput] = "ref";
   formValues[targetInput] = buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath);
   removeHiddenDataEdgeByInput(targetInput);
   closeUpstreamSelector();
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

const setInputMode = (input: any, mode: InputMode) => {
   const name = String(input?.name || "");
   if (!name) return;

   inputMode[name] = mode;

   if (mode !== "wire") {
      removeHiddenDataEdgeByInput(name);
   }

   if (mode === "wire") {
      if (!getHiddenEdgeByInput(name) && upstreamNodeOptions.value.length) {
         openUpstreamSelector(name, "wire");
      }
      return;
   }

   if (mode === "ref") {
      if (typeof formValues[name] !== "string") {
         formValues[name] = "";
      }
      return;
   }

   // literal mode coercion
   const type = String(input?.type || "");
   if (type === "boolean" || type === "bool") {
      if (typeof formValues[name] !== "boolean") {
         formValues[name] = Boolean(input?.default ?? false);
      }
      return;
   }
   if (type === "integer" || type === "number") {
      const n = typeof formValues[name] === "number" ? formValues[name] : Number(formValues[name]);
      formValues[name] = Number.isFinite(n) ? n : (input?.default ?? null);
      return;
   }
   if (Array.isArray(input?.options) && input.options.length) {
      const values = input.options.map((o: any) => String(o?.value ?? ""));
      const current = String(formValues[name] ?? "");
      if (!values.includes(current)) {
         formValues[name] = input?.default ?? values[0] ?? "";
      }
   }
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
    nodeModalTab.value = "params";
    
    // Reset form
    Object.keys(formValues).forEach(k => delete formValues[k]);
    Object.keys(inputMode).forEach(k => delete inputMode[k]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeInputs.value.forEach((input: any) => {
        formValues[input.name] = nodeModal.originalData[input.name] ?? input.default ?? "";
    });
    // init mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeInputs.value.forEach((input: any) => {
       const name = String(input?.name || "");
       if (!name) return;
       const edge = getHiddenEdgeByInput(name);
       if (edge) {
          inputMode[name] = "wire";
          return;
       }
       const v = formValues[name];
       inputMode[name] = typeof v === "string" && v.includes("{{") && v.includes("nodes.") ? "ref" : "literal";
    });
    
    rawJson.value = JSON.stringify(nodeModal.originalData, null, 2);
    useRawJson.value = false;

    upstreamPicker.nodeId = '';
    upstreamPicker.output = '';
    upstreamPicker.subpath = '';
    upstreamPicker.selectedKey = '';
    linkEditor.targetInput = dataLinkInputOptions.value[0]?.value || "";
    closeUpstreamSelector();
};

const closeNodeModal = () => {
   nodeModal.visible = false;
   closeUpstreamSelector();
};

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
    window.addEventListener("resize", handleWireResize);
});

onBeforeUnmount(() => {
   window.removeEventListener("resize", handleWireResize);
   if (drawflowContainer.value) {
      drawflowContainer.value.removeEventListener('dblclick', handleNodeDblClick);
   }
   delete (window as any).tgButtonEditor;
});
</script>
