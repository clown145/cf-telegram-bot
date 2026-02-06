<template>
  <div v-if="trace">
    <n-space vertical size="large">
      <n-card size="small" embedded :title="t('logs.detail.summary')">
        <n-descriptions bordered size="small" label-placement="left" :column="2">
          <n-descriptions-item :label="t('logs.table.id')" :span="2">
            <span class="mono">{{ trace.id }}</span>
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.table.workflow')">
            {{ trace.workflow_name || trace.workflow_id }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.table.status')">
            <n-tag size="small" :type="statusTagType(trace.status)">
              {{ statusLabel(trace.status) }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.table.time')" :span="2">
            {{ formatDate(trace.started_at) }} -> {{ formatDate(trace.finished_at) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.table.duration')">
            {{ formatDuration(trace.duration_ms) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.detail.triggerType')">
            {{ trace.trigger_type || "-" }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.table.chat')">
            <span class="mono">{{ trace.runtime?.chat_id || "-" }}</span>
          </n-descriptions-item>
          <n-descriptions-item :label="t('logs.table.user')">
            <span class="mono">{{ trace.runtime?.user_id || "-" }}</span>
          </n-descriptions-item>
          <n-descriptions-item v-if="trace.await_node_id" :label="t('logs.detail.awaitNode')" :span="2">
            <span class="mono">{{ trace.await_node_id }}</span>
          </n-descriptions-item>
          <n-descriptions-item v-if="trace.error" :label="t('logs.detail.error')" :span="2">
            <span class="error-text">{{ trace.error }}</span>
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <n-card v-if="failureSnapshot" size="small" embedded :title="t('logs.detail.failureSnapshot')">
        <n-space vertical size="medium">
          <n-descriptions bordered size="small" label-placement="left" :column="2">
            <n-descriptions-item :label="t('logs.detail.failureSource')">
              {{ failureSourceLabel(failureSnapshot.source) }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('logs.detail.failureAt')">
              {{ formatDate(failureSnapshot.at) }}
            </n-descriptions-item>
            <n-descriptions-item v-if="failureSnapshot.node_id" :label="t('logs.detail.failureNode')" :span="2">
              <span class="mono">{{ failureSnapshot.action_id || "-" }} ({{ failureSnapshot.node_id }})</span>
            </n-descriptions-item>
            <n-descriptions-item :label="t('logs.detail.error')" :span="2">
              <span class="error-text">{{ failureSnapshot.error }}</span>
            </n-descriptions-item>
          </n-descriptions>

          <n-grid cols="1 900:2" x-gap="12" y-gap="12">
            <n-grid-item v-if="failureSnapshot.rendered_params !== undefined">
              <div class="section-title">{{ t("logs.detail.inputs") }}</div>
              <n-code :code="formatJson(failureSnapshot.rendered_params)" language="json" word-wrap class="code-block" />
            </n-grid-item>
            <n-grid-item v-if="failureSnapshot.node_result !== undefined">
              <div class="section-title">{{ t("logs.detail.outputs") }}</div>
              <n-code :code="formatJson(failureSnapshot.node_result)" language="json" word-wrap class="code-block" />
            </n-grid-item>
            <n-grid-item v-if="failureSnapshot.runtime !== undefined">
              <div class="section-title">{{ t("logs.detail.failureRuntime") }}</div>
              <n-code :code="formatJson(failureSnapshot.runtime)" language="json" word-wrap class="code-block" />
            </n-grid-item>
            <n-grid-item v-if="failureSnapshot.trigger !== undefined">
              <div class="section-title">{{ t("logs.detail.failureTrigger") }}</div>
              <n-code :code="formatJson(failureSnapshot.trigger)" language="json" word-wrap class="code-block" />
            </n-grid-item>
          </n-grid>
        </n-space>
      </n-card>

      <n-card size="small" embedded :title="t('logs.detail.nodes')">
        <n-collapse>
          <n-collapse-item v-for="(node, idx) in trace.nodes || []" :key="idx" :name="String(idx)">
            <template #header>
              <div class="node-item-header">
                <n-tag size="small" :type="nodeStatusTagType(node.status)">{{ nodeStatusLabel(node.status) }}</n-tag>
                <span class="mono node-title">{{ node.action_id }}</span>
                <span class="muted mono">({{ node.node_id }})</span>
                <span class="muted">{{ formatDuration(node.duration_ms) }}</span>
                <span v-if="node.flow_output" class="muted">-> {{ node.flow_output }}</span>
              </div>
            </template>

            <n-space vertical size="medium">
              <n-tag v-if="node.error" size="small" type="error">{{ node.error }}</n-tag>

              <n-grid cols="1 900:2" x-gap="12" y-gap="12">
                <n-grid-item>
                  <div class="section-title">{{ t("logs.detail.inputs") }}</div>
                  <n-code
                    :code="formatJson(node.rendered_params)"
                    language="json"
                    word-wrap
                    class="code-block"
                  />
                </n-grid-item>
                <n-grid-item>
                  <div class="section-title">{{ t("logs.detail.outputs") }}</div>
                  <n-code
                    :code="formatJson(node.result)"
                    language="json"
                    word-wrap
                    class="code-block"
                  />
                </n-grid-item>
              </n-grid>
            </n-space>
          </n-collapse-item>
        </n-collapse>
      </n-card>

      <n-card size="small" embedded :title="t('logs.detail.finalResult')">
        <n-code :code="formatJson(trace.final_result)" language="json" word-wrap class="code-block" />
      </n-card>
    </n-space>
  </div>
  <div v-else class="muted-box">{{ emptyText || t("logs.detail.empty") }}</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  NCard,
  NCode,
  NCollapse,
  NCollapseItem,
  NDescriptions,
  NDescriptionsItem,
  NGrid,
  NGridItem,
  NSpace,
  NTag,
} from "naive-ui";
import { useI18n } from "../i18n";
import type { ObsExecutionStatus, ObsNodeStatus, ObsExecutionTrace } from "../types/observability";

const props = withDefaults(
  defineProps<{
    trace: ObsExecutionTrace | null;
    emptyText?: string;
  }>(),
  {
    emptyText: "",
  }
);

const { t, locale } = useI18n();
const trace = computed(() => props.trace);
const emptyText = computed(() => props.emptyText);
const failureSnapshot = computed(() => trace.value?.failure_snapshot || null);

const statusLabel = (status: ObsExecutionStatus) => {
  if (status === "success") return t("logs.status.success");
  if (status === "pending") return t("logs.status.pending");
  return t("logs.status.error");
};

const statusTagType = (status: ObsExecutionStatus) => {
  if (status === "success") return "success";
  if (status === "pending") return "warning";
  return "error";
};

const nodeStatusLabel = (status: ObsNodeStatus) => {
  if (status === "success") return t("logs.status.success");
  if (status === "pending") return t("logs.status.pending");
  if (status === "skipped") return t("logs.status.skipped");
  return t("logs.status.error");
};

const nodeStatusTagType = (status: ObsNodeStatus) => {
  if (status === "success") return "success";
  if (status === "pending") return "warning";
  if (status === "skipped") return "default";
  return "error";
};

const failureSourceLabel = (source: "node" | "workflow") => {
  if (source === "node") return t("logs.detail.failureSourceNode");
  return t("logs.detail.failureSourceWorkflow");
};

const formatDate = (ms?: number) => {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString(locale.value);
  } catch {
    return String(ms);
  }
};

const formatDuration = (ms?: number) => {
  if (ms === undefined || ms === null) return "-";
  if (!Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(2)} s`;
  const min = Math.floor(sec / 60);
  const rest = sec - min * 60;
  return `${min}m ${rest.toFixed(1)}s`;
};

const formatJson = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
</script>

<style scoped>
.muted {
  opacity: 0.78;
}

.muted-box {
  padding: 14px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  opacity: 0.8;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.error-text {
  color: #ff6b6b;
}

.node-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 30px;
}

.node-title {
  font-weight: 600;
}

.section-title {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 8px;
}

.code-block {
  border-radius: 12px;
}
</style>
