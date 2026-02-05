import { ref, watch, Ref } from 'vue';
import { apiJson } from '../../services/api'; // Adjust path
import { useI18n } from '../../i18n';
import type { DrawflowEditor } from './useDrawflow';
import { useWorkflowConverter } from './useWorkflowConverter';

export function useWorkflowManager(
    store: any,
    editorRef: Ref<DrawflowEditor | null>
) {
    const { t } = useI18n();
    const { convertToCustomFormat, convertToDrawflowFormat } = useWorkflowConverter();
    const currentWorkflowId = ref<string>('');
    const workflowName = ref('');
    const workflowDescription = ref('');

    const CONTROL_PORT_NAME = "__control__";
    const isControlFlowOutputName = (name: string) => {
        const v = String(name || '').trim();
        return v === "next" || v === "true" || v === "false" || v === "try" || v === "catch";
    };

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
                if (wf.data && typeof wf.data === 'object' && !wf.nodes) {
                    content = wf.data;
                } else if (typeof wf.data === 'string') {
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
                (window as any).showInfoModal(t("workflow.jsonParseFailed", { error: String(e) }), true);
            }
        }
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
        (window as any).showInfoModal(t("workflow.createSuccess"));
    };

    const saveWorkflow = async (options?: { silentSuccess?: boolean }) => {
        if (!currentWorkflowId.value || !editorRef.value) return;
        const silentSuccess = Boolean(options?.silentSuccess);

        try {
            const exportData = editorRef.value.export();

            // Convert Drawflow format -> Custom backend format
            const customData = convertToCustomFormat(exportData);

            // Preserve hidden (non-canvas) edges (data edges, legacy edges, etc.)
            const existingWf = store.state.workflows[currentWorkflowId.value];
            let existingContent: any = existingWf;
            if (existingWf?.data && typeof existingWf.data === 'object' && !existingWf.nodes) {
                existingContent = existingWf.data;
            } else if (typeof existingWf?.data === 'string') {
                try {
                    existingContent = JSON.parse(existingWf.data);
                } catch {
                    existingContent = existingWf;
                }
            }
            const existingEdges: any[] = Array.isArray(existingContent?.edges) ? existingContent.edges : [];
            const hiddenEdges = existingEdges.filter((e) => {
                if (!e) return false;
                if (e.target_input === CONTROL_PORT_NAME) return false;
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

            await store.saveState();
            if (!silentSuccess) {
                (window as any).showInfoModal(t("workflow.legacy.saveSuccess", { name: workflowName.value }));
            }
        } catch (e: any) {
            console.error(e);
            (window as any).showInfoModal(t("workflow.legacy.saveFailed", { error: e.message }), true);
        }
    };

    const deleteWorkflow = () => {
        if (!currentWorkflowId.value) return;

        (window as any).showConfirmModal(
            t("workflow.legacy.deleteWorkflowConfirmTitle"),
            t("workflow.legacy.deleteWorkflowConfirmMessage", { name: workflowName.value }),
            async () => {
                delete store.state.workflows[currentWorkflowId.value];
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
