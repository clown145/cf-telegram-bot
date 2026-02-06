<template>
  <div class="workflow-tester-actions">
    <n-popover v-if="showWorkflowTestConfig" trigger="click" placement="bottom-end">
      <template #trigger>
        <n-button id="workflowTestConfigBtn" secondary :disabled="!workflowId">
          {{ t("workflow.tester.config") }}
        </n-button>
      </template>
      <div class="workflow-test-config-panel">
        <n-select
          id="workflowTestModeSelect"
          v-model:value="workflowTest.mode"
          size="small"
          :options="workflowTestModeOptions"
          :placeholder="t('workflow.tester.modeLabel')"
        />
        <n-select
          v-if="workflowTest.mode !== 'workflow'"
          id="workflowTestNodeSelect"
          v-model:value="workflowTest.triggerNodeId"
          clearable
          size="small"
          :options="workflowTestTriggerNodeOptions"
          :placeholder="t('workflow.tester.triggerNodePlaceholder')"
        />
        <n-input
          v-if="workflowTest.mode === 'command'"
          v-model:value="workflowTest.commandText"
          clearable
          size="small"
          :placeholder="t('workflow.tester.commandTextPlaceholder')"
        />
        <n-input
          v-if="workflowTest.mode === 'keyword'"
          v-model:value="workflowTest.keywordText"
          clearable
          size="small"
          :placeholder="t('workflow.tester.keywordTextPlaceholder')"
        />
        <n-input
          v-if="workflowTest.mode === 'button'"
          v-model:value="workflowTest.buttonId"
          clearable
          size="small"
          :placeholder="t('workflow.tester.buttonIdPlaceholder')"
        />
      </div>
    </n-popover>

    <n-button
      id="runWorkflowTestBtn"
      type="warning"
      :loading="workflowTest.running"
      :disabled="!workflowId"
      @click="runWorkflowTest"
    >
      {{ t("workflow.tester.run") }}
    </n-button>
    <n-button
      id="viewWorkflowTestResultBtn"
      secondary
      :disabled="!workflowTest.last"
      @click="openWorkflowTestResult"
    >
      {{ t("workflow.tester.view") }}
    </n-button>

    <n-modal
      v-model:show="workflowTest.showResult"
      preset="card"
      :title="t('workflow.tester.resultTitle')"
      style="width: 980px; max-width: 96vw;"
    >
      <template v-if="workflowTest.last">
        <n-space vertical size="medium">
          <n-space align="center" wrap>
            <n-tag :type="workflowTest.last.result?.success ? 'success' : workflowTest.last.result?.pending ? 'warning' : 'error'">
              {{
                workflowTest.last.result?.success
                  ? t("workflow.tester.statusSuccess")
                  : workflowTest.last.result?.pending
                    ? t("workflow.tester.statusPending")
                    : t("workflow.tester.statusError")
              }}
            </n-tag>
            <n-tag type="info">
              {{ t("workflow.tester.modeLabel") }}:
              {{ workflowTestModeLabel(workflowTest.last.trigger_mode || workflowTest.mode) }}
            </n-tag>
            <n-tag type="info">{{ t("workflow.tester.preview") }}: {{ workflowTest.last.preview ? t("common.ok") : "-" }}</n-tag>
            <n-tag v-if="workflowTest.last.obs_execution_id" type="default">
              {{ t("workflow.tester.obsId") }}: {{ workflowTest.last.obs_execution_id }}
            </n-tag>
            <n-tag v-if="workflowTest.last.trigger_match?.node_id" type="default">
              {{ t("workflow.tester.triggerNodeMatched") }}: {{ workflowTest.last.trigger_match.node_id }}
            </n-tag>
          </n-space>

          <n-alert v-if="workflowTest.last.observability_enabled === false" type="warning" :show-icon="false">
            {{ t("workflow.tester.observabilityDisabled") }}
          </n-alert>

          <execution-trace-detail
            v-if="workflowTest.last.trace"
            :trace="workflowTest.last.trace"
            :empty-text="t('workflow.tester.empty')"
          />

          <n-card v-else size="small" :title="t('workflow.tester.resultPayload')">
            <n-code :code="formatJson(workflowTest.last.result)" language="json" word-wrap />
          </n-card>
        </n-space>
      </template>
      <div v-else class="muted">{{ t("workflow.tester.empty") }}</div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end;">
          <n-button @click="workflowTest.showResult = false">{{ t("common.cancel") }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { NAlert, NButton, NCard, NCode, NInput, NModal, NPopover, NSelect, NSpace, NTag } from "naive-ui";
import ExecutionTraceDetail from "../ExecutionTraceDetail.vue";
import { useI18n } from "../../i18n";
import type { ObsExecutionTrace } from "../../types/observability";
import { apiJson, getErrorMessage } from "../../services/api";
import { showInfoModal } from "../../services/uiBridge";

interface WorkflowNodeLike {
  action_id?: string;
  data?: Record<string, unknown>;
}

interface WorkflowDefinitionLike {
  nodes?: Record<string, WorkflowNodeLike>;
}

interface WorkflowTestResponse {
  status: string;
  workflow_id: string;
  workflow_name?: string;
  preview: boolean;
  trigger_mode?: string;
  trigger_match?: {
    type: string;
    node_id: string;
    priority: number;
    config?: Record<string, unknown>;
  } | null;
  trigger_candidates?: number;
  observability_enabled?: boolean;
  obs_execution_id?: string | null;
  result?: Record<string, unknown>;
  trace?: ObsExecutionTrace | null;
}

const props = defineProps<{
  workflowId: string;
  workflowMap: Record<string, WorkflowDefinitionLike>;
  actionMap: Record<string, Record<string, unknown>>;
  saveWorkflowBeforeRun?: (options?: { silentSuccess?: boolean }) => Promise<void> | void;
  resolveActionName?: (actionId: string, action: Record<string, unknown>) => string;
}>();

const { t } = useI18n();

const workflowTest = reactive({
  running: false,
  showResult: false,
  last: null as WorkflowTestResponse | null,
  mode: "workflow",
  triggerNodeId: "",
  commandText: "",
  keywordText: "",
  buttonId: "",
});

const currentWorkflow = computed<WorkflowDefinitionLike | null>(() => {
  if (!props.workflowId) return null;
  return props.workflowMap?.[props.workflowId] || null;
});

const builtinWorkflowTestModeOrder = ["command", "keyword", "button"];

const normalizeTriggerModeFromAction = (actionId: string) => {
  if (!actionId.startsWith("trigger_")) {
    return "";
  }
  return actionId.slice("trigger_".length).trim().toLowerCase();
};

const resolveActionDisplayName = (actionId: string, actionDef: Record<string, unknown>) => {
  if (props.resolveActionName) {
    return props.resolveActionName(actionId, actionDef);
  }
  const name = actionDef.name;
  if (typeof name === "string" && name.trim()) {
    return name;
  }
  return actionId;
};

const resolveWorkflowTestModeLabel = (mode: string) => {
  if (!mode || mode === "workflow") {
    return t("workflow.tester.modeWorkflow");
  }
  if (mode === "command") {
    return t("workflow.tester.modeCommand");
  }
  if (mode === "keyword") {
    return t("workflow.tester.modeKeyword");
  }
  if (mode === "button") {
    return t("workflow.tester.modeButton");
  }
  const actionId = `trigger_${mode}`;
  const actionDef = props.actionMap?.[actionId];
  if (actionDef) {
    return resolveActionDisplayName(actionId, actionDef);
  }
  return t("workflow.tester.modeGeneric", { mode });
};

const workflowTriggerModes = computed(() => {
  const nodes = (currentWorkflow.value?.nodes || {}) as Record<string, WorkflowNodeLike>;
  const modeSet = new Set<string>();
  for (const node of Object.values(nodes)) {
    const mode = normalizeTriggerModeFromAction(String(node?.action_id || ""));
    if (mode) {
      modeSet.add(mode);
    }
  }
  const modes = Array.from(modeSet);
  modes.sort((a, b) => {
    const aBuiltin = builtinWorkflowTestModeOrder.indexOf(a);
    const bBuiltin = builtinWorkflowTestModeOrder.indexOf(b);
    if (aBuiltin >= 0 || bBuiltin >= 0) {
      if (aBuiltin < 0) return 1;
      if (bBuiltin < 0) return -1;
      return aBuiltin - bBuiltin;
    }
    return a.localeCompare(b);
  });
  return modes;
});

const workflowTestModeOptions = computed(() => {
  const options: Array<{ label: string; value: string }> = [
    { label: t("workflow.tester.modeWorkflow"), value: "workflow" },
  ];
  for (const mode of workflowTriggerModes.value) {
    options.push({
      label: resolveWorkflowTestModeLabel(mode),
      value: mode,
    });
  }
  return options;
});

const showWorkflowTestConfig = computed(() => workflowTestModeOptions.value.length > 1);

const workflowTestModeLabel = (mode: string) => resolveWorkflowTestModeLabel(String(mode || "workflow"));

const describeTriggerNode = (mode: string, nodeId: string, data: Record<string, unknown>) => {
  if (mode === "command") {
    const command = String(data.command || "").trim();
    return `#${nodeId} /${command || "?"}`;
  }
  if (mode === "keyword") {
    const keywords = String(data.keywords || "").trim();
    return `#${nodeId} ${keywords || t("workflow.tester.nodeValueEmpty")}`;
  }
  if (mode === "button") {
    const buttonId = String(data.button_id ?? data.target_button_id ?? "").trim();
    return `#${nodeId} ${buttonId || t("workflow.tester.nodeValueEmpty")}`;
  }
  const summary = String(data.event || data.type || data.name || "").trim();
  return summary ? `#${nodeId} ${summary}` : `#${nodeId}`;
};

const workflowTestTriggerNodeOptions = computed(() => {
  if (workflowTest.mode === "workflow") {
    return [];
  }
  const targetActionId = `trigger_${workflowTest.mode}`;
  const nodes = (currentWorkflow.value?.nodes || {}) as Record<string, WorkflowNodeLike>;
  const options: Array<{ label: string; value: string }> = [];
  for (const [nodeId, node] of Object.entries(nodes)) {
    const actionId = String(node?.action_id || "");
    if (actionId !== targetActionId) {
      continue;
    }
    const data = (node?.data || {}) as Record<string, unknown>;
    options.push({
      label: describeTriggerNode(workflowTest.mode, String(nodeId), data),
      value: String(nodeId),
    });
  }
  return options;
});

const getWorkflowNodeById = (nodeId: string) => {
  const nodes = (currentWorkflow.value?.nodes || {}) as Record<string, WorkflowNodeLike>;
  return nodes[nodeId] || null;
};

watch(
  () => workflowTestModeOptions.value.map((item) => String(item.value)).join(","),
  () => {
    const validModes = workflowTestModeOptions.value.map((item) => String(item.value));
    if (!validModes.includes(workflowTest.mode)) {
      workflowTest.mode = "workflow";
    }
  },
  { immediate: true }
);

const applyWorkflowTestDefaults = () => {
  const options = workflowTestTriggerNodeOptions.value;
  if (workflowTest.mode === "workflow") {
    workflowTest.triggerNodeId = "";
    return;
  }
  const optionValues = options.map((option) => String(option.value));
  if (!optionValues.length) {
    workflowTest.triggerNodeId = "";
    return;
  }
  if (!workflowTest.triggerNodeId || !optionValues.includes(workflowTest.triggerNodeId)) {
    workflowTest.triggerNodeId = String(options[0].value);
  }
  const node = getWorkflowNodeById(workflowTest.triggerNodeId);
  if (!node) {
    return;
  }
  const data = (node.data || {}) as Record<string, unknown>;
  if (workflowTest.mode === "command" && !workflowTest.commandText) {
    const command = String(data.command || "").trim();
    if (command) {
      workflowTest.commandText = command.startsWith("/") ? command : `/${command}`;
    }
  }
  if (workflowTest.mode === "keyword" && !workflowTest.keywordText) {
    const keywords = String(data.keywords || "").trim();
    if (keywords) {
      workflowTest.keywordText = keywords.split(",")[0].trim();
    }
  }
  if (workflowTest.mode === "button" && !workflowTest.buttonId) {
    const buttonId = String(data.button_id ?? data.target_button_id ?? "").trim();
    if (buttonId) {
      workflowTest.buttonId = buttonId;
    }
  }
};

watch(
  () => [props.workflowId, workflowTest.mode, workflowTestTriggerNodeOptions.value.map((item) => item.value).join(",")],
  () => {
    applyWorkflowTestDefaults();
  },
  { immediate: true }
);

watch(
  () => workflowTest.triggerNodeId,
  () => {
    applyWorkflowTestDefaults();
  }
);

const formatJson = (value: unknown) => {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const runWorkflowTest = async () => {
  if (!props.workflowId) {
    showInfoModal(t("workflow.tester.noWorkflow"), true);
    return;
  }
  const mode = workflowTest.mode;
  const payload: Record<string, unknown> = {
    preview: true,
    trigger_mode: mode,
  };
  if (workflowTest.triggerNodeId) {
    payload.trigger_node_id = workflowTest.triggerNodeId;
  }
  if (mode === "command") {
    const commandText = String(workflowTest.commandText || "").trim();
    if (!commandText) {
      showInfoModal(t("workflow.tester.missingCommandText"), true);
      return;
    }
    payload.command_text = commandText;
  } else if (mode === "keyword") {
    const keywordText = String(workflowTest.keywordText || "").trim();
    if (!keywordText) {
      showInfoModal(t("workflow.tester.missingKeywordText"), true);
      return;
    }
    payload.message_text = keywordText;
  } else if (mode === "button") {
    const buttonId = String(workflowTest.buttonId || "").trim();
    if (!buttonId && !workflowTest.triggerNodeId) {
      showInfoModal(t("workflow.tester.missingButtonId"), true);
      return;
    }
    if (buttonId) {
      payload.button_id = buttonId;
    }
  }
  workflowTest.running = true;
  try {
    if (props.saveWorkflowBeforeRun) {
      await props.saveWorkflowBeforeRun({ silentSuccess: true });
    }
    const response = await apiJson<WorkflowTestResponse>(`/api/workflows/${encodeURIComponent(props.workflowId)}/test`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    workflowTest.last = response;
    workflowTest.showResult = true;
  } catch (error: unknown) {
    showInfoModal(t("workflow.tester.runFailed", { error: getErrorMessage(error) }), true);
  } finally {
    workflowTest.running = false;
  }
};

const openWorkflowTestResult = () => {
  if (!workflowTest.last) {
    showInfoModal(t("workflow.tester.empty"), true);
    return;
  }
  workflowTest.showResult = true;
};
</script>

<style scoped>
.workflow-tester-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
