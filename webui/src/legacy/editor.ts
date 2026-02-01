// @ts-nocheck
import Drawflow from "drawflow";
import { t, getLocale } from "../i18n";

export function initWorkflowEditor() {
    const container = document.getElementById('drawflow');
    if (!container) {
        console.error('Drawflow container #drawflow not found!');
        return;
    }

    const editor = new Drawflow(container);
    editor.start();

    // --- 画布缩放控制 ---
    const zoomOutBtn = document.getElementById('workflowZoomOut');
    const zoomInBtn = document.getElementById('workflowZoomIn');
    const zoomResetBtn = document.getElementById('workflowZoomReset');
    const zoomDisplay = document.getElementById('workflowZoomValue');

    const getZoomStep = () => (typeof editor.zoom_value === 'number' ? editor.zoom_value : 0.1);
    const getMinZoom = () => (typeof editor.zoom_min === 'number' ? editor.zoom_min : 0.2);
    const getMaxZoom = () => (typeof editor.zoom_max === 'number' ? editor.zoom_max : 2);

    const updateZoomDisplay = (zoomValue = editor.zoom) => {
        if (zoomDisplay) {
            zoomDisplay.textContent = `${Math.round(zoomValue * 100)}%`;
        }
    };

    const originalZoomRefresh = editor.zoom_refresh.bind(editor);
    editor.zoom_refresh = function zoomRefreshWithDisplay() {
        originalZoomRefresh();
        updateZoomDisplay(this.zoom);
    };
    updateZoomDisplay(editor.zoom);

    const setZoom = (targetZoom) => {
        const clamped = Math.min(Math.max(targetZoom, getMinZoom()), getMaxZoom());
        editor.zoom = clamped;
        editor.zoom_refresh();
    };

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => setZoom(editor.zoom + getZoomStep()));
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => setZoom(editor.zoom - getZoomStep()));
    }
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => setZoom(1));
    }

    container.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        setZoom(editor.zoom + direction * getZoomStep());
    }, { passive: false });

    const pinchState = {
        active: false,
        startDistance: 0,
        startZoom: editor.zoom
    };

    const resetPinchState = () => {
        pinchState.active = false;
        pinchState.startDistance = 0;
        pinchState.startZoom = editor.zoom;
    };

    const getTouchDistance = (touches) => {
        if (!touches || touches.length < 2) {
            return 0;
        }
        const [a, b] = touches;
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const PINCH_DAMPING = 0.6;

    container.addEventListener('touchstart', (event) => {
        if (event.touches && event.touches.length === 2) {
            pinchState.active = true;
            pinchState.startDistance = getTouchDistance(event.touches);
            pinchState.startZoom = editor.zoom;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (event) => {
        if (!pinchState.active || !event.touches || event.touches.length !== 2) {
            return;
        }

        const currentDistance = getTouchDistance(event.touches);
        if (pinchState.startDistance <= 0 || currentDistance <= 0) {
            return;
        }

        const distanceRatio = currentDistance / pinchState.startDistance;
        const dampedRatio = Math.pow(distanceRatio, PINCH_DAMPING);
        const targetZoom = pinchState.startZoom * dampedRatio;
        setZoom(targetZoom);
        event.preventDefault();
    }, { passive: false });

    container.addEventListener('touchend', (event) => {
        if (!event.touches || event.touches.length < 2) {
            resetPinchState();
        }
    });

    container.addEventListener('touchcancel', resetPinchState);

    const nodePalette = document.getElementById('node-palette');
    const nodePaletteList = document.getElementById('nodePaletteList');
    const nodePaletteSearchInput = document.getElementById('nodePaletteSearch');
    const uploadPaletteButton = document.getElementById('uploadModularActionBtn');
    const uploadPaletteInput = document.getElementById('nodePaletteUploadInput');
    const workflowEditorBody = document.querySelector('.workflow-editor-body');
    const workflowCanvasWrapper = document.querySelector('.workflow-canvas-wrapper');
    const workflowDescriptionButton = document.getElementById('editWorkflowDescriptionBtn');
    const workflowPalettePane = document.querySelector('.node-palette-pane');
    const workflowPaletteContainer = document.querySelector('.node-palette-container');
    const paletteCollapseButton = document.getElementById('nodePaletteCollapseBtn');
    const paletteCollapseLabel = paletteCollapseButton ? paletteCollapseButton.querySelector('.node-palette-collapse-label') : null;

    if (!nodePalette || !nodePaletteList) {
        console.error('Node palette container not found!');
        return;
    }
    if (!nodePaletteSearchInput) {
        console.warn(t("workflow.legacy.paletteSearchMissing"));
    }
    if (!uploadPaletteButton || !uploadPaletteInput) {
        console.warn(t("workflow.legacy.uploadControlMissing"));
    }

    // --- 认证与 API 辅助函数 ---
    const getAuthToken = () => localStorage.getItem('tg-button-auth-token');

    const fetchWithAuth = async (url, options = {}) => {
        const token = getAuthToken();
        const headers = new Headers(options.headers || {});
        if (token) {
            headers.append('X-Auth-Token', token);
        }

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('tg-button-auth-token');
                window.location.href = '/login';
                throw new Error(t("workflow.legacy.authFailed"));
            }
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        return response;
    };

    // --- 节点面板逻辑 ---
    let allAvailableActions = {};
    let secureUploadEnabled = false;
    let paletteSearchTerm = '';

    const escapeHTML = (str) => {
        if (!str) return '';
        return str.toString().replace(/[&<>"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match]));
    };

    const truncate = (str, maxLength) => {
        if (!str || str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + '...';
    };

    const calculateCanvasPosition = (clientX, clientY) => {
        const rect = editor.precanvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / editor.zoom,
            y: (clientY - rect.top) / editor.zoom
        };
    };

    const DEFAULT_TEMPLATE_BY_INPUT = {
        chat_id: "{{ runtime.chat_id }}",
        message_id: "{{ runtime.message_id }}",
        thread_id: "{{ runtime.thread_id }}",
        user_id: "{{ runtime.user_id }}",
        username: "{{ runtime.username }}",
        callback_data: "{{ runtime.callback_data }}",
        menu_id: "{{ runtime.variables.menu_id }}",
        button_id: "{{ runtime.variables.button_id }}",
    };

    const buildDefaultNodeData = (action) => {
        const defaults = {};
        (action.inputs || []).forEach((input) => {
            if (!input || !input.name) {
                return;
            }
            if (input.default !== undefined) {
                defaults[input.name] = input.default;
                return;
            }
            const template = DEFAULT_TEMPLATE_BY_INPUT[input.name];
            if (template) {
                defaults[input.name] = template;
            }
        });
        return defaults;
    };

    const addActionNode = (action, posX, posY) => {
        if (!action || !action.id) {
            console.warn(t("workflow.legacy.addNodeMissingAction"));
            return;
        }

        const numInputs = action.isModular ? (action.inputs || []).length : 1;
        const numOutputs = action.isModular ? (action.outputs || []).length : 1;

        const buildPortLabel = (label, cls, rawName = '') => {
            const baseName = label || rawName || '';
            const title = label && rawName && label !== rawName ? `${label} (${rawName})` : baseName;
            const truncated = truncate(baseName, 7);
            return `<div class="port-label ${cls}" title="${escapeHTML(title)}">${escapeHTML(truncated)}</div>`;
        };

        const inputsHTML = (action.inputs || []).map(input => buildPortLabel(getInputLabel(action, input), 'port-label-in', input.name)).join('');
        const outputsHTML = (action.outputs || []).map(output => buildPortLabel(getOutputLabel(action, output), 'port-label-out', output.name)).join('');

        const nodeContentHTML = `
            <div class="node-title" title="${escapeHTML(getActionDisplayName(action.id, action))}">${escapeHTML(getActionDisplayName(action.id, action))}</div>
            ${action.isModular ? `
            <div class="ports-wrapper">
                <div class="input-ports">${inputsHTML}</div>
                <div class="output-ports">${outputsHTML}</div>
            </div>
            ` : ''}
        `;

        const internalNodeData = {
            action: action,
            data: buildDefaultNodeData(action)
        };

        editor.addNode(
            action.id,
            Math.max(1, numInputs),
            Math.max(1, numOutputs),
            posX,
            posY,
            'workflow-node',
            internalNodeData,
            nodeContentHTML
        );
    };

    let touchDragData = null;
    let touchDragOrigin = null;
    let touchDragActive = false;

    function startTouchDrag(touch, action) {
        touchDragData = action;
        touchDragOrigin = { x: touch.clientX, y: touch.clientY };
        touchDragActive = false;
    }

    function updateTouchDrag(touch) {
        if (!touchDragData || !touchDragOrigin) {
            return;
        }
        if (!touchDragActive) {
            const dx = touch.clientX - touchDragOrigin.x;
            const dy = touch.clientY - touchDragOrigin.y;
            if (Math.hypot(dx, dy) > 10) {
                touchDragActive = true;
                document.body.classList.add('is-touch-dragging');
            }
        }
    }

    function finishTouchDrag(touch) {
        if (!touchDragData) {
            return;
        }

        document.body.classList.remove('is-touch-dragging');

        if (touchDragActive && touch) {
            const rect = container.getBoundingClientRect();
            if (
                touch.clientX >= rect.left &&
                touch.clientX <= rect.right &&
                touch.clientY >= rect.top &&
                touch.clientY <= rect.bottom
            ) {
                const { x, y } = calculateCanvasPosition(touch.clientX, touch.clientY);
                addActionNode(touchDragData, x, y);
            }
        }

        touchDragData = null;
        touchDragOrigin = null;
        touchDragActive = false;
    }

    document.addEventListener('touchmove', (event) => {
        if (!touchDragData) {
            return;
        }

        if (event.touches && event.touches.length !== 1) {
            return;
        }

        if (pinchState.active) {
            return;
        }

        const touch = event.touches && event.touches[0];
        if (!touch) {
            return;
        }
        updateTouchDrag(touch);
        if (touchDragActive) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchend', (event) => {
        if (!touchDragData) {
            return;
        }
        if (pinchState.active && event.touches && event.touches.length > 0) {
            return;
        }
        const touch = event.changedTouches && event.changedTouches[0];
        finishTouchDrag(touch);
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        if (!touchDragData) {
            return;
        }
        document.body.classList.remove('is-touch-dragging');
        touchDragData = null;
        touchDragOrigin = null;
        touchDragActive = false;
    }, { passive: true });

    const resolveI18nValue = (entry, fallback = '') => {
        if (!entry || typeof entry !== 'object') return fallback;
        const locale = getLocale();
        return entry[locale] || entry['zh-CN'] || entry['en-US'] || fallback;
    };

    const getActionDisplayName = (actionId, action) => {
        if (!action) return actionId || '';
        const localized = resolveI18nValue(action.i18n?.name, '');
        return localized || action.name || actionId || '';
    };

    const getActionDescription = (action) => {
        if (!action) return '';
        const localized = resolveI18nValue(action.i18n?.description, '');
        return localized || action.description || '';
    };

    const getInputLabel = (action, input) => {
        if (!action || !input) return input?.name || '';
        const localized = resolveI18nValue(action.i18n?.inputs?.[input.name]?.label, '');
        return localized || input.label || input.name || '';
    };

    const getOutputLabel = (action, output) => {
        if (!action || !output) return output?.name || '';
        const localized = resolveI18nValue(action.i18n?.outputs?.[output.name]?.label, '');
        return localized || output.label || output.name || '';
    };

    const createNodeElement = (actionId, action) => {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'palette-node';
        nodeElement.draggable = true;
        nodeElement.setAttribute('role', 'listitem');

        const displayName = getActionDisplayName(actionId, action);
        const safeDisplayName = escapeHTML(displayName);
        const fullDescription = getActionDescription(action) || t("workflow.legacy.noDescription");
        const truncatedDescription = truncate(fullDescription, 80);
        const safeDescription = escapeHTML(truncatedDescription);
        const safeDescriptionFull = escapeHTML(fullDescription);
        const safeActionId = escapeHTML(actionId);
        const downloadUrl = `/api/actions/modular/download/${encodeURIComponent(actionId)}`;
        const downloadFilename = escapeHTML(action.filename || `${actionId}.py`);

        nodeElement.innerHTML = `
            <div class="palette-node-header">
                <div class="palette-node-title" title="${safeDisplayName}">${safeDisplayName}</div>
                <div class="node-actions">
                    <a href="${downloadUrl}" download="${downloadFilename}" class="secondary node-action-btn download-action-btn" title="${escapeHTML(t("workflow.legacy.download"))}">&#x2B07;</a>
                    <a href="#" class="secondary node-action-btn delete-action-btn" data-action-id="${safeActionId}" data-action-name="${safeDisplayName}" title="${escapeHTML(t("workflow.legacy.delete"))}">&#x1F5D1;</a>
                </div>
            </div>
            <p class="palette-node-description" title="${safeDescriptionFull}">${safeDescription}</p>
            <div class="palette-node-footer">
                <span class="muted" title="${escapeHTML(t("workflow.legacy.actionId"))}">${safeActionId}</span>
            </div>
        `;

        nodeElement.addEventListener('dragstart', (event) => {
            if (event.target.closest('.node-action-btn')) {
                event.preventDefault();
                return;
            }
            if (event.dataTransfer) {
                event.dataTransfer.setData('text/plain', JSON.stringify(action));
            }
        });

        nodeElement.addEventListener('touchstart', (event) => {
            if (event.target.closest('.node-action-btn')) {
                return;
            }
            if (!event.touches || event.touches.length !== 1) {
                return;
            }
            if (pinchState.active) {
                return;
            }
            const touch = event.touches[0];
            startTouchDrag(touch, action);
        }, { passive: true });

        const downloadBtn = nodeElement.querySelector('.download-action-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                try {
                    const response = await fetchWithAuth(downloadUrl);
                    const blob = await response.blob();

                    const tempLink = document.createElement('a');
                    tempLink.href = URL.createObjectURL(blob);
                    tempLink.setAttribute('download', downloadBtn.getAttribute('download'));
                    document.body.appendChild(tempLink);
                    tempLink.click();
                    document.body.removeChild(tempLink);
                    URL.revokeObjectURL(tempLink.href);

                } catch (error) {
                    console.error(t("workflow.legacy.downloadFailed", { error: error.message || error }), error);
                    window.showInfoModal(t("workflow.legacy.downloadFailed", { error: error.message || error }), true);
                }
            });
        }

        const deleteBtn = nodeElement.querySelector('.delete-action-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const actionIdToDelete = deleteBtn.dataset.actionId;
                const actionNameToDelete = deleteBtn.dataset.actionName;
                const safeActionNameToDelete = escapeHTML(actionNameToDelete);

                const deleteAction = () => {
                    const performDelete = async (password) => {
                        try {
                            const fetchOptions = {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                            };
                            if (secureUploadEnabled) {
                                fetchOptions.body = JSON.stringify({ upload_password: password });
                            }

                            await fetchWithAuth(`/api/actions/modular/${encodeURIComponent(actionIdToDelete)}`, fetchOptions);
                            window.showInfoModal(t("workflow.legacy.deleteActionSuccess", { name: safeActionNameToDelete }));
                            setTimeout(() => window.location.reload(), 1500);
                        } catch (error) {
                            console.error(t("workflow.legacy.deleteActionFailed", { error: error.message || error }), error);
                            window.showInfoModal(t("workflow.legacy.deleteActionFailed", { error: error.message || error }), true);
                        }
                    };

                    if (secureUploadEnabled) {
                        window.showInputModal(
                            t("workflow.legacy.passwordRequired"),
                            t("workflow.legacy.deletePasswordPrompt"),
                            'password',
                            t("workflow.legacy.passwordPlaceholder"),
                            performDelete,
                            () => { console.log(t("workflow.legacy.deleteCancelled")); }
                        );
                    } else {
                        performDelete();
                    }
                };

                window.showConfirmModal(
                    t("workflow.legacy.deleteActionConfirmTitle"),
                    t("workflow.legacy.deleteActionConfirmMessage", { name: safeActionNameToDelete }),
                    deleteAction
                );
            });
        }

        return nodeElement;
    };

    const renderNodePalette = () => {
        nodePaletteList.innerHTML = '';

        if (!allAvailableActions || typeof allAvailableActions !== 'object') {
            nodePaletteList.innerHTML = `<div class="node-palette-empty">${escapeHTML(t("workflow.legacy.actionListInvalid"))}</div>`;
            return;
        }

        const modularActions = Object.entries(allAvailableActions).filter(([, action]) => action && action.isModular);

        const normalizedTerm = paletteSearchTerm.trim().toLowerCase();
        const filteredActions = modularActions
            .filter(([actionId, action]) => {
                if (!normalizedTerm) return true;
                const displayName = getActionDisplayName(actionId, action).toLowerCase();
                const description = (getActionDescription(action) || '').toLowerCase();
                return displayName.includes(normalizedTerm) || description.includes(normalizedTerm);
            })
            .sort(([idA, actionA], [idB, actionB]) => {
                const nameA = getActionDisplayName(idA, actionA);
                const nameB = getActionDisplayName(idB, actionB);
                const compare = nameA.localeCompare(nameB, 'zh-Hans-CN', { sensitivity: 'base' });
                if (compare !== 0) {
                    return compare;
                }
                return idA.localeCompare(idB, 'zh-Hans-CN', { sensitivity: 'base' });
            });

        if (filteredActions.length === 0) {
            if (normalizedTerm) {
                const safeTerm = escapeHTML(paletteSearchTerm);
                nodePaletteList.innerHTML = `<div class="node-palette-empty">${t("workflow.legacy.actionListEmptyFiltered", { term: safeTerm })}</div>`;
            } else {
                nodePaletteList.innerHTML = `<div class="node-palette-empty">${escapeHTML(t("workflow.legacy.actionListEmptyAll"))}</div>`;
            }
            return;
        }

        filteredActions.forEach(([actionId, action]) => {
            const actionWithId = { ...action, id: actionId };
            nodePaletteList.appendChild(createNodeElement(actionId, actionWithId));
        });
    };

    const populateNodePalette = (actions = {}, isSecure = false) => {
        allAvailableActions = actions || {};
        secureUploadEnabled = Boolean(isSecure);
        renderNodePalette();
    };

    if (nodePaletteSearchInput && !nodePaletteSearchInput.dataset.bound) {
        nodePaletteSearchInput.addEventListener('input', (event) => {
            paletteSearchTerm = event.target.value || '';
            renderNodePalette();
        });
        nodePaletteSearchInput.dataset.bound = 'true';
    }

    const bindUploadHandlers = () => {
        if (!uploadPaletteButton || !uploadPaletteInput) {
            return;
        }

        if (!uploadPaletteButton.dataset.bound) {
            uploadPaletteButton.addEventListener('click', () => uploadPaletteInput.click());
            uploadPaletteButton.dataset.bound = 'true';
        }

        if (!uploadPaletteInput.dataset.bound) {
            uploadPaletteInput.addEventListener('change', (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target.result;

                    const performUpload = async (password) => {
                        const payload = { filename: file.name, content };
                        const safeFileName = escapeHTML(file.name);
                        if (secureUploadEnabled) {
                            payload.upload_password = password;
                        }

                        try {
                            await fetchWithAuth('/api/actions/modular/upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            window.showInfoModal(t("workflow.legacy.uploadSuccess", { name: safeFileName }));
                            setTimeout(() => window.location.reload(), 1500);
                        } catch (error) {
                            console.error(t("workflow.legacy.uploadFailed", { error: error.message || error }), error);
                            window.showInfoModal(t("workflow.legacy.uploadFailed", { error: error.message || error }), true);
                        }
                    };

                    if (secureUploadEnabled) {
                        window.showInputModal(
                            t("workflow.legacy.passwordRequired"),
                            t("workflow.legacy.uploadPasswordPrompt"),
                            'password',
                            t("workflow.legacy.passwordPlaceholder"),
                            performUpload,
                            () => {
                                console.log(t("workflow.legacy.uploadCancelled"));
                            }
                        );
                    } else {
                        performUpload();
                    }
                };

                reader.readAsText(file);
                event.target.value = '';
            });
            uploadPaletteInput.dataset.bound = 'true';
        }
    };

    bindUploadHandlers();

    // --- 拖放逻辑 ---
    container.addEventListener('drop', (event) => {
        event.preventDefault();
        if (event.dataTransfer) {
            const actionStr = event.dataTransfer.getData('text/plain');
            if (actionStr) {
                try {
                    const action = JSON.parse(actionStr);
                    const { x, y } = calculateCanvasPosition(event.clientX, event.clientY);
                    addActionNode(action, x, y);

                } catch (e) {
                    console.error("Failed to parse node data on drop", e);
                }
            }
        }
    });
    container.addEventListener('dragover', (event) => event.preventDefault());

    // --- 保存和加载工作流逻辑 ---
    const workflowNameInput = document.getElementById('workflowNameInput');
    const workflowDescriptionInput = document.getElementById('workflowDescriptionInput');
    const newWorkflowBtn = document.getElementById('newWorkflowBtn');
    const workflowSelector = document.getElementById('workflowSelector');
    const deleteWorkflowBtn = document.getElementById('deleteWorkflowBtn');
    const saveWorkflowBtn = document.getElementById('saveWorkflowBtn');

    const setWorkflowDescription = (value = '') => {
        const normalized = (value === null || value === undefined) ? '' : String(value);
        if (workflowDescriptionInput) {
            workflowDescriptionInput.value = normalized;
        }
        if (workflowDescriptionButton) {
            const trimmed = normalized.trim();
            const sanitized = trimmed.replace(/\s+/g, ' ');
            workflowDescriptionButton.dataset.hasDescription = trimmed ? 'true' : 'false';
            workflowDescriptionButton.setAttribute(
                'title',
                trimmed
                    ? t("workflow.legacy.descriptionTitle", { description: sanitized })
                    : t("workflow.legacy.descriptionEmptyTitle")
            );
        }
    };

    setWorkflowDescription(workflowDescriptionInput ? workflowDescriptionInput.value : '');

    if (workflowDescriptionButton) {
        workflowDescriptionButton.addEventListener('click', () => {
            const currentValue = workflowDescriptionInput ? workflowDescriptionInput.value : '';
            if (typeof window.showInputModal === 'function') {
                window.showInputModal(
                    t("workflow.legacy.descriptionEditTitle"),
                    t("workflow.legacy.descriptionEditPrompt"),
                    'textarea',
                    t("workflow.legacy.descriptionEditPlaceholder"),
                    (value) => {
                        const nextValue = typeof value === 'string' ? value : '';
                        setWorkflowDescription(nextValue);
                    },
                    undefined,
                    { defaultValue: currentValue, rows: 5 }
                );
            } else {
                const fallback = window.prompt(t("workflow.legacy.descriptionPromptFallback"), currentValue);
                if (fallback !== null) {
                    setWorkflowDescription(fallback);
                }
            }
        });
    }

    const syncPaletteHeight = () => {
        if (!workflowPaletteContainer || !workflowCanvasWrapper) {
            return;
        }

        workflowPaletteContainer.style.height = '';
        workflowPaletteContainer.style.minHeight = '';
        workflowPaletteContainer.style.maxHeight = '';
        if (workflowPalettePane) {
            workflowPalettePane.style.maxHeight = '';
        }

        const isNarrow = window.matchMedia('(max-width: 960px)').matches;
        const isCollapsed = workflowEditorBody && workflowEditorBody.classList.contains('palette-collapsed');

        if (isCollapsed) {
            return;
        }

        const canvasHeight = workflowCanvasWrapper.getBoundingClientRect().height;
        if (canvasHeight > 0) {
            const verticalPadding = isNarrow ? 96 : 72;
            const availableHeight = Math.max(0, canvasHeight - verticalPadding);
            if (availableHeight > 0) {
                workflowPaletteContainer.style.maxHeight = `${availableHeight}px`;
                if (workflowPalettePane) {
                    workflowPalettePane.style.maxHeight = `${availableHeight}px`;
                }
            }
        } else {
            workflowPaletteContainer.style.maxHeight = '';
            if (workflowPalettePane) {
                workflowPalettePane.style.maxHeight = '';
            }
        }
    };

    const paletteCollapseStorageKey = 'workflow-palette-collapsed';

    const applyPaletteCollapse = (collapsed, skipAnimation = false) => {
        if (!workflowEditorBody || !paletteCollapseButton) {
            return;
        }

        if (skipAnimation) {
            workflowEditorBody.classList.add('palette-transition-skip');
        }

        workflowEditorBody.classList.toggle('palette-collapsed', Boolean(collapsed));
        paletteCollapseButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        paletteCollapseButton.setAttribute(
            'aria-label',
            collapsed ? t("workflow.legacy.paletteExpandAria") : t("workflow.legacy.paletteCollapseAria")
        );
        paletteCollapseButton.title = collapsed
            ? t("workflow.legacy.paletteExpandAria")
            : t("workflow.legacy.paletteCollapseAria");
        if (paletteCollapseLabel) {
            paletteCollapseLabel.textContent = collapsed
                ? t("workflow.legacy.paletteExpandLabel")
                : t("workflow.legacy.paletteCollapseLabel");
        }

        if (skipAnimation) {
            requestAnimationFrame(() => {
                workflowEditorBody.classList.remove('palette-transition-skip');
            });
        }

        requestAnimationFrame(syncPaletteHeight);
    };

    if (paletteCollapseButton && workflowEditorBody) {
        let defaultCollapsed = false;
        try {
            defaultCollapsed = localStorage.getItem(paletteCollapseStorageKey) === '1';
        } catch (error) {
            console.warn(t("workflow.legacy.paletteStateReadFailed"), error);
        }
        applyPaletteCollapse(defaultCollapsed, true);

        paletteCollapseButton.addEventListener('click', () => {
            const nextState = !(workflowEditorBody.classList.contains('palette-collapsed'));
            applyPaletteCollapse(nextState);
            try {
                localStorage.setItem(paletteCollapseStorageKey, nextState ? '1' : '0');
            } catch (error) {
                console.warn(t("workflow.legacy.paletteStateSaveFailed"), error);
            }
        });
    }

    syncPaletteHeight();
    if (typeof ResizeObserver === 'function' && workflowCanvasWrapper) {
        const resizeObserver = new ResizeObserver(() => syncPaletteHeight());
        resizeObserver.observe(workflowCanvasWrapper);
    }
    window.addEventListener('resize', () => {
        window.requestAnimationFrame(syncPaletteHeight);
    });
    window.addEventListener('workflowTabShown', () => {
        window.requestAnimationFrame(syncPaletteHeight);
    });

    const populateWorkflowSelector = async () => {
        try {
            const response = await fetchWithAuth('/api/workflows');
            if (!response.ok) throw new Error('Failed to fetch workflows');
            const workflows = await response.json();

            const selectedValue = workflowSelector.value;
            workflowSelector.innerHTML = `<option value="">${escapeHTML(t("workflow.legacy.workflowSelectPlaceholder"))}</option>`;

            Object.keys(workflows).forEach(id => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = (workflows[id] && workflows[id].name) ? workflows[id].name : id;
                workflowSelector.appendChild(option);
            });

            if (workflows[selectedValue]) {
                workflowSelector.value = selectedValue;
            }
        } catch (error) {
            console.error('Error populating workflow selector:', error);
        }
    };

    const saveWorkflow = async (isAutoSave = false) => {
        let workflowId = editor.currentWorkflowId;
        const workflowName = workflowNameInput.value.trim();
        const safeWorkflowName = escapeHTML(workflowName);
        const workflowDescription = workflowDescriptionInput.value.trim();

        if (!workflowName) {
            if (isAutoSave && !workflowId && editor.getNodesFromName("").length === 0) {
                 return Promise.resolve();
            }
            window.showInfoModal(t("workflow.legacy.workflowNameEmpty"), true);
            workflowNameInput.focus();
            return Promise.reject(new Error("Workflow name cannot be empty."));
        }

        // 如果是新工作流，则根据名称生成 ID。但如果 ID 已存在，则绝不更改。
        if (!workflowId) {
             let sanitizedId = workflowName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-._~]/g, '');
            if (!sanitizedId) {
                // 如果名称仅包含无效字符（如中文），
                // 则对原始名称进行编码以创建 URL 安全的 ID。
                sanitizedId = encodeURIComponent(workflowName.trim());
            }
            workflowId = sanitizedId;

            if (!workflowId) { // 最后检查一下，以防名称只是空格
                window.showInfoModal(t("workflow.legacy.workflowNameInvalid"), true);
                workflowNameInput.focus();
                return Promise.reject(new Error("Invalid workflow name."));
            }
        }

        const drawflowData = editor.export();

        // --- 转换为我们的自定义格式 ---
        const customFormat = {
            id: workflowId,
            name: workflowName,
            description: workflowDescription,
            nodes: {},
            edges: []
        };

        const dfNodes = (drawflowData.drawflow.Home || drawflowData.drawflow.main).data;
        for (const dfNodeId in dfNodes) {
            const dfNode = dfNodes[dfNodeId];
            const action = dfNode.data.action;

            if (!action) {
                console.warn(t("workflow.legacy.nodeMissingAction", { id: dfNodeId }));
                continue;
            }

            customFormat.nodes[dfNode.id] = {
                id: dfNode.id.toString(),
                action_id: action.id,
                position: { x: dfNode.pos_x, y: dfNode.pos_y },
                data: dfNode.data.data || {} // 持久化已配置的数据
            };

            for (const outputPort in dfNode.outputs) {
                const sourceOutputIndex = parseInt(outputPort.replace('output_', ''), 10) - 1;
                if (isNaN(sourceOutputIndex)) continue;

                dfNode.outputs[outputPort].connections.forEach(conn => {
                    const targetNode = dfNodes[conn.node];
                    if (!targetNode) return;

                    const targetInputIndex = parseInt(conn.output.replace('input_', ''), 10) - 1;
                    if (isNaN(targetInputIndex)) return;

                    const sourceOutputName = (action.outputs && action.outputs[sourceOutputIndex])
                        ? action.outputs[sourceOutputIndex].name
                        : `output_${sourceOutputIndex + 1}`;

                    const targetAction = targetNode.data.action;
                    const targetInputName = (targetAction && targetAction.inputs && targetAction.inputs[targetInputIndex])
                        ? targetAction.inputs[targetInputIndex].name
                        : `input_${targetInputIndex + 1}`;

                    customFormat.edges.push({
                        id: `edge-${dfNode.id}-${targetNode.id}-${sourceOutputIndex}-${targetInputIndex}`,
                        source_node: dfNode.id.toString(),
                        source_output: sourceOutputName,
                        target_node: targetNode.id.toString(),
                        target_input: targetInputName
                    });
                });
            }
        }
        // --- 转换结束 ---

        try {
            const response = await fetchWithAuth(`/api/workflows/${workflowId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customFormat) // 发送我们的新格式
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(t("workflow.legacy.saveFailed", { error: errorData.error }));
            }

            if (!isAutoSave) {
                window.showInfoModal(t("workflow.legacy.saveSuccess", { name: safeWorkflowName }));
            }

            editor.currentWorkflowId = workflowId;
            await populateWorkflowSelector();
            workflowSelector.value = workflowId;

            // 通知主应用工作流已更改
            window.dispatchEvent(new CustomEvent('workflowsUpdated'));

            return Promise.resolve();
        } catch (error) {
            console.error('Error saving workflow:', error);
            if (!isAutoSave) {
                window.showInfoModal(error.message, true);
            }
            return Promise.reject(error);
        }
    };

    const loadWorkflow = async (workflowId) => {
        if (!workflowId) return;
        try {
            const response = await fetchWithAuth(`/api/workflows/${workflowId}`);
            if (!response.ok) throw new Error(t("workflow.legacy.loadFailed"));
            const customData = await response.json();

            editor.clear();
            editor.currentWorkflowId = workflowId;
            workflowNameInput.value = customData.name || '';
            setWorkflowDescription(customData.description || '');

            // ID 映射：从自定义字符串 ID（例如，“node-1”）到 Drawflow 的内部整数 ID
            const nodeIdMap = new Map();

            // 步骤 1：添加所有节点并创建 ID 映射
            for (const customNodeId in customData.nodes) {
                const customNode = customData.nodes[customNodeId];
                const action = allAvailableActions[customNode.action_id];

                if (!action) {
                    console.warn(
                        t("workflow.legacy.actionDefinitionMissing", {
                            id: customNode.action_id,
                            nodeId: customNodeId,
                        })
                    );
                    continue;
                }

                const numInputs = action.isModular ? (action.inputs || []).length : 1;
                const numOutputs = action.isModular ? (action.outputs || []).length : 1;

                const inputsHTML = (action.inputs || []).map(input => {
                    const label = getInputLabel(action, input);
                    const title = label && label !== input.name ? `${label} (${input.name})` : label || input.name || '';
                    return `<div class="port-label port-label-in" title="${escapeHTML(title)}">${truncate(escapeHTML(label || input.name), 7)}</div>`;
                }).join('');
                const outputsHTML = (action.outputs || []).map(output => {
                    const label = getOutputLabel(action, output);
                    const title = label && label !== output.name ? `${label} (${output.name})` : label || output.name || '';
                    return `<div class="port-label port-label-out" title="${escapeHTML(title)}">${truncate(escapeHTML(label || output.name), 7)}</div>`;
                }).join('');

                const nodeContentHTML = `
                    <div class="node-title" title="${escapeHTML(getActionDisplayName(customNode.action_id, action))}">${escapeHTML(getActionDisplayName(customNode.action_id, action))}</div>
                    ${action.isModular ? `
                    <div class="ports-wrapper">
                        <div class="input-ports">${inputsHTML}</div>
                        <div class="output-ports">${outputsHTML}</div>
                    </div>
                    ` : ''}
                `;

                const internalNodeData = {
                    action: { ...action, id: customNode.action_id },
                    data: customNode.data || {} // 恢复已配置的数据
                };

                const drawflowId = editor.addNode(
                    customNode.action_id, // 节点名称
                    Math.max(1, numInputs),
                    Math.max(1, numOutputs),
                    customNode.position.x,
                    customNode.position.y,
                    'workflow-node',
                    internalNodeData,
                    nodeContentHTML,
                    false // 'typenode' -> false 表示使用 html 内容
                );

                nodeIdMap.set(customNode.id, drawflowId);
            }

            // 步骤 2：使用映射的 ID 添加所有连接
            (customData.edges || []).forEach(edge => {
                const sourceDrawflowId = nodeIdMap.get(edge.source_node);
                const targetDrawflowId = nodeIdMap.get(edge.target_node);

                if (sourceDrawflowId === undefined || targetDrawflowId === undefined) {
                    console.warn(t("workflow.legacy.connectionMissingNode", { edgeId: edge.id }));
                    return;
                }

                // 查找动作定义以获取正确的端口索引
                const sourceCustomNode = customData.nodes[edge.source_node];
                const targetCustomNode = customData.nodes[edge.target_node];

                if (!sourceCustomNode || !targetCustomNode) return;

                const sourceAction = allAvailableActions[sourceCustomNode.action_id];
                const targetAction = allAvailableActions[targetCustomNode.action_id];

                if (!sourceAction || !targetAction) return;

                const sourceOutputIndex = sourceAction.isModular
                    ? (sourceAction.outputs || []).findIndex(o => o.name === edge.source_output)
                    : (edge.source_output === 'output' ? 0 : -1); // 旧版动作的回退

                const targetInputIndex = targetAction.isModular
                    ? (targetAction.inputs || []).findIndex(i => i.name === edge.target_input)
                    : (edge.target_input === 'input' ? 0 : -1); // 旧版动作的回退

                if (sourceOutputIndex === -1 || targetInputIndex === -1) {
                    console.warn(t("workflow.legacy.connectionPortMissing", { edgeId: edge.id }));
                    return;
                }

                const sourcePort = `output_${sourceOutputIndex + 1}`;
                const targetPort = `input_${targetInputIndex + 1}`;

                editor.addConnection(sourceDrawflowId, targetDrawflowId, sourcePort, targetPort);
            });

        } catch (error) {
            console.error(`Failed to load workflow '${workflowId}':`, error);
            alert(t("workflow.legacy.loadWorkflowErrorAlert"));
        }
    };

    const deleteWorkflow = async () => {
        const workflowId = workflowSelector.value;
        if (!workflowId) return alert(t("workflow.legacy.deleteWorkflowSelectFirst"));

        const selectedOption = workflowSelector.querySelector(`option[value="${workflowId}"]`);
        const workflowNameToDelete = selectedOption ? selectedOption.textContent : workflowId;
        const safeWorkflowNameToDelete = escapeHTML(workflowNameToDelete);

        // 使用自定义确认模态框
        window.showConfirmModal(
            t("workflow.legacy.deleteWorkflowConfirmTitle"),
            t("workflow.legacy.deleteWorkflowConfirmMessage", { name: safeWorkflowNameToDelete }),
            async () => {
                // 此代码仅在用户单击“确认”时运行
                try {
                    const response = await fetchWithAuth(`/api/workflows/${workflowId}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: response.statusText }));
                        throw new Error(t("workflow.legacy.deleteActionFailed", { error: errorData.error || 'Unknown error' }));
                    }
                    window.showInfoModal(t("workflow.legacy.deleteWorkflowSuccess", { name: safeWorkflowNameToDelete }));

                    if (editor.currentWorkflowId === workflowId) {
                        editor.clear();
                        delete editor.currentWorkflowId;
                        workflowNameInput.value = '';
                        setWorkflowDescription('');
                    }
                    await populateWorkflowSelector();
                } catch (error) {
                    console.error(`Error deleting workflow '${workflowId}':`, error);
                    window.showInfoModal(error.message, true);
                }
            }
        );
    };

    const handleLoadWorkflow = () => {
        const workflowId = workflowSelector.value;
        const previousWorkflowId = editor.currentWorkflowId || "";
        if (workflowId) {
            const isDirty = (editor.getNodesFromName("").length > 0 || workflowNameInput.value) && editor.currentWorkflowId !== workflowId;
            if (isDirty) {
                window.showConfirmModal(
                    t("workflow.legacy.loadWorkflowConfirmTitle"),
                    t("workflow.legacy.loadWorkflowConfirmMessage"),
                    () => loadWorkflow(workflowId), // onConfirm：加载新的
                    () => { workflowSelector.value = previousWorkflowId; } // onCancel：恢复选择器
                );
            } else {
                loadWorkflow(workflowId); // 不脏，直接加载
            }
        }
    };

    // --- 节点配置的事件监听器 ---
    container.addEventListener('dblclick', (event) => {
        // 确保单击的是节点主体，而不是输入/输出端口。
        const target = event.target;
        if (target.closest('.drawflow-node') && !target.closest('.input') && !target.closest('.output')) {
            const nodeElement = target.closest('.drawflow-node');
            const nodeId = nodeElement.id.split('-')[1];

            if (nodeId) {
                const node = editor.getNodeFromId(nodeId);
                // 分派一个自定义事件，由主 UI 脚本处理
                container.dispatchEvent(new CustomEvent('opennodeconfig', {
                    bubbles: true,
                    detail: { node: node }
                }));
            }
        }
    });

    const handleNewWorkflow = () => {
        const isDirty = editor.getNodesFromName("").length > 0 || workflowNameInput.value;
        if (isDirty) {
            window.showConfirmModal(
                t("workflow.legacy.newWorkflowConfirmTitle"),
                t("workflow.legacy.newWorkflowConfirmMessage"),
                () => {
                    editor.clear();
                    delete editor.currentWorkflowId;
                    workflowSelector.value = ""; // 重置下拉菜单
                    workflowNameInput.value = "";
                    setWorkflowDescription('');
                }
            );
        } else {
            // 如果不脏，则无需确认即可清除
            editor.clear();
            delete editor.currentWorkflowId;
            workflowSelector.value = "";
            workflowNameInput.value = "";
            setWorkflowDescription('');
        }
    };

    newWorkflowBtn.addEventListener('click', handleNewWorkflow);
    workflowSelector.addEventListener('change', handleLoadWorkflow);
    deleteWorkflowBtn.addEventListener('click', deleteWorkflow);
    saveWorkflowBtn.addEventListener('click', () => saveWorkflow(false));

    // --- 为主应用暴露的全局函数 ---
    window.tgButtonEditor = {
        refreshPalette: (actions, isSecure) => populateNodePalette(actions, isSecure),
        refreshWorkflows: populateWorkflowSelector,
        saveCurrentWorkflow: () => saveWorkflow(true),
        updateNodeConfig: (nodeId, newData) => {
            const node = editor.getNodeFromId(nodeId);
            if (node && node.data) {
                // 更新用于配置的特定“data”属性
                const newInternalData = { ...node.data, data: newData };
                editor.updateNodeDataFromId(nodeId, newInternalData);
            } else {
                console.error(t("workflow.legacy.updateNodeConfigMissing", { id: nodeId }));
            }
        },
        getNodeById: (nodeId) => {
            try {
                return editor.getNodeFromId(nodeId);
            } catch (error) {
                console.warn(t("workflow.legacy.getNodeFailed", { id: nodeId }), error);
                return null;
            }
        }
    };

    // --- 初始化 ---
    populateWorkflowSelector(); // 初始加载工作流
    console.log('Workflow editor script loaded. Waiting for main app to provide action palette.');
}
