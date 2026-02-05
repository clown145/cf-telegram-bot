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
  </main>
</template>

 <script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { 
  NModal,
  NTabs,
  NTabPane,
  NCard,
  NGrid,
  NGi,
  NScrollbar,
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
  NSpace,
  NTag,
  NAlert
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

const wireBoardRef = ref<HTMLElement | null>(null);
const wireFilter = reactive({
   upstream: "",
   inputs: "",
   onlyConnected: false,
});
const wireShowWires = ref(true);
const wireFocusOnly = ref(true);
const wireFocusInput = ref<string>("");
const wirePathEditingInput = ref<string>("");
const wirePathDraft = ref<string>("");
const wireActiveSource = reactive({
   nodeId: "",
   output: "",
   source_path: "",
});
const wireLines = ref<Array<{ id: string; d: string; targetInput: string }>>([]);
const wireVisibleLines = computed(() => {
   if (!wireShowWires.value) return [];
   if (wireFocusOnly.value && wireFocusInput.value) {
      return wireLines.value.filter((l) => l.targetInput === wireFocusInput.value);
   }
   return wireLines.value;
});
const wireDrag = reactive({
   active: false,
   pointerId: 0,
   nodeId: "",
   output: "",
   source_path: "",
   startX: 0,
   startY: 0,
   x: 0,
   y: 0,
   hoverInput: "",
   tempD: "",
});
const wirePortElements = new Map<string, HTMLElement>();

const nodeInputs = computed(() => {
   const action = nodeModal.action;
   if (!action) return [];
   return action.inputs || action.parameters || [];
});

const paramsSearchTerm = ref<string>("");
const paramsActiveInputName = ref<string>("");
const selectParamInput = (inputName: string) => {
   paramsActiveInputName.value = String(inputName || "");
};

type SelectOption = { label: string; value: string };

const buildOptionsFromSource = (source: string): SelectOption[] => {
   const key = String(source || "").trim();
   if (!key) return [];

   if (key === "buttons") {
      return Object.values(store.state.buttons || {}).map((btn) => ({
         value: btn.id,
         label: `${btn.text || btn.id} (${btn.id})`,
      }));
   }

   if (key === "menus") {
      return Object.values(store.state.menus || {}).map((menu) => ({
         value: menu.id,
         label: `${menu.name || menu.id} (${menu.id})`,
      }));
   }

   if (key === "web_apps") {
      return Object.values(store.state.web_apps || {}).map((app) => ({
         value: app.id,
         label: `${app.name || app.id} (${app.id})`,
      }));
   }

   if (key === "local_actions") {
      return (store.localActions || []).map((a) => ({
         value: a.name,
         label: a.name,
      }));
   }

   if (key === "workflows") {
      return Object.values(store.state.workflows || {}).map((wf) => ({
         value: wf.id,
         label: `${wf.name || wf.id} (${wf.id})`,
      }));
   }

   return [];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getInputSelectOptions = (input: any): SelectOption[] => {
   if (!input) return [];

   if (Array.isArray(input.options) && input.options.length) {
      return input.options
         .map((opt: any) => ({ value: String(opt.value), label: String(opt.label || opt.value) }))
         .filter((opt: SelectOption) => opt.value);
   }

   if (Array.isArray(input.enum) && input.enum.length) {
      const labels = (input.enum_labels && typeof input.enum_labels === "object") ? input.enum_labels : {};
      return input.enum
         .map((value: any) => {
            const v = String(value);
            return { value: v, label: String((labels as any)[v] || v) };
         })
         .filter((opt: SelectOption) => opt.value);
   }

   if (input.options_source) {
      return buildOptionsFromSource(String(input.options_source));
   }

   return [];
};

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

const hiddenEdgeByInput = computed(() => {
   const map = new Map<string, any>();
   for (const edge of hiddenDataEdges.value as any[]) {
      const key = String(edge?.target_input || "").trim();
      if (!key) continue;
      map.set(key, edge);
   }
   return map;
});

const getHiddenEdgeByInput = (inputName: string) => {
   const key = String(inputName || "").trim();
   if (!key) return null;
   return hiddenEdgeByInput.value.get(key) || null;
};

const wireableNodeInputs = computed(() => {
   const inputs = (nodeInputs.value || []) as any[];
   return inputs.filter((input) => {
      const name = String(input?.name || "").trim();
      if (!name) return false;
      if (CONTROL_INPUT_NAMES.has(name)) return false;
      return true;
   });
});

const filteredParamInputs = computed(() => {
   const term = String(paramsSearchTerm.value || "").trim().toLowerCase();
   if (!term) return wireableNodeInputs.value;
   return wireableNodeInputs.value.filter((input) => {
      const name = String(input?.name || "").trim();
      if (!name) return false;
      const label = String(getInputLabel(nodeModal.action, input) || "").toLowerCase();
      return label.includes(term) || name.toLowerCase().includes(term);
   });
});

const activeParamInput = computed(() => {
   const active = String(paramsActiveInputName.value || "").trim();
   const list = filteredParamInputs.value;
   if (!list.length) return null;
   if (active) {
      const found = list.find((input) => String(input?.name || "") === active);
      if (found) return found;
   }
   return list[0] || null;
});

watch(
   () => [nodeModal.visible, paramsSearchTerm.value, filteredParamInputs.value.length],
   () => {
      if (!nodeModal.visible) return;
      if (nodeModalTab.value !== "params") return;
      const list = filteredParamInputs.value;
      if (!list.length) {
         paramsActiveInputName.value = "";
         return;
      }
      const active = String(paramsActiveInputName.value || "").trim();
      const exists = active && list.some((input) => String(input?.name || "") === active);
      if (!exists) {
         paramsActiveInputName.value = String(list[0]?.name || "");
      }
   },
   { immediate: true }
);

const filteredWireInputs = computed(() => {
   const term = String(wireFilter.inputs || "").trim().toLowerCase();
   return wireableNodeInputs.value.filter((input) => {
      const name = String(input?.name || "").trim();
      if (!name) return false;
      if (wireFilter.onlyConnected && !getHiddenEdgeByInput(name)) return false;
      if (!term) return true;
      const label = String(getInputLabel(nodeModal.action, input) || "").toLowerCase();
      return label.includes(term) || name.toLowerCase().includes(term);
   });
});

const filteredWireInputRows = computed(() => {
   return filteredWireInputs.value.map((input: any) => ({
      input,
      edge: getHiddenEdgeByInput(String(input?.name || "")),
   }));
});

const makeWireSrcKey = (nodeId: string, output: string) => `src:${nodeId}:${output}`;
const makeWireInKey = (inputName: string) => `in:${inputName}`;

const registerWirePortEl = (key: string, el: HTMLElement | null) => {
   if (el) {
      wirePortElements.set(key, el);
   } else {
      wirePortElements.delete(key);
   }
};

const buildCurveD = (sx: number, sy: number, tx: number, ty: number) => {
   const cp = Math.max(60, Math.min(160, Math.abs(tx - sx) / 2));
   return `M ${sx} ${sy} C ${sx + cp} ${sy} ${tx - cp} ${ty} ${tx} ${ty}`;
};

const recalcWireOverlay = () => {
   const container = wireBoardRef.value;
   if (!container) {
      wireLines.value = [];
      return;
   }
   const cRect = container.getBoundingClientRect();
   const lines: Array<{ id: string; d: string; targetInput: string }> = [];
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
      const d = buildCurveD(sx, sy, tx, ty);
      const id = String(edge?.id || `${srcKey}->${inKey}`);
      lines.push({ id, d, targetInput: String(edge?.target_input || "") });
   }
   wireLines.value = lines;
};

let wireOverlayRaf = 0;
const scheduleWireOverlayRecalc = () => {
   if (wireOverlayRaf) return;
   wireOverlayRaf = window.requestAnimationFrame(() => {
      wireOverlayRaf = 0;
      recalcWireOverlay();
   });
};

const handleWireResize = () => {
   if (wireDrag.active) {
      stopWireDrag();
   }
   scheduleWireOverlayRecalc();
};

const updateWireDragTemp = () => {
   if (!wireDrag.active) {
      wireDrag.tempD = "";
      return;
   }
   wireDrag.tempD = buildCurveD(wireDrag.startX, wireDrag.startY, wireDrag.x, wireDrag.y);
};

const updateWireHover = (clientX: number, clientY: number) => {
   const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
   const port = el?.closest?.("[data-wire-port]") as HTMLElement | null;
   if (port && port.dataset.wirePort === "in") {
      wireDrag.hoverInput = port.dataset.wireTargetInput || "";
   } else {
      wireDrag.hoverInput = "";
   }
};

const stopWireDrag = () => {
   if (!wireDrag.active) return;
   wireDrag.active = false;
   wireDrag.pointerId = 0;
   wireDrag.nodeId = "";
   wireDrag.output = "";
   wireDrag.source_path = "";
   wireDrag.hoverInput = "";
   wireDrag.tempD = "";
   window.removeEventListener("pointermove", onWirePointerMove, true);
   window.removeEventListener("pointerup", onWirePointerUp, true);
   window.removeEventListener("pointercancel", onWirePointerUp, true);
};

const onWirePointerMove = (e: PointerEvent) => {
   if (!wireDrag.active || e.pointerId !== wireDrag.pointerId) return;
   const container = wireBoardRef.value;
   if (!container) return;
   const rect = container.getBoundingClientRect();
   wireDrag.x = e.clientX - rect.left;
   wireDrag.y = e.clientY - rect.top;
   updateWireHover(e.clientX, e.clientY);
   updateWireDragTemp();
};

const onWirePointerUp = (e: PointerEvent) => {
   if (!wireDrag.active || e.pointerId !== wireDrag.pointerId) return;
   const targetInput = wireDrag.hoverInput;
   const nodeId = wireDrag.nodeId;
   const output = wireDrag.output;
   const sourcePath = wireDrag.source_path;
   stopWireDrag();

   if (targetInput && nodeId && output) {
      inputMode[targetInput] = "wire";
      addHiddenDataEdgeForInput(targetInput, nodeId, output, sourcePath);
      wireFocusInput.value = targetInput;
      nextTick(scheduleWireOverlayRecalc);
   }
};

const startWireDrag = (nodeId: string, output: string, e: PointerEvent) => {
   const container = wireBoardRef.value;
   if (!container) return;

   // keep selection in sync with the path field
   selectWireSource(nodeId, output);

   wireDrag.active = true;
   wireDrag.pointerId = e.pointerId;
   wireDrag.nodeId = nodeId;
   wireDrag.output = output;
   wireDrag.source_path = String(wireActiveSource.source_path || "");

   const rect = container.getBoundingClientRect();
   const srcEl = wirePortElements.get(makeWireSrcKey(nodeId, output));
   if (srcEl) {
      const s = srcEl.getBoundingClientRect();
      wireDrag.startX = s.left + s.width / 2 - rect.left;
      wireDrag.startY = s.top + s.height / 2 - rect.top;
   } else {
      wireDrag.startX = e.clientX - rect.left;
      wireDrag.startY = e.clientY - rect.top;
   }
   wireDrag.x = e.clientX - rect.left;
   wireDrag.y = e.clientY - rect.top;
   updateWireHover(e.clientX, e.clientY);
   updateWireDragTemp();

   window.addEventListener("pointermove", onWirePointerMove, true);
   window.addEventListener("pointerup", onWirePointerUp, true);
   window.addEventListener("pointercancel", onWirePointerUp, true);
};

watch(
   () => [nodeModal.visible, nodeModalTab.value, hiddenDataEdges.value.length, upstreamNodes.value.length],
   () => {
      if (!nodeModal.visible) return;
      if (nodeModalTab.value === "links" && !wireFocusInput.value) {
         // Prefer showing an existing connection if possible.
         const connected = filteredWireInputs.value.find((input: any) =>
            getHiddenEdgeByInput(String(input?.name || ""))
         );
         const first = connected || filteredWireInputs.value[0];
         if (first?.name) {
            wireFocusInput.value = String(first.name);
         }
      }
      nextTick(scheduleWireOverlayRecalc);
   }
);

watch(
   () => [wireFilter.upstream, wireFilter.inputs, wireFilter.onlyConnected],
   () => nextTick(scheduleWireOverlayRecalc)
);

watch(
   () => wireShowWires.value,
   (next) => {
      if (next) {
         nextTick(scheduleWireOverlayRecalc);
      }
   }
);

watch(
   () => [wireFocusInput.value, wirePathEditingInput.value],
   () => {
      if (!nodeModal.visible) return;
      if (nodeModalTab.value !== "links") return;
      nextTick(scheduleWireOverlayRecalc);
   }
);

function getUpstreamDataOutputs(n: any): string[] {
   const outputs = (n?.action?.outputs || []) as any[];
   const dataOutputs = outputs
      .filter((o) => o && String(o.type || "").toLowerCase() !== "flow")
      .map((o) => String(o.name || "").trim())
      .filter(Boolean);
   return dataOutputs;
}

const upstreamWireNodes = computed(() => upstreamNodes.value.filter((n) => getUpstreamDataOutputs(n).length > 0));

const wireUpstreamTerm = computed(() => String(wireFilter.upstream || "").trim().toLowerCase());

const filteredUpstreamWireNodes = computed(() => {
   const term = wireUpstreamTerm.value;
   if (!term) return upstreamWireNodes.value;
   return upstreamWireNodes.value.filter((n) => {
      const label = String(n?.label || "").toLowerCase();
      if (label.includes(term)) return true;
      return getUpstreamDataOutputs(n).some((out) => out.toLowerCase().includes(term));
   });
});

const getFilteredUpstreamDataOutputs = (n: any): string[] => {
   const outputs = getUpstreamDataOutputs(n);
   const term = wireUpstreamTerm.value;
   if (!term) return outputs;
   const label = String(n?.label || "").toLowerCase();
   if (label.includes(term)) return outputs;
   return outputs.filter((out) => out.toLowerCase().includes(term));
};

const selectWireSource = (nodeId: string, output: string) => {
   const changed = wireActiveSource.nodeId !== nodeId || wireActiveSource.output !== output;
   wireActiveSource.nodeId = nodeId;
   wireActiveSource.output = output;
   if (changed) {
      wireActiveSource.source_path = "";
   }
   if (wireDrag.active) {
      wireDrag.source_path = String(wireActiveSource.source_path || "");
      updateWireDragTemp();
   }
};

const clearWireSource = () => {
   wireActiveSource.nodeId = "";
   wireActiveSource.output = "";
   wireActiveSource.source_path = "";
   if (wireDrag.active) {
      stopWireDrag();
   }
};

const setWireFocus = (inputName: string) => {
   wireFocusInput.value = inputName;
};

const connectWireToInput = (inputName: string) => {
   const targetInput = String(inputName || "").trim();
   if (!targetInput) return;
   if (!wireActiveSource.nodeId || !wireActiveSource.output) return;
   inputMode[targetInput] = "wire";
   addHiddenDataEdgeForInput(targetInput, wireActiveSource.nodeId, wireActiveSource.output, wireActiveSource.source_path);
   wireFocusInput.value = targetInput;
   nextTick(scheduleWireOverlayRecalc);
};

const beginWirePathEdit = (inputName: string) => {
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) return;
   wirePathEditingInput.value = inputName;
   wirePathDraft.value = String(edge?.source_path || "");
};

