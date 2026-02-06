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
         <p class="muted" style="margin-bottom: 16px;">{{ getActionDisplayName(nodeModal.action.id, nodeModal.action) }}</p>

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
                                     :type="inputMode[input.name] === 'wire' ? 'success' : inputMode[input.name] === 'ref' ? 'info' : 'default'"
                                   >
                                     {{ t(`workflow.nodeModal.modes.${inputMode[input.name] || "literal"}`) }}
                                   </n-tag>
                                </div>
                                <div class="node-params-item-sub">
                                   <span class="muted node-params-item-name">{{ input.name }}</span>
                                   <span v-if="inputMode[input.name] === 'wire'" class="muted node-params-item-preview">
                                     <template v-if="getHiddenEdgeByInput(input.name)">
                                        ←
                                        {{ getNodeLabel(getHiddenEdgeByInput(input.name).source_node) }}.{{ getHiddenEdgeByInput(input.name).source_output
                                        }}<span v-if="getHiddenEdgeByInput(input.name).source_path">{{ formatWirePathSuffix(getHiddenEdgeByInput(input.name).source_path) }}</span>
                                     </template>
                                     <template v-else>
                                        {{ t("workflow.nodeModal.params.notConnected") }}
                                     </template>
                                   </span>
                                   <span v-else-if="inputMode[input.name] === 'ref'" class="muted node-params-item-preview">
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
                                <n-radio-button value="wire">{{ t("workflow.nodeModal.modes.wire") }}</n-radio-button>
                                <n-radio-button value="ref">{{ t("workflow.nodeModal.modes.ref") }}</n-radio-button>
                             </n-radio-group>
                          </div>
 
                          <n-scrollbar
                            class="node-params-editor-scroll"
                            :content-style="{ paddingRight: '16px', paddingBottom: '8px' }"
                          >
                             <div class="node-params-editor-body">
                                <template v-if="inputMode[activeParamInput.name] === 'wire'">
                                   <div class="muted" style="font-size: 12px; margin-bottom: 8px;">
                                      <template v-if="getHiddenEdgeByInput(activeParamInput.name)">
                                         {{ t("workflow.nodeModal.params.current") }}:
                                         {{ activeParamInput.name }}
                                         ←
                                         {{ getNodeLabel(getHiddenEdgeByInput(activeParamInput.name).source_node) }}.{{ getHiddenEdgeByInput(activeParamInput.name).source_output
                                         }}<span v-if="getHiddenEdgeByInput(activeParamInput.name).source_path">{{ formatWirePathSuffix(getHiddenEdgeByInput(activeParamInput.name).source_path) }}</span>
                                      </template>
                                      <template v-else>
                                         {{ t("workflow.nodeModal.params.current") }}: {{ t("workflow.nodeModal.params.notConnected") }}
                                      </template>
                                   </div>
                                   <n-space justify="end" size="small">
                                      <n-button size="tiny" secondary :disabled="!upstreamNodeOptions.length" @click="goToWiringBoard(activeParamInput.name)">
                                         {{ t("workflow.nodeModal.params.openWiringBoard") }}
                                      </n-button>
                                      <n-button size="tiny" secondary :disabled="!upstreamNodeOptions.length" @click="openUpstreamSelector(activeParamInput.name, 'wire')">
                                         {{ t("workflow.nodeModal.params.pickUpstreamOutput") }}
                                      </n-button>
                                      <n-button size="tiny" secondary :disabled="!getHiddenEdgeByInput(activeParamInput.name)" @click="convertHiddenDataEdgeToRefByInput(activeParamInput.name)">
                                         {{ t("workflow.nodeModal.params.toRef") }}
                                      </n-button>
                                      <n-button size="tiny" type="error" secondary :disabled="!getHiddenEdgeByInput(activeParamInput.name)" @click="removeHiddenDataEdgeByInput(activeParamInput.name)">
                                         {{ t("workflow.nodeModal.params.disconnect") }}
                                      </n-button>
                                   </n-space>
                                </template>
 
                                <template v-else-if="inputMode[activeParamInput.name] === 'ref'">
                                   <n-input
                                     type="textarea"
                                     v-model:value="formValues[activeParamInput.name]"
                                     :rows="activeParamInput.type === 'boolean' || activeParamInput.type === 'bool' ? 2 : 4"
                                   />
                                   <n-space justify="end" size="small" style="margin-top: 6px;">
                                      <n-button size="tiny" secondary :disabled="!upstreamNodeOptions.length" @click="openUpstreamSelector(activeParamInput.name, 'ref')">
                                         {{ t("workflow.nodeModal.params.pickUpstreamField") }}
                                      </n-button>
                                   </n-space>
                                   <div v-if="describeUpstreamRef(formValues[activeParamInput.name])" class="muted" style="margin-top: 6px; font-size: 12px;">
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
                 </div>
               </n-tab-pane>

                 <n-tab-pane name="links" :tab="t('workflow.nodeModal.tabs.wiring')">
                    <div class="wireflow-layout">
                    <n-card size="small" :bordered="false" class="wireflow-controls" segmented>
                       <n-space wrap align="center" size="small">
                          <n-input
                            v-model:value="wireFilter.upstream"
                            size="small"
                           class="wireflow-filter wireflow-filter-upstream"
                           :placeholder="t('workflow.nodeModal.wiring.upstreamSearchPlaceholder')"
                         />
                         <n-input
                           v-model:value="wireFilter.inputs"
                           size="small"
                           class="wireflow-filter wireflow-filter-inputs"
                           :placeholder="t('workflow.nodeModal.wiring.inputsSearchPlaceholder')"
                         />
                         <n-checkbox v-model:checked="wireFilter.onlyConnected">
                           {{ t("workflow.nodeModal.wiring.onlyConnected") }}
                         </n-checkbox>
                         <n-checkbox v-model:checked="wireShowWires">
                           {{ t("workflow.nodeModal.wiring.showWires") }}
                         </n-checkbox>
                         <n-checkbox v-model:checked="wireFocusOnly" :disabled="!wireShowWires">
                           {{ t("workflow.nodeModal.wiring.focusOnly") }}
                         </n-checkbox>
                      </n-space>

                      <n-alert :show-icon="false" type="info" class="wireflow-hint">
                         {{ t("workflow.nodeModal.wiring.hint") }}
                      </n-alert>

                      <template #footer>
                        <div class="wireflow-sourcebar-row">
                           <div class="wireflow-sourcebar-label">
                              <span class="muted">{{ t("workflow.nodeModal.wiring.sourceTitle") }}</span>
                              <n-tag
                                v-if="wireActiveSource.nodeId && wireActiveSource.output"
                                size="small"
                                round
                                :bordered="false"
                                type="success"
                                class="wireflow-sourcebar-tag"
                              >
                                {{ getNodeLabel(wireActiveSource.nodeId) }}.{{ wireActiveSource.output }}
                              </n-tag>
                              <n-tag v-else size="small" round :bordered="false" class="wireflow-sourcebar-tag">
                                {{ t("workflow.nodeModal.wiring.noneSelected") }}
                              </n-tag>
                           </div>
                           <n-input
                             v-model:value="wireActiveSource.source_path"
                             size="small"
                             class="wireflow-sourcebar-path"
                             :placeholder="t('workflow.nodeModal.wiring.sourcePathPlaceholder')"
                             :disabled="!wireActiveSource.nodeId || !wireActiveSource.output"
                           />
                           <n-button
                             size="small"
                             secondary
                             :disabled="!wireActiveSource.nodeId || !wireActiveSource.output"
                             @click="clearWireSource"
                           >
                             {{ t("workflow.nodeModal.wiring.clear") }}
                            </n-button>
                          </div>
                      </template>
                    </n-card>
 
                   <div
                     ref="wireBoardRef"
                     class="wireflow-board"
                     @scroll.capture.passive="scheduleWireOverlayRecalc"
                   >
                      <n-grid :cols="2" :x-gap="12" class="wireflow-grid">
                         <n-gi class="wireflow-col">
                            <n-card size="small" :bordered="false" class="wireflow-panel">
                               <template #header>
                                 <div class="wireflow-panel-header">
                                    <div class="wireflow-panel-title">{{ t("workflow.nodeModal.wiring.upstreamTitle") }}</div>
                                    <n-tag size="small" round :bordered="false">{{ filteredUpstreamWireNodes.length }}</n-tag>
                                 </div>
                              </template>
                              <n-scrollbar
                                class="wireflow-panel-scroll"
                                :content-style="{ padding: '8px 16px 12px 10px' }"
                              >
                                 <div class="wireflow-stack">
                                    <n-card
                                      v-for="n in filteredUpstreamWireNodes"
                                      :key="n.id"
                                      size="small"
                                      :bordered="false"
                                      class="wireflow-node-card"
                                    >
                                      <template #header>
                                         <span class="wireflow-node-title">{{ n.label }}</span>
                                      </template>
                                      <div class="wireflow-ports">
                                         <n-button
                                           v-for="out in getFilteredUpstreamDataOutputs(n)"
                                           :key="`${n.id}:${out}`"
                                           quaternary
                                           size="small"
                                           block
                                           class="wireflow-port-btn"
                                           :class="{ 'is-active': wireActiveSource.nodeId === n.id && wireActiveSource.output === out }"
                                           @click="selectWireSource(n.id, out)"
                                         >
                                           <span class="wireflow-port-name">{{ out }}</span>
                                           <span
                                             :ref="(el) => registerWirePortEl(makeWireSrcKey(n.id, out), el as any)"
                                             class="wireflow-port-dot"
                                             :data-wire-port="'src'"
                                             :data-wire-src-node="n.id"
                                             :data-wire-src-output="out"
                                             @pointerdown.stop.prevent="startWireDrag(n.id, out, $event)"
                                           />
                                         </n-button>
                                      </div>
                                    </n-card>
 
                                    <n-card
                                      v-if="!filteredUpstreamWireNodes.length"
                                      size="small"
                                      :bordered="false"
                                      class="wireflow-empty-card"
                                    >
                                       <div class="muted" style="font-size: 12px;">
                                         {{
                                           upstreamWireNodes.length
                                             ? t("workflow.nodeModal.wiring.noMatchingUpstream")
                                             : t("workflow.nodeModal.wiring.upstreamEmpty")
                                         }}
                                       </div>
                                     </n-card>
                                   </div>
                              </n-scrollbar>
                           </n-card>
                        </n-gi>
 
                        <n-gi class="wireflow-col">
                           <n-card size="small" :bordered="false" class="wireflow-panel">
                              <template #header>
                                 <div class="wireflow-panel-header">
                                    <div class="wireflow-panel-title">{{ t("workflow.nodeModal.wiring.inputsTitle") }}</div>
                                    <n-tag size="small" round :bordered="false">{{ filteredWireInputRows.length }}</n-tag>
                                 </div>
                              </template>
                              <n-scrollbar
                                class="wireflow-panel-scroll"
                                :content-style="{ padding: '8px 16px 12px 10px' }"
                              >
                                 <div v-if="!filteredWireInputRows.length" class="muted wireflow-empty" style="font-size: 12px;">
                                   {{ t("workflow.nodeModal.wiring.noMatchingInputs") }}
                                 </div>
                                 <div v-else class="wireflow-inputs-stack">
                                    <n-card
                                      v-for="row in filteredWireInputRows"
                                      :key="row.input.name"
                                      size="small"
                                      :bordered="false"
                                      class="wireflow-input-card"
                                      :class="{ 'is-focused': wireFocusInput === row.input.name }"
                                      @click="setWireFocus(row.input.name)"
                                    >
                                       <div class="wireflow-input-card-row">
                                          <span
                                            :ref="(el) => registerWirePortEl(makeWireInKey(row.input.name), el as any)"
                                            class="wireflow-port-dot wireflow-port-dot-in"
                                            :data-wire-port="'in'"
                                            :data-wire-target-input="row.input.name"
                                            :class="{ 'is-hover': wireDrag.hoverInput === row.input.name }"
                                          />
                                          <div class="wireflow-input-card-main">
                                             <div class="wireflow-input-card-top">
                                                <div class="wireflow-input-label">
                                                   {{ getInputLabel(nodeModal.action, row.input) }}
                                                   <span class="muted">({{ row.input.name }})</span>
                                                </div>
                                                <n-tag
                                                  size="small"
                                                  round
                                                  :bordered="false"
                                                  :type="row.edge ? 'success' : 'default'"
                                                >
                                                   {{
                                                     row.edge
                                                       ? t("workflow.nodeModal.modes.wire")
                                                       : t("workflow.nodeModal.params.notConnected")
                                                   }}
                                                </n-tag>
                                             </div>
 
                                             <div v-if="row.edge" class="muted wireflow-input-sub">
                                                <n-space size="small" align="center" wrap>
                                                   <n-tag size="small" round type="success" :bordered="false">
                                                      {{ getNodeLabel(row.edge.source_node) }}.{{ row.edge.source_output }}
                                                   </n-tag>
                                                   <n-tag v-if="row.edge.source_path" size="small" round :bordered="false">
                                                      {{ formatWirePathSuffix(row.edge.source_path) }}
                                                   </n-tag>
                                                </n-space>
                                             </div>
 
                                             <div v-if="wirePathEditingInput === row.input.name" class="wireflow-input-path-editor">
                                                <n-input
                                                  v-model:value="wirePathDraft"
                                                  size="small"
                                                  :placeholder="t('workflow.nodeModal.wiring.pathPlaceholder')"
                                                  @keyup.enter="saveWirePathEdit(row.input.name)"
                                                  @blur="saveWirePathEdit(row.input.name)"
                                                />
                                             </div>
 
                                             <n-space size="small" align="center" justify="end" class="wireflow-input-card-actions">
                                                <n-button
                                                  size="tiny"
                                                  type="primary"
                                                  secondary
                                                  :disabled="!wireActiveSource.nodeId || !wireActiveSource.output"
                                                  @click.stop="connectWireToInput(row.input.name)"
                                                >
                                                   {{ t("workflow.nodeModal.wiring.connect") }}
                                                </n-button>
                                                <n-button
                                                  size="tiny"
                                                  secondary
                                                  :disabled="!row.edge"
                                                  @click.stop="beginWirePathEdit(row.input.name)"
                                                >
                                                   {{ t("workflow.nodeModal.wiring.path") }}
                                                </n-button>
                                                <n-button
                                                  size="tiny"
                                                  secondary
                                                  :disabled="!row.edge"
                                                  @click.stop="convertHiddenDataEdgeToRefByInput(row.input.name)"
                                                >
                                                   {{ t("workflow.nodeModal.params.toRef") }}
                                                </n-button>
                                                <n-button
                                                  size="tiny"
                                                  type="error"
                                                  secondary
                                                  :disabled="!row.edge"
                                                  @click.stop="removeHiddenDataEdgeByInput(row.input.name)"
                                                >
                                                   {{ t("workflow.nodeModal.params.disconnect") }}
                                                </n-button>
                                             </n-space>
                                          </div>
                                       </div>
                                    </n-card>
                                 </div>
                              </n-scrollbar>
                           </n-card>
                        </n-gi>
                     </n-grid>

                    <svg v-if="wireShowWires" class="wireflow-overlay">
                       <path
                         v-for="line in wireVisibleLines"
                         :key="line.id"
                         :d="line.d"
                         fill="none"
                         stroke="var(--accent-primary)"
                         stroke-width="2"
                         opacity="0.50"
                       />
                       <path
                         v-if="wireDrag.active && wireDrag.tempD"
                         :d="wireDrag.tempD"
                         fill="none"
                         stroke="var(--accent-primary)"
                         stroke-width="2"
                         stroke-dasharray="6 6"
                         opacity="0.7"
                        />
                     </svg>
                  </div>
                  </div>
               </n-tab-pane>

               <n-tab-pane name="advanced" :tab="t('workflow.nodeModal.tabs.advanced')">
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
      :title="t('workflow.nodeModal.upstreamPicker.title')"
      style="width: 760px; max-width: 95vw;"
      @close="closeUpstreamSelector"
    >
      <div v-if="upstreamNodeOptions.length">
         <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
             <span class="muted" style="min-width: 84px;">{{ t("workflow.nodeModal.upstreamPicker.upstreamNode") }}</span>
             <n-select
                v-model:value="upstreamPicker.nodeId"
                :options="upstreamNodeOptions"
                :placeholder="t('workflow.nodeModal.upstreamPicker.upstreamNodePlaceholder')"
                filterable
                style="flex: 1; min-width: 260px;"
             />
             <n-input
                v-model:value="upstreamPicker.subpath"
                :placeholder="t('workflow.nodeModal.upstreamPicker.subpathPlaceholder')"
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
       <div v-else class="muted" style="font-size: 12px;">{{ t("workflow.nodeModal.upstreamPicker.noUpstream") }}</div>

       <template #footer>
         <div style="display: flex; justify-content: flex-end; gap: 8px;">
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
import { type Ref } from "vue";
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
  editor: Ref<DrawflowEditor | null>;
  currentWorkflowId: Ref<string>;
  convertToCustomFormat: (dfData: any) => any;
  getActionDisplayName: (actionId: string, action: any) => string;
  getInputLabel: (action: any, input: any) => string;
}

const props = defineProps<WorkflowNodeConfigModalProps>();
const { t } = useI18n();

const {
  nodeModal,
  nodeModalTab,
  rawJson,
  useRawJson,
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
  setInputMode,
  upstreamNodeOptions,
  goToWiringBoard,
  openUpstreamSelector,
  convertHiddenDataEdgeToRefByInput,
  removeHiddenDataEdgeByInput,
  getInputSelectOptions,
  closeNodeModal,
  saveNodeConfig,
  wireFilter,
  wireShowWires,
  wireFocusOnly,
  wireActiveSource,
  clearWireSource,
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
  editor: props.editor,
  currentWorkflowId: props.currentWorkflowId,
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
</style>
