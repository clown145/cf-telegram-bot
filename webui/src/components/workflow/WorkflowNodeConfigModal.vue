<template>
  <div class="workflow-node-config-modal-root">
    <!-- Node Configuration Modal -->
    <n-modal
       v-model:show="nodeModal.visible"
       preset="card"
       :title="t('workflow.nodeEdit')"
       style="width: 980px; max-width: 96vw;"
       @close="closeNodeModal"
      >
      <div v-if="nodeModal.action">
         <p class="muted node-modal-action-title">{{ getActionDisplayName(nodeModal.action.id, nodeModal.action) }}</p>

            <n-tabs v-model:value="nodeModalTab" type="segment" size="small" animated>
               <n-tab-pane name="params" :tab="t('workflow.nodeModal.tabs.params')">
                 <div class="node-params-layout">
                    <n-card size="small" :bordered="false" class="node-params-sidebar">
                       <n-input
                         v-model:value="paramsSearchTerm"
                         size="small"
                         :placeholder="t('workflow.nodeModal.paramsPanel.searchPlaceholder')"
                       />
                        <n-scrollbar
                          class="node-params-sidebar-scroll"
                          :content-style="{ paddingRight: '16px', paddingBottom: '4px' }"
                        >
                          <div v-if="!filteredParamInputs.length" class="muted node-params-empty">
                             {{
                               wireableNodeInputs.length
                                 ? t("workflow.nodeModal.paramsPanel.emptyFiltered")
                                 : t("workflow.nodeModal.paramsPanel.empty")
                             }}
                          </div>
 
                           <n-button
                             v-for="input in filteredParamInputs"
                             :key="input.name"
                             quaternary
                             size="small"
                             block
                             class="node-params-item"
                             :class="{ 'is-active': paramsActiveInputName === input.name }"
                             @click="selectParamInput(String(input.name))"
                           >
                              <div class="node-params-item-inner">
                                <div class="node-params-item-top">
                                   <span class="node-params-item-label" :title="getInputLabel(nodeModal.action, input)">
                                     {{ getInputLabel(nodeModal.action, input) }}
                                   </span>
                                   <n-tag
                                     round
                                     size="small"
                                     :bordered="false"
                                     :type="inputMode[input.name] === 'ref' ? 'info' : 'default'"
                                   >
                                     {{ t(`workflow.nodeModal.modes.${inputMode[input.name] || "literal"}`) }}
                                   </n-tag>
                                </div>
                                <div class="node-params-item-sub">
                                  <span class="muted node-params-item-name">{{ input.name }}</span>
                                   <span v-if="inputMode[input.name] === 'ref'" class="muted node-params-item-preview">
                                     {{ describeUpstreamRef(formValues[input.name]) }}
                                   </span>
                                </div>
                              </div>
                           </n-button>
                        </n-scrollbar>
                     </n-card>
 
                    <n-card size="small" :bordered="false" class="node-params-editor">
                       <template v-if="activeParamInput">
                          <div class="node-params-editor-header">
                             <div class="node-params-editor-title">
                                <div class="node-params-editor-label">
                                  {{ getInputLabel(nodeModal.action, activeParamInput) }}
                                </div>
                                <div class="muted node-params-editor-name">{{ activeParamInput.name }}</div>
                             </div>
 
                             <n-radio-group
                               :value="inputMode[activeParamInput.name]"
                               size="small"
                               @update:value="(val) => setInputMode(activeParamInput, val)"
                             >
                                <n-radio-button value="literal">{{ t("workflow.nodeModal.modes.literal") }}</n-radio-button>
                                <n-radio-button value="ref">{{ t("workflow.nodeModal.modes.ref") }}</n-radio-button>
                             </n-radio-group>
                          </div>
 
                          <n-scrollbar
                            class="node-params-editor-scroll"
                            :content-style="{ paddingRight: '16px', paddingBottom: '8px' }"
                          >
                             <div class="node-params-editor-body">
                                <template v-if="inputMode[activeParamInput.name] === 'ref'">
                                   <n-input
                                     type="textarea"
                                     v-model:value="formValues[activeParamInput.name]"
                                     :rows="activeParamInput.type === 'boolean' || activeParamInput.type === 'bool' ? 2 : 4"
                                   />
                                   <div v-if="describeUpstreamRef(formValues[activeParamInput.name])" class="muted ref-preview-hint">
                                      {{ describeUpstreamRef(formValues[activeParamInput.name]) }}
                                   </div>
                                </template>
 
                                <template v-else>
                                   <template v-if="activeParamInput.type === 'boolean' || activeParamInput.type === 'bool'">
                                      <n-switch v-model:value="formValues[activeParamInput.name]" />
                                   </template>
                                   <template v-else-if="(activeParamInput.type === 'integer' || activeParamInput.type === 'number')">
                                      <n-input-number v-model:value="formValues[activeParamInput.name]" style="width: 100%;" />
                                   </template>
                                   <template v-else-if="getInputSelectOptions(activeParamInput).length">
                                      <n-select
                                         v-model:value="formValues[activeParamInput.name]"
                                         :options="getInputSelectOptions(activeParamInput)"
                                         filterable
                                         clearable
                                      />
                                   </template>
                                   <template v-else>
                                      <n-input type="textarea" v-model:value="formValues[activeParamInput.name]" rows="4" />
                                   </template>
                                </template>

                                <n-space align="center" size="small" class="param-inline-row">
                                   <n-tree-select
                                     v-model:value="refInlineTreeValue"
                                     :options="refInlineTreeOptions"
                                     clearable
                                     filterable
                                     class="param-inline-select"
                                     :placeholder="t('workflow.nodeModal.params.upstreamInlinePlaceholder')"
                                     @update:value="(val) => handleInlineRefTreeUpdate(activeParamInput.name, val)"
                                   />
                                   <n-input
                                     v-model:value="refInlineSubpath"
                                     size="small"
                                     class="param-inline-subpath"
                                     :placeholder="t('workflow.nodeModal.params.upstreamInlinePathPlaceholder')"
                                   />
                                </n-space>
                                <n-space align="center" size="small" class="param-variable-row">
                                   <n-select
                                     v-model:value="refVariableQuickPick"
                                     :options="runtimeVariableRefOptions"
                                     size="small"
                                     filterable
                                     clearable
                                     class="param-variable-select"
                                     :placeholder="t('workflow.nodeModal.params.runtimeVariablePlaceholder')"
                                   />
                                   <n-button size="tiny" secondary :disabled="!refVariableQuickPick" @click="applyRefVariableQuickPick">
                                      {{ t("workflow.nodeModal.params.useRuntimeVariable") }}
                                   </n-button>
                                </n-space>
 
                                <div v-if="activeParamInput.description" class="muted node-params-editor-desc">
                                   {{ activeParamInput.description }}
                                </div>
                             </div>
                          </n-scrollbar>
                       </template>
 
                       <div v-else class="muted node-params-empty">
                          {{ t("workflow.nodeModal.paramsPanel.empty") }}
                       </div>
                    </n-card>
                    <n-card size="small" :bordered="false" class="node-json-panel">
                       <template #header>JSON</template>
                       <n-input type="textarea" :value="jsonPreview" readonly :autosize="{ minRows: 16, maxRows: 22 }" />
                    </n-card>
                 </div>
               </n-tab-pane>
         </n-tabs>
      </div>
      <div v-else class="muted">{{ t("workflow.nodeMissing") }}</div>

      <template #footer>
        <div class="modal-footer-actions">
           <n-button @click="closeNodeModal">{{ t("common.cancel") }}</n-button>
           <n-button type="primary" @click="saveNodeConfig">{{ t("common.ok") }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Upstream Selector Modal -->
    <n-modal
      v-model:show="upstreamModal.visible"
      preset="card"
      :title="t('workflow.nodeModal.upstreamPicker.title')"
      style="width: 760px; max-width: 95vw;"
      @close="closeUpstreamSelector"
    >
      <div v-if="upstreamNodeOptions.length">
         <div class="upstream-toolbar">
             <span class="muted upstream-toolbar-label">{{ t("workflow.nodeModal.upstreamPicker.upstreamNode") }}</span>
             <n-select
                v-model:value="upstreamPicker.nodeId"
                :options="upstreamNodeOptions"
                :placeholder="t('workflow.nodeModal.upstreamPicker.upstreamNodePlaceholder')"
                filterable
                class="upstream-toolbar-node"
             />
             <n-input
                v-model:value="upstreamPicker.subpath"
                :placeholder="t('workflow.nodeModal.upstreamPicker.subpathPlaceholder')"
                class="upstream-toolbar-path"
                :disabled="!upstreamPicker.nodeId || !upstreamPicker.output"
             />
          </div>

         <div v-if="upstreamPicker.nodeId" class="upstream-body">
            <div class="upstream-tree-pane">
               <n-tree
                  :data="upstreamTreeData"
                  :selected-keys="upstreamPicker.selectedKey ? [upstreamPicker.selectedKey] : []"
                  selectable
                  block-line
                  @update:selected-keys="onUpstreamTreeSelect"
               />
            </div>
             <div class="upstream-preview-pane">
                <div class="muted upstream-current-selection">
                   {{ t("workflow.nodeModal.upstreamPicker.currentSelection") }}:
                   <span v-if="upstreamPicker.output">{{ upstreamPicker.output }}{{ upstreamPicker.subpath ? formatWirePathSuffix(upstreamPicker.subpath) : "" }}</span
                   ><span v-else>{{ t("workflow.nodeModal.upstreamPicker.none") }}</span>
                </div>
                <n-input
                   type="textarea"
                   :value="upstreamPicker.nodeId && upstreamPicker.output ? buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath) : ''"
                   :placeholder="t('workflow.nodeModal.upstreamPicker.previewPlaceholder')"
                   rows="4"
                   readonly
                />
             </div>
          </div>
       </div>
       <div v-else class="muted upstream-empty-tip">{{ t("workflow.nodeModal.upstreamPicker.noUpstream") }}</div>

       <template #footer>
         <div class="modal-footer-actions">
            <n-button @click="closeUpstreamSelector">{{ t("common.cancel") }}</n-button>
            <n-button type="primary" :disabled="!upstreamPicker.nodeId || !upstreamPicker.output" @click="applyUpstreamSelection">
               {{
                 upstreamModal.applyAs === "wire"
                   ? t("workflow.nodeModal.upstreamPicker.applyAsWire")
                   : t("workflow.nodeModal.upstreamPicker.applyAsRef")
               }}
            </n-button>
         </div>
       </template>
     </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import {
  NModal,
  NTabs,
  NTabPane,
  NCard,
  NGrid,
  NGi,
  NScrollbar,
  NInput,
  NInputNumber,
  NCheckbox,
  NSwitch,
  NSelect,
  NTreeSelect,
  NButton,
  NRadioGroup,
  NRadioButton,
  NTree,
  NSpace,
  NTag,
  NAlert,
} from "naive-ui";
import { useI18n } from "../../i18n";
import { useWorkflowNodeModal } from "../../composables/workflow/useWorkflowNodeModal";
import type { DrawflowEditor } from "../../composables/workflow/useDrawflow";

interface WorkflowNodeConfigModalProps {
  store: any;
  editor: DrawflowEditor | null;
  currentWorkflowId: string;
  convertToCustomFormat: (dfData: any) => any;
  getActionDisplayName: (actionId: string, action: any) => string;
  getInputLabel: (action: any, input: any) => string;
}

const props = defineProps<WorkflowNodeConfigModalProps>();
const editorRef = computed(() => props.editor);
const currentWorkflowIdRef = toRef(props, "currentWorkflowId");
const { t } = useI18n();

const {
  nodeModal,
  nodeModalTab,
  rawJson,
  useRawJson,
  jsonPreview,
  paramsSearchTerm,
  filteredParamInputs,
  wireableNodeInputs,
  paramsActiveInputName,
  selectParamInput,
  inputMode,
  getHiddenEdgeByInput,
  getNodeLabel,
  formatWirePathSuffix,
  describeUpstreamRef,
  formValues,
  activeParamInput,
  runtimeVariableRefOptions,
  refVariableQuickPick,
  applyRefVariableQuickPick,
  refInlineTreeValue,
  refInlineTreeOptions,
  refInlineSubpath,
  handleInlineRefTreeUpdate,
  setInputMode,
  upstreamNodeOptions,
  goToWiringBoard,
  openUpstreamSelector,
  convertHiddenDataEdgeToRefByInput,
  removeHiddenDataEdgeByInput,
  getInputSelectOptions,
  closeNodeModal,
  saveNodeConfig,
  wireBoardRef,
  wireFilter,
  wireShowWires,
  wireFocusOnly,
  wireActiveSource,
  clearWireSource,
  saveWireSourceAsVariable,
  filteredUpstreamWireNodes,
  getFilteredUpstreamDataOutputs,
  selectWireSource,
  wireDrag,
  registerWirePortEl,
  makeWireSrcKey,
  makeWireInKey,
  scheduleWireOverlayRecalc,
  startWireDrag,
  filteredWireInputRows,
  wireFocusInput,
  setWireFocus,
  wirePathEditingInput,
  wirePathDraft,
  saveWirePathEdit,
  connectWireToInput,
  beginWirePathEdit,
  wireVisibleLines,
  upstreamWireNodes,
  upstreamModal,
  upstreamPicker,
  upstreamTreeData,
  onUpstreamTreeSelect,
  buildUpstreamExpr,
  closeUpstreamSelector,
  applyUpstreamSelection,
  openNodeModal,
  handleWireResize,
} = useWorkflowNodeModal({
  store: props.store,
  editor: editorRef,
  currentWorkflowId: currentWorkflowIdRef,
  convertToCustomFormat: props.convertToCustomFormat,
  getActionDisplayName: props.getActionDisplayName,
  getInputLabel: props.getInputLabel,
  t,
});

defineExpose({
  openNodeModal,
  closeNodeModal,
  handleWireResize,
});
</script>

<style scoped>
.node-params-layout {
  display: flex;
  gap: 12px;
  height: min(62vh, 560px);
}

.node-params-sidebar {
  flex: 0 0 300px;
  min-width: 260px;
  height: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.node-params-sidebar :deep(.n-card__content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  min-height: 0;
}

.node-params-sidebar-scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.node-params-empty {
  padding: 10px;
}

.node-params-item {
  width: 100%;
  text-align: left;
  height: auto;
  min-height: 52px;
  white-space: normal;
  line-height: 1.25;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.015);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
  align-items: stretch;
  justify-content: flex-start;
}

.node-params-item :deep(.n-button__content) {
  width: 100%;
  justify-content: flex-start;
  align-items: stretch;
  white-space: normal;
  line-height: 1.25;
}

.node-params-item-inner {
  width: 100%;
}

.node-params-item:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.node-params-item.is-active {
  border-color: rgba(0, 255, 127, 0.55);
  background: rgba(0, 255, 127, 0.08);
}

.node-params-item:focus-visible {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(0, 255, 127, 0.18);
  outline: none;
}

.node-params-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.node-params-item-label {
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-params-item-sub {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-params-item-name {
  font-size: 11px;
}

.node-params-item-preview {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-params-editor {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.node-params-editor :deep(.n-card__content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  min-height: 0;
}

.node-json-panel {
  flex: 0 0 320px;
  min-width: 280px;
  height: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.node-json-panel :deep(.n-card__content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}

.node-params-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.node-params-editor-title {
  min-width: 0;
}

.node-params-editor-label {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-params-editor-name {
  font-size: 12px;
  margin-top: 2px;
}

.node-params-editor-scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.node-params-editor-body {
  padding-top: 12px;
}

.node-params-editor-desc {
  margin-top: 12px;
  font-size: 12px;
}

.node-modal-action-title {
  margin-bottom: 16px;
}

.ref-preview-hint {
  margin-top: 6px;
  font-size: 12px;
}

.modal-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.param-inline-row {
  margin-top: 10px;
}

.param-variable-row {
  margin-top: 8px;
}

.param-inline-select,
.param-variable-select {
  min-width: 260px;
  flex: 1 1 auto;
}

.param-inline-subpath {
  width: 230px;
}

.upstream-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.upstream-toolbar-label {
  min-width: 84px;
}

.upstream-toolbar-node {
  flex: 1 1 auto;
  min-width: 260px;
}

.upstream-toolbar-path {
  width: 340px;
}

.upstream-body {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.upstream-tree-pane {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
  max-height: 320px;
  overflow: auto;
}

.upstream-preview-pane {
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upstream-current-selection {
  font-size: 12px;
}

.upstream-empty-tip {
  font-size: 12px;
}

.wireflow-controls {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.wireflow-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(62vh, 560px);
  min-height: 0;
}

.wireflow-controls :deep(> .n-card__content) {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wireflow-filter-upstream {
  width: 260px;
}

.wireflow-filter-inputs {
  width: 200px;
}

.wireflow-hint {
  margin: 0;
}

.wireflow-sourcebar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wireflow-sourcebar-label {
  flex: 0 1 auto;
  min-width: 200px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.wireflow-sourcebar-tag {
  max-width: 100%;
}

.wireflow-sourcebar-path {
  flex: 1 1 280px;
  min-width: 220px;
}

.wireflow-board {
  position: relative;
  flex: 1;
  min-height: 0;
}

.wireflow-grid {
  height: 100%;
}

.wireflow-col {
  min-width: 0;
  height: 100%;
}

.wireflow-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.wireflow-panel :deep(> .n-card-header) {
  background: rgba(0, 0, 0, 0.16);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 10px;
}

.wireflow-panel :deep(> .n-card__content) {
  flex: 1;
  min-height: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.wireflow-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wireflow-panel-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wireflow-panel-scroll {
  flex: 1;
  min-height: 0;
}

.wireflow-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wireflow-node-card {
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  transition: border-color 120ms ease, background 120ms ease;
}

.wireflow-node-card:hover {
  border-color: rgba(0, 255, 127, 0.35);
  background: rgba(255, 255, 255, 0.02);
}

.wireflow-node-card :deep(> .n-card-header) {
  background: rgba(0, 0, 0, 0.16);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 10px;
}

.wireflow-node-card :deep(> .n-card__content) {
  padding: 10px;
}

.wireflow-node-title {
  color: var(--fg-primary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wireflow-empty-card {
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  background: transparent;
}

.wireflow-empty-card :deep(> .n-card__content) {
  padding: 10px;
}

.wireflow-ports {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wireflow-port-btn :deep(.n-button__content) {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wireflow-port-btn {
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.wireflow-port-btn.is-active {
  border-color: var(--accent-primary);
  background: rgba(0, 255, 127, 0.08);
}

.wireflow-port-name {
  font-size: 12px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wireflow-port-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 0 2px rgba(0, 255, 127, 0.08);
  flex: 0 0 auto;
  cursor: grab;
}

.wireflow-port-dot:active {
  cursor: grabbing;
}

.wireflow-port-dot-in {
  margin-top: 2px;
  cursor: default;
}

.wireflow-port-dot-in.is-hover {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.wireflow-inputs-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wireflow-input-card {
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.012);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.wireflow-input-card:hover {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.02);
}

.wireflow-input-card.is-focused {
  border-color: rgba(0, 255, 127, 0.45);
  box-shadow: 0 0 0 2px rgba(0, 255, 127, 0.10);
  background: rgba(0, 255, 127, 0.04);
}

.wireflow-input-card :deep(> .n-card__content) {
  padding: 10px 12px;
}

.wireflow-input-card-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.wireflow-input-card-main {
  min-width: 0;
  flex: 1;
}

.wireflow-input-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.wireflow-input-label {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wireflow-input-sub {
  margin-top: 6px;
  font-size: 12px;
}

.wireflow-input-path-editor {
  margin-top: 8px;
}

.wireflow-input-card-actions {
  margin-top: 10px;
}

.wireflow-input-card:not(.is-focused) .wireflow-input-card-actions {
  display: none;
}

.wireflow-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

@media (max-width: 960px) {
  .node-params-layout {
    flex-direction: column;
    gap: 10px;
    height: auto;
    max-height: min(74vh, 760px);
  }

  .node-params-sidebar,
  .node-json-panel {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    max-height: 220px;
  }

  .node-params-editor {
    min-height: 220px;
  }

  .node-params-editor-header {
    flex-wrap: wrap;
  }

  .node-params-editor-header :deep(.n-radio-group) {
    width: 100%;
  }

  .modal-footer-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .param-inline-row,
  .param-variable-row {
    align-items: stretch !important;
    flex-wrap: wrap;
  }

  .param-inline-select,
  .param-variable-select,
  .param-inline-subpath {
    min-width: 0;
    width: 100%;
    flex: 1 1 100%;
  }

  .wireflow-layout {
    height: auto;
    max-height: min(72vh, 760px);
  }

  .wireflow-filter-upstream,
  .wireflow-filter-inputs {
    width: 100%;
  }

  .wireflow-sourcebar-label,
  .wireflow-sourcebar-path {
    min-width: 0;
    flex: 1 1 100%;
  }

  .upstream-toolbar {
    flex-wrap: wrap;
    align-items: stretch;
  }

  .upstream-toolbar-label {
    width: 100%;
    min-width: 0;
  }

  .upstream-toolbar-node,
  .upstream-toolbar-path {
    width: 100%;
    min-width: 0;
  }

  .upstream-body {
    flex-direction: column;
  }

  .upstream-tree-pane {
    max-height: 220px;
  }

  .upstream-preview-pane {
    width: 100%;
  }
}
</style>
