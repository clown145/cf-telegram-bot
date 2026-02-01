import { shallowRef, onBeforeUnmount, nextTick } from 'vue';
import Drawflow from 'drawflow';
import 'drawflow/dist/drawflow.min.css';

// Minimal interface for Drawflow based on usage
export interface DrawflowEditor {
    precanvas: HTMLElement;
    zoom: number;
    zoom_max: number;
    zoom_min: number;
    zoom_value: number;
    zoom_refresh: () => void;
    start: () => void;
    addNode: (
        name: string,
        inputs: number,
        outputs: number,
        posx: number,
        posy: number,
        classOverride: string,
        data: any,
        html: string,
        typenode?: boolean
    ) => number;
    removeNodeId: (id: string) => void;
    getNodeFromId: (id: number | string) => any;
    updateNodeDataFromId: (id: number | string, data: any) => void;
    export: () => any;
    import: (data: any) => void;
    clear: () => void;
    on: (event: string, callback: (...args: any[]) => void) => void;
    removeListener: (event: string, callback: (...args: any[]) => void) => void;
    // Internal properties used in legacy/editor.ts
    container: HTMLElement;
    module: string;
}

export function useDrawflow() {
    const editor = shallowRef<DrawflowEditor | null>(null);

    const initEditor = async (container: HTMLElement) => {
        if (!container) return;

        // Ensure cleanup of previous instance if any (though usually managed by component lifecycle)
        if (editor.value) {
            // Drawflow doesn't have a destroy method in some versions, but we should verify.
            // Usually re-instantiating on the same container is fine if we cleared it?
            // Better to assume component unmount handles DOM cleanup.
        }

        const df = new Drawflow(container);

        // Standard Reroute setup if needed
        // df.reroute = true;

        df.start();
        editor.value = df as unknown as DrawflowEditor;

        return df;
    };

    const clearEditor = () => {
        if (editor.value) {
            editor.value.clear();
        }
    };

    return {
        editor,
        initEditor,
        clearEditor
    };
}
