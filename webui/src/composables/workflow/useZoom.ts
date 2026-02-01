import { ref, Ref, onMounted, onBeforeUnmount, watch } from 'vue';
import type { DrawflowEditor } from './useDrawflow';

export function useZoom(
    editorRef: Ref<DrawflowEditor | null>,
    containerRef: Ref<HTMLElement | null>
) {
    const zoomValue = ref(1); // 1 = 100%

    const getZoomStep = (editor: DrawflowEditor) =>
        typeof editor.zoom_value === 'number' ? editor.zoom_value : 0.1;

    const getMinZoom = (editor: DrawflowEditor) =>
        typeof editor.zoom_min === 'number' ? editor.zoom_min : 0.2;

    const getMaxZoom = (editor: DrawflowEditor) =>
        typeof editor.zoom_max === 'number' ? editor.zoom_max : 2;

    const updateZoomDisplay = () => {
        if (editorRef.value) {
            zoomValue.value = editorRef.value.zoom;
        }
    };

    const setZoom = (targetZoom: number) => {
        const editor = editorRef.value;
        if (!editor) return;

        const clamped = Math.min(Math.max(targetZoom, getMinZoom(editor)), getMaxZoom(editor));
        editor.zoom = clamped;
        editor.zoom_refresh();
        updateZoomDisplay();
    };

    const zoomIn = () => {
        const editor = editorRef.value;
        if (editor) setZoom(editor.zoom + getZoomStep(editor));
    };

    const zoomOut = () => {
        const editor = editorRef.value;
        if (editor) setZoom(editor.zoom - getZoomStep(editor));
    };

    const resetZoom = () => {
        setZoom(1);
    };

    // Wheel Logic
    const handleWheel = (event: WheelEvent) => {
        const editor = editorRef.value;
        if (!editor) return;

        if (!event.ctrlKey && !event.metaKey) {
            return;
        }
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        setZoom(editor.zoom + direction * getZoomStep(editor));
    };

    // Pinch Logic
    const pinchState = {
        active: false,
        startDistance: 0,
        startZoom: 1
    };
    const PINCH_DAMPING = 0.6;

    const getTouchDistance = (touches: TouchList) => {
        if (touches.length < 2) return 0;
        const [a, b] = [touches[0], touches[1]];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const handleTouchStart = (event: TouchEvent) => {
        const editor = editorRef.value;
        if (!editor) return;

        if (event.touches.length === 2) {
            pinchState.active = true;
            pinchState.startDistance = getTouchDistance(event.touches);
            pinchState.startZoom = editor.zoom;
        }
    };

    const handleTouchMove = (event: TouchEvent) => {
        if (!pinchState.active || event.touches.length !== 2) return;

        const editor = editorRef.value;
        if (!editor) return;

        const currentDistance = getTouchDistance(event.touches);
        if (pinchState.startDistance <= 0 || currentDistance <= 0) return;

        const distanceRatio = currentDistance / pinchState.startDistance;
        const dampedRatio = Math.pow(distanceRatio, PINCH_DAMPING);
        const targetZoom = pinchState.startZoom * dampedRatio;

        setZoom(targetZoom);
        event.preventDefault();
    };

    const handleTouchEnd = (event: TouchEvent) => {
        if (event.touches.length < 2) {
            pinchState.active = false;
            pinchState.startDistance = 0;
        }
    };

    // Bind/Unbind listeners
    let boundContainer: HTMLElement | null = null;

    const bindEvents = (el: HTMLElement) => {
        if (boundContainer) unbindEvents();
        boundContainer = el;
        el.addEventListener('wheel', handleWheel, { passive: false });
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });
        el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    };

    const unbindEvents = () => {
        if (boundContainer) {
            boundContainer.removeEventListener('wheel', handleWheel);
            boundContainer.removeEventListener('touchstart', handleTouchStart);
            boundContainer.removeEventListener('touchmove', handleTouchMove);
            boundContainer.removeEventListener('touchend', handleTouchEnd);
            boundContainer.removeEventListener('touchcancel', handleTouchEnd);
            boundContainer = null;
        }
    };

    watch(containerRef, (el) => {
        if (el) bindEvents(el);
        else unbindEvents();
    });

    onBeforeUnmount(() => {
        unbindEvents();
    });

    return {
        zoomValue,
        zoomIn,
        zoomOut,
        resetZoom,
        updateZoomDisplay
    };
}
