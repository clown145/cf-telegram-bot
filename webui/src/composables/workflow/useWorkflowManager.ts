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

    const formatRefPathSuffix = (path: unknown): string => {
        const value = String(path || "").trim();
        if (!value) return "";
        if (value.startsWith(".") || value.startsWith("[")) return value;
        return `.${value}`;
    };

    const buildNodeRefExpression = (edge: any): string => {
        const sourceNode = String(edge?.source_node || "").trim();
        const sourceOutput = String(edge?.source_output || "").trim();
        if (!sourceNode || !sourceOutput) return "";
        return `{{ nodes.${sourceNode}.${sourceOutput}${formatRefPathSuffix(edge?.source_path)} }}`;
    };

    const migrateHiddenDataEdgesToRefs = (customData: any, existingContent: any) => {
        const existingEdges: any[] = Array.isArray(existingContent?.edges) ? existingContent.edges : [];
        const hiddenEdges = existingEdges.filter((edge) => edge && !isControlEdge(edge));
        let migrated = 0;

        for (const edge of hiddenEdges) {
            const targetNode = String(edge?.target_node || "").trim();
            const targetInput = String(edge?.target_input || "").trim();
            const refExpr = buildNodeRefExpression(edge);
            if (!targetNode || !targetInput || !refExpr) continue;
            const node = customData?.nodes?.[targetNode];
            if (!node) continue;
            node.data = node.data && typeof node.data === "object" && !Array.isArray(node.data)
                ? { ...node.data }
                : {};
            node.data[targetInput] = refExpr;
            migrated += 1;
        }

        return migrated;
    };

    const findControlFanoutConflict = (customData: any) => {
        const edges = Array.isArray(customData?.edges) ? (customData.edges as any[]) : [];
        const groups = new Map<string, Set<string>>();
        for (const edge of edges) {
            if (!isControlEdge(edge)) continue;
            const sourceNode = String(edge?.source_node || "").trim();
            const sourceOutput = String(edge?.source_output || "").trim() || CONTROL_TARGET_INPUT;
            const targetNode = String(edge?.target_node || "").trim();
            if (!sourceNode || !targetNode) continue;
            const key = `${sourceNode}::${sourceOutput}`;
            const targets = groups.get(key) || new Set<string>();
            targets.add(targetNode);
            groups.set(key, targets);
        }

        for (const [key, targets] of groups.entries()) {
            if (targets.size <= 1) continue;
            const [sourceNode, sourceOutput] = key.split("::");
            return {
                sourceNode,
                sourceOutput,
                targets: Array.from(targets).join(", "),
            };
        }
        return null;
    };

    const saveWorkflow = async (options?: { silentSuccess?: boolean }) => {
        if (!currentWorkflowId.value || !editorRef.value) return;
        const silentSuccess = Boolean(options?.silentSuccess);

        try {
            const exportData = editorRef.value.export();

            // Convert Drawflow format -> Custom backend format
            const customData = convertToCustomFormat(exportData);
            const fanoutConflict = findControlFanoutConflict(customData);
            if (fanoutConflict) {
                showInfoModal(
                    t("workflow.controlFanoutBlocked", {
                        source: fanoutConflict.sourceNode,
                        output: fanoutConflict.sourceOutput,
                        targets: fanoutConflict.targets,
                    }),
                    true
                );
                return;
            }

            // Legacy hidden data edges are migrated into explicit parameter refs.
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
            const migratedDataEdges = migrateHiddenDataEdgesToRefs(customData, existingContent);
            customData.edges = (customData.edges || []).filter((edge: any) => edge && isControlEdge(edge));

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
                if (migratedDataEdges > 0) {
                    showInfoModal(
                        t("workflow.saveSuccessWithDataRefMigration", {
                            name: workflowName.value,
                            count: migratedDataEdges,
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
