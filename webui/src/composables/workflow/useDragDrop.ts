import { ref, Ref, onMounted, onBeforeUnmount } from 'vue';
import type { DrawflowEditor } from './useDrawflow';

export function useDragDrop(
    containerRef: Ref<HTMLElement | null>,
    editorRef: Ref<DrawflowEditor | null>,
    onAddNode: (action: any, x: number, y: number) => void
) {
    // --- HTML5 Drag & Drop (Desktop) ---
    const handleDragOver = (event: DragEvent) => {
        event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
        event.preventDefault();
        if (!editorRef.value || !event.dataTransfer) return;

        const actionStr = event.dataTransfer.getData('text/plain');
        if (actionStr) {
            try {
                const action = JSON.parse(actionStr);
                const { x, y } = calculateCanvasPosition(event.clientX, event.clientY);
                onAddNode(action, x, y);
            } catch (e) {
                console.error("Failed to parse node data on drop", e);
            }
        }
    };

    // --- Touch Drag (Mobile) ---
    const touchDragData = ref<any>(null);
    const touchDragOrigin = ref<{ x: number, y: number } | null>(null);
    const touchDragActive = ref(false);

    const calculateCanvasPosition = (clientX: number, clientY: number) => {
        const editor = editorRef.value;
        if (!editor) return { x: 0, y: 0 };

        // Drawflow uses `precanvas` for scaling reference
        const rect = editor.precanvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / editor.zoom,
            y: (clientY - rect.top) / editor.zoom
        };
    };

    const startTouchDrag = (event: TouchEvent, action: any) => {
        if (event.touches.length !== 1) return;
        touchDragData.value = action;
        touchDragOrigin.value = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        touchDragActive.value = false;
    };

    const updateTouchDrag = (touch: Touch) => {
        if (!touchDragData.value || !touchDragOrigin.value) return;

        if (!touchDragActive.value) {
            const dx = touch.clientX - touchDragOrigin.value.x;
            const dy = touch.clientY - touchDragOrigin.value.y;
            if (Math.hypot(dx, dy) > 10) {
                touchDragActive.value = true;
                document.body.classList.add('is-touch-dragging');
            }
        }
    };

    const finishTouchDrag = (touch: Touch | null) => {
        if (!touchDragData.value) return;

        document.body.classList.remove('is-touch-dragging');

        if (touchDragActive.value && touch && containerRef.value) {
            const rect = containerRef.value.getBoundingClientRect();
            if (
                touch.clientX >= rect.left &&
                touch.clientX <= rect.right &&
                touch.clientY >= rect.top &&
                touch.clientY <= rect.bottom
            ) {
                const { x, y } = calculateCanvasPosition(touch.clientX, touch.clientY);
                onAddNode(touchDragData.value, x, y);
            }
        }

        touchDragData.value = null;
        touchDragOrigin.value = null;
        touchDragActive.value = false;
    };

    // Global touch listeners
    const onGlobalTouchMove = (event: TouchEvent) => {
        if (!touchDragData.value) return;
        if (event.touches.length !== 1) return;

        const touch = event.touches[0];
        updateTouchDrag(touch);

        if (touchDragActive.value) {
            event.preventDefault();
        }
    };

    const onGlobalTouchEnd = (event: TouchEvent) => {
        if (!touchDragData.value) return;
        const touch = event.changedTouches[0];
        finishTouchDrag(touch);
    };

    const onGlobalTouchCancel = () => {
        if (!touchDragData.value) return;
        document.body.classList.remove('is-touch-dragging');
        touchDragData.value = null;
        touchDragOrigin.value = null;
        touchDragActive.value = false;
    };

    onMounted(() => {
        document.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
        document.addEventListener('touchend', onGlobalTouchEnd, { passive: true });
        document.addEventListener('touchcancel', onGlobalTouchCancel, { passive: true });
    });

    onBeforeUnmount(() => {
        document.removeEventListener('touchmove', onGlobalTouchMove);
        document.removeEventListener('touchend', onGlobalTouchEnd);
        document.removeEventListener('touchcancel', onGlobalTouchCancel);
    });

    return {
        handleDragOver,
        handleDrop,
        startTouchDrag
    };
}
