import { ref, watch, Ref } from 'vue';
import { apiJson } from '../../services/api'; // Adjust path
import { useI18n } from '../../i18n';
import type { DrawflowEditor } from './useDrawflow';

export function useWorkflowManager(
    store: any,
    editorRef: Ref<DrawflowEditor | null>
) {
    const { t } = useI18n();
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
                const data = typeof wf.data === 'string' ? JSON.parse(wf.data) : wf.data;
                editorRef.value.import(data || { drawflow: { Home: { data: {} } } });
            } catch (e) {
                console.error("Failed to parse workflow data", e);
                (window as any).showInfoModal(t("workflow.jsonParseFailed", { error: String(e) }), true);
            }
        }
    };

    const createWorkflow = async () => {
        const id = await generateId('workflow');
        const name = t("workflow.defaultName") || "新工作流";
        store.state.workflows[id] = {
            id,
            name,
            data: { drawflow: { Home: { data: {} } } },
            description: ""
        };
        // Switch to it
        loadWorkflowIntoEditor(id);
        (window as any).showInfoModal(t("workflow.legacy.newWorkflowConfirmTitle") || "工作流已创建");
    };

    const saveWorkflow = async () => {
        if (!currentWorkflowId.value || !editorRef.value) return;

        try {
            const exportData = editorRef.value.export();
            store.state.workflows[currentWorkflowId.value] = {
                id: currentWorkflowId.value,
                name: workflowName.value,
                description: workflowDescription.value,
                data: exportData
            };

            // Persist to server
            const editor = (window as any).tgButtonEditor; // Compatibility
            if (editor && editor.saveCurrentWorkflow) {
                // If we are keeping legacy compatibility or just save directly via API?
                // App.vue uses `saveAll` which calls `apiJson("/api/workflows")` to get updated list?
                // No, App.vue `saveAll` sends `store.state` ?? No.
                // Let's check App.vue's saveAll.
                // It calls `editor.saveCurrentWorkflow` then `apiJson("/api/workflows")`.
                // Wait, `apiJson("/api/workflows")` is GET.
                // Where is the PUT/POST? 
                // Ah, App.vue `saveAll` calls `store.saveState()`.

                // So we just need to update the store state.
            }

            await store.saveState(); // Assuming store has this method
            (window as any).showInfoModal(t("workflow.legacy.saveSuccess", { name: workflowName.value }) || "保存成功");
        } catch (e: any) {
            console.error(e);
            (window as any).showInfoModal(t("workflow.legacy.saveFailed", { error: e.message }) || "保存失败", true);
        }
    };

    const deleteWorkflow = () => {
        if (!currentWorkflowId.value) return;

        (window as any).showConfirmModal(
            t("workflow.legacy.deleteWorkflowConfirmTitle") || "确认删除",
            t("workflow.legacy.deleteWorkflowConfirmMessage", { name: workflowName.value }) || `确定要删除工作流 "${workflowName.value}" 吗？`,
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
