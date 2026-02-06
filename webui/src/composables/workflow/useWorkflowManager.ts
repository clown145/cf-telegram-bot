import { ref, Ref } from "vue";
import { apiJson } from '../../services/api'; // Adjust path
import { showConfirmModal, showInfoModal } from "../../services/uiBridge";
import { useI18n } from '../../i18n';
import type { DrawflowEditor } from './useDrawflow';
import { useWorkflowConverter } from './useWorkflowConverter';
import { CONTROL_INPUT_NAMES, isControlFlowOutputName } from "./constants";

export function useWorkflowManager(
    store: any,
    editorRef: Ref<DrawflowEditor | null>
) {
    const { t } = useI18n();
    const { convertToCustomFormat, convertToDrawflowFormat } = useWorkflowConverter();
    const BUTTON_TRIGGER_ACTION_ID = "trigger_button";
    const CONTROL_TARGET_INPUT = "__control__";
    const currentWorkflowId = ref<string>('');
    const workflowName = ref('');
    const workflowDescription = ref('');

    // Helpers
    const generateId = async (type: string) => {
        try {
            const res = await apiJson<{ id: string }>('/api/util/ids', {
                method: 'POST',
                body: JSON.stringify({ type })
            });
            return res.id;
        } catch {
            return `${type}-${Date.now().toString(36)}`;
        }
    };

    const loadWorkflowIntoEditor = (id: string) => {
        if (!editorRef.value || !id) return;
        const wf = store.state.workflows[id];
        if (wf) {
            currentWorkflowId.value = id;
            workflowName.value = wf.name || '';
            workflowDescription.value = wf.description || '';

            try {
                // Determine if we need to convert from custom format
                // Try from root (standard) or from .data (incorrect new format)
                let content = wf;
                const hasCanonicalTopLevel =
                    wf.nodes &&
                    typeof wf.nodes === "object" &&
                    !Array.isArray(wf.nodes) &&
                    Array.isArray((wf as any).edges);
                if (wf.data && typeof wf.data === 'object' && !hasCanonicalTopLevel) {
                    content = wf.data;
                } else if (typeof wf.data === 'string' && !hasCanonicalTopLevel) {
                    content = JSON.parse(wf.data);
                }

                let dfData;
                if (content && content.nodes && !content.drawflow) {
                    // Custom format -> Drawflow format
                    const palette = store.buildActionPalette ? store.buildActionPalette() : {};
                    dfData = convertToDrawflowFormat(content, palette);
                } else {
                    // Already Drawflow format or empty
                    dfData = content || { drawflow: { Home: { data: {} } } };
                    if (!dfData.drawflow && (dfData as any).nodes) {
                        // Fallback if content was wf but convertToDrawflowFormat wasn't called
                        const palette = store.buildActionPalette ? store.buildActionPalette() : {};
                        dfData = convertToDrawflowFormat(content, palette);
                    }
                }

                editorRef.value.import(dfData);
            } catch (e) {
                console.error("Failed to parse workflow data", e);
                showInfoModal(t("workflow.jsonParseFailed", { error: String(e) }), true);
            }
        }
    };

    const normalizeButtonIdFromTrigger = (raw: unknown): string => {
        const value = String(raw || "").trim();
        if (!value) return "";
        const prefixes = ["tgbtn:wf:", "tgbtn:cmd:", "tgbtn:act:"];
        for (const prefix of prefixes) {
            if (value.startsWith(prefix)) {
                return value.slice(prefix.length).trim();
            }
        }
        return value;
    };

    const syncWorkflowButtonBindingsFromTriggers = () => {
        const bindings = new Map<string, { workflowId: string; priority: number }>();
        const workflows = store.state.workflows || {};

        Object.entries(workflows).forEach(([workflowId, workflowRaw]) => {
            const workflow = workflowRaw as any;
            const nodes = (workflow?.nodes || {}) as Record<string, any>;
            Object.values(nodes).forEach((node) => {
                if (String(node?.action_id || "") !== BUTTON_TRIGGER_ACTION_ID) {
                    return;
                }
                const data = (node?.data || {}) as Record<string, unknown>;
                const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
                if (!enabled) {
                    return;
                }
                const buttonId = normalizeButtonIdFromTrigger(data.button_id ?? data.target_button_id);
                if (!buttonId) {
                    return;
                }
                const priorityRaw = Number(data.priority);
                const priority = Number.isFinite(priorityRaw) ? priorityRaw : 100;
                const current = bindings.get(buttonId);
                if (!current || priority >= current.priority) {
                    bindings.set(buttonId, { workflowId: String(workflowId), priority });
                }
            });
        });

        Object.values(store.state.buttons || {}).forEach((button: any) => {
            if (String(button?.type || "").toLowerCase() !== "workflow") {
                return;
            }
            const payload = { ...(button.payload || {}) } as Record<string, unknown>;
            const mappedWorkflowId = bindings.get(String(button.id || ""))?.workflowId || "";
            const currentWorkflowId = String(payload.workflow_id || "").trim();
            if (currentWorkflowId === mappedWorkflowId) {
                return;
            }
            payload.workflow_id = mappedWorkflowId;
            button.payload = payload;
        });
    };

    const createWorkflow = async () => {
        const id = await generateId('workflow');
        const name = t("workflow.defaultName");
        store.state.workflows[id] = {
            id,
            name,
            nodes: {},
            edges: [],
            description: ""
        };
        // Switch to it
        loadWorkflowIntoEditor(id);
        showInfoModal(t("workflow.createSuccess"));
    };

    const isControlEdge = (edge: any) => {
        if (!edge) return false;
        const targetInput = String(edge.target_input || "").trim();
        const sourceOutput = String(edge.source_output || "").trim();
        if (CONTROL_INPUT_NAMES.has(targetInput)) return true;
        return isControlFlowOutputName(sourceOutput);
    };

    const getPreferredControlOutputName = (actionId: string, palette: Record<string, any>): string => {
        const action = palette[String(actionId || "").trim()];
        const outputs = Array.isArray(action?.outputs) ? action.outputs : [];
        const flowNames = outputs
            .filter((output: any) => String(output?.type || "").trim().toLowerCase() === "flow")
            .map((output: any) => String(output?.name || "").trim())
            .filter(Boolean);
        if (!flowNames.length) {
            return CONTROL_TARGET_INPUT;
        }
        if (flowNames.includes(CONTROL_TARGET_INPUT)) {
            return CONTROL_TARGET_INPUT;
        }
        if (flowNames.includes("next")) {
            return "next";
        }
        return flowNames[0];
    };

    const sortControlEdgesByTargetPosition = (edges: any[], nodes: Record<string, any>) => {
        const getPos = (nodeId: string) => {
            const node = nodes[String(nodeId || "").trim()];
            const yRaw = Number(node?.position?.y);
            const xRaw = Number(node?.position?.x);
            const y = Number.isFinite(yRaw) ? yRaw : 0;
            const x = Number.isFinite(xRaw) ? xRaw : 0;
            return { x, y };
        };
        return edges.slice().sort((a, b) => {
            const ap = getPos(String(a?.target_node || ""));
            const bp = getPos(String(b?.target_node || ""));
            if (ap.y !== bp.y) {
                return ap.y - bp.y;
            }
            if (ap.x !== bp.x) {
                return ap.x - bp.x;
            }
            return String(a?.target_node || "").localeCompare(String(b?.target_node || ""));
        });
    };

    const autoRepairControlFanout = (customData: any) => {
        const nodes = (customData?.nodes || {}) as Record<string, any>;
        const edges = Array.isArray(customData?.edges) ? (customData.edges as any[]) : [];
        if (!edges.length) {
            return { repairedGroups: 0, rewiredEdges: 0 };
        }

        const palette = store.buildActionPalette ? store.buildActionPalette() : {};
        const controlGroups = new Map<string, any[]>();
        edges.forEach((edge) => {
            if (!isControlEdge(edge)) return;
            const sourceNode = String(edge?.source_node || "").trim();
            const sourceOutput = String(edge?.source_output || "").trim();
            if (!sourceNode || !sourceOutput) return;
            const key = `${sourceNode}::${sourceOutput}`;
            const group = controlGroups.get(key) || [];
            group.push(edge);
            controlGroups.set(key, group);
        });

        let repairedGroups = 0;
        let rewiredEdges = 0;

        for (const group of controlGroups.values()) {
            if (group.length <= 1) continue;
            const sorted = sortControlEdgesByTargetPosition(group, nodes);
            let previousTarget = String(sorted[0]?.target_node || "").trim();
            if (!previousTarget) continue;

            sorted[0].target_input = CONTROL_TARGET_INPUT;
            repairedGroups += 1;

            for (let i = 1; i < sorted.length; i += 1) {
                const edge = sorted[i];
                const targetNode = String(edge?.target_node || "").trim();
                if (!targetNode) continue;
                const previousActionId = String(nodes[previousTarget]?.action_id || "").trim();
                const outputName = getPreferredControlOutputName(previousActionId, palette);
                edge.source_node = previousTarget;
                edge.source_output = outputName;
                edge.target_input = CONTROL_TARGET_INPUT;
                edge.id = `edge-auto-${previousTarget}-${targetNode}-${outputName}-${i}`;
                previousTarget = targetNode;
                rewiredEdges += 1;
            }
        }

        return { repairedGroups, rewiredEdges };
    };

    const saveWorkflow = async (options?: { silentSuccess?: boolean }) => {
        if (!currentWorkflowId.value || !editorRef.value) return;
        const silentSuccess = Boolean(options?.silentSuccess);

        try {
            const exportData = editorRef.value.export();

            // Convert Drawflow format -> Custom backend format
            const customData = convertToCustomFormat(exportData);
            const repairStats = autoRepairControlFanout(customData);

            // Preserve hidden (non-canvas) edges (data edges, legacy edges, etc.)
            const existingWf = store.state.workflows[currentWorkflowId.value];
            let existingContent: any = existingWf;
            const hasCanonicalTopLevel =
                existingWf?.nodes &&
                typeof existingWf.nodes === "object" &&
                !Array.isArray(existingWf.nodes) &&
                Array.isArray(existingWf?.edges);
            if (existingWf?.data && typeof existingWf.data === 'object' && !hasCanonicalTopLevel) {
                existingContent = existingWf.data;
            } else if (typeof existingWf?.data === 'string' && !hasCanonicalTopLevel) {
                try {
                    existingContent = JSON.parse(existingWf.data);
                } catch {
                    existingContent = existingWf;
                }
            }
            const existingEdges: any[] = Array.isArray(existingContent?.edges) ? existingContent.edges : [];
            const hiddenEdges = existingEdges.filter((e) => {
                if (!e) return false;
                if (CONTROL_INPUT_NAMES.has(String(e.target_input || ""))) return false;
                if (isControlFlowOutputName(e.source_output)) return false;
                return true;
            });
            customData.edges = [...(customData.edges || []), ...hiddenEdges];

            store.state.workflows[currentWorkflowId.value] = {
                ...customData,
                id: currentWorkflowId.value,
                name: workflowName.value,
                description: workflowDescription.value
            };

            // Keep ButtonsView workflow binding in sync with trigger_button source-of-truth.
            syncWorkflowButtonBindingsFromTriggers();

            await store.saveState();
            if (!silentSuccess) {
                if (repairStats.repairedGroups > 0) {
                    showInfoModal(
                        t("workflow.saveSuccessWithRepair", {
                            name: workflowName.value,
                            groups: repairStats.repairedGroups,
                            edges: repairStats.rewiredEdges,
                        })
                    );
                } else {
                    showInfoModal(t("workflow.legacy.saveSuccess", { name: workflowName.value }));
                }
            }
        } catch (e: any) {
            console.error(e);
            showInfoModal(t("workflow.legacy.saveFailed", { error: e.message }), true);
        }
    };

    const deleteWorkflow = () => {
        if (!currentWorkflowId.value) return;

        showConfirmModal(
            t("workflow.legacy.deleteWorkflowConfirmTitle"),
            t("workflow.legacy.deleteWorkflowConfirmMessage", { name: workflowName.value }),
            async () => {
                delete store.state.workflows[currentWorkflowId.value];
                syncWorkflowButtonBindingsFromTriggers();
                await store.saveState();

                // Switch to another or empty
                const ids = Object.keys(store.state.workflows);
                if (ids.length > 0) {
                    loadWorkflowIntoEditor(ids[0]);
                } else {
                    editorRef.value?.clear();
                    currentWorkflowId.value = '';
                    workflowName.value = '';
                }
            }
        );
    };

    return {
        currentWorkflowId,
        workflowName,
        workflowDescription,
        loadWorkflowIntoEditor,
        createWorkflow,
        saveWorkflow,
        deleteWorkflow
    };
}