const saveWirePathEdit = (inputName: string) => {
   if (wirePathEditingInput.value !== inputName) return;
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) {
      wirePathEditingInput.value = "";
      return;
   }
   const v = String(wirePathDraft.value || "").trim();
   edge.source_path = v ? v : undefined;
   wirePathEditingInput.value = "";
   nextTick(scheduleWireOverlayRecalc);
};

const goToWiringBoard = (inputName: string) => {
   wireFilter.upstream = "";
   wireFilter.inputs = "";
   wireFilter.onlyConnected = false;
   wireShowWires.value = true;
   nodeModalTab.value = "links";
   wireFocusInput.value = inputName;
   nextTick(() => {
      const el = wirePortElements.get(makeWireInKey(inputName));
      el?.scrollIntoView?.({ block: "center" } as any);
      scheduleWireOverlayRecalc();
   });
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

const formatWirePathSuffix = (path: string) => {
   const trimmed = String(path || "").trim();
   if (!trimmed) return "";
   if (trimmed.startsWith(".") || trimmed.startsWith("[")) return trimmed;
   return `.${trimmed}`;
};

const normalizeSubpath = (subpath: string) => {
   return formatWirePathSuffix(subpath);
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

watch(
   () => wireActiveSource.source_path,
   () => {
      if (wireDrag.active) {
         wireDrag.source_path = String(wireActiveSource.source_path || "");
         updateWireDragTemp();
      }
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
         goToWiringBoard(name);
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
   if (matches.length === 1) return t("workflow.nodeModal.params.refPreviewSingle", { expr: first });
   return t("workflow.nodeModal.params.refPreviewMulti", { expr: first, count: matches.length });
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

     // Params panel selection/filter
     paramsSearchTerm.value = "";
     const paramsInputs = wireableNodeInputs.value;
     const connected = paramsInputs.find((input: any) => getHiddenEdgeByInput(String(input?.name || "")));
     paramsActiveInputName.value = String(connected?.name || paramsInputs[0]?.name || "");
     
    rawJson.value = JSON.stringify(nodeModal.originalData, null, 2);
    useRawJson.value = false;

    upstreamPicker.nodeId = '';
    upstreamPicker.output = '';
    upstreamPicker.subpath = '';
    upstreamPicker.selectedKey = '';
    closeUpstreamSelector();

     // Reset wiring-board state to avoid leaking selection/filters between nodes.
     wireFilter.upstream = "";
     wireFilter.inputs = "";
     wireFilter.onlyConnected = false;
     wireShowWires.value = true;
     wireFocusOnly.value = true;
     wireFocusInput.value = "";
     wirePathEditingInput.value = "";
     wirePathDraft.value = "";
     clearWireSource();
     wireLines.value = [];
     if (wireOverlayRaf) {
        window.cancelAnimationFrame(wireOverlayRaf);
        wireOverlayRaf = 0;
     }
};

const closeNodeModal = () => {
   nodeModal.visible = false;
   closeUpstreamSelector();
   paramsSearchTerm.value = "";
   paramsActiveInputName.value = "";
   clearWireSource();
   wireFocusInput.value = "";
   wirePathEditingInput.value = "";
   wirePathDraft.value = "";
   wireLines.value = [];
   if (wireOverlayRaf) {
      window.cancelAnimationFrame(wireOverlayRaf);
      wireOverlayRaf = 0;
   }
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
   clearWireSource();
   wireLines.value = [];
   if (wireOverlayRaf) {
      window.cancelAnimationFrame(wireOverlayRaf);
      wireOverlayRaf = 0;
   }
   if (drawflowContainer.value) {
      drawflowContainer.value.removeEventListener('dblclick', handleNodeDblClick);
   }
   delete (window as any).tgButtonEditor;
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
  margin-bottom: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
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
  height: min(62vh, 560px);
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
