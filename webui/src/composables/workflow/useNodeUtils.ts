import { useI18n } from '../../i18n';

export function useNodeUtils() {
    const { t, locale } = useI18n();
    const CONTROL_PORT_NAME = "__control__";

    const resolveI18nValue = (entry: any, fallback = '') => {
        if (!entry || typeof entry !== 'object') return fallback;
        return entry[locale.value] || entry['zh-CN'] || entry['en-US'] || fallback;
    };

    const truncate = (str: string, maxLength: number) => {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    };

    const escapeHTML = (str: string) => {
        if (!str) return '';
        return str.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match] || match));
    };

    const getActionDisplayName = (actionId: string, action: any) => {
        if (!action) return actionId || '';
        const localized = resolveI18nValue(action.i18n?.name, '');
        const base = localized || action.name || actionId || '';
        if (action.isLocal) {
            return `${t('workflow.actionPrefixLocal')} ${base}`.trim();
        }
        return base;
    };

    const getInputLabel = (action: any, input: any) => {
        if (!action || !input) return input?.name || '';
        const localized = resolveI18nValue(action.i18n?.inputs?.[input.name]?.label, '');
        return localized || input.label || input.name || '';
    };

    const getOutputLabel = (action: any, output: any) => {
        if (!action || !output) return output?.name || '';
        const localized = resolveI18nValue(action.i18n?.outputs?.[output.name]?.label, '');
        return localized || output.label || output.name || '';
    };

    const getFlowOutputs = (action: any) => {
        const outputs = (action?.outputs || []) as any[];
        return outputs.filter((o) => o && String(o.type || '').toLowerCase() === 'flow');
    };

    const buildNodeHtml = (action: any) => {
        if (!action || !action.id) return '';

        const buildPortLabel = (label: string, cls: string, rawName = '') => {
            const baseName = label || rawName || '';
            const title = label && rawName && label !== rawName ? `${label} (${rawName})` : baseName;
            const truncated = truncate(baseName, 8);
            return `<div class="port-label ${cls}" title="${escapeHTML(title)}">${escapeHTML(truncated)}</div>`;
        };

        const flowOutputs = getFlowOutputs(action);
        const inputsHTML = buildPortLabel('ctrl', 'port-label-in port-label-control', CONTROL_PORT_NAME);
        const outputsHTML = flowOutputs.length
            ? flowOutputs.map((output: any) => buildPortLabel(getOutputLabel(action, output), 'port-label-out port-label-control', output.name)).join('')
            : buildPortLabel('next', 'port-label-out port-label-control', CONTROL_PORT_NAME);

        // Drawflow specific HTML structure we want inside the node
        return `
        <div class="node-title" title="${escapeHTML(getActionDisplayName(action.id, action))}">${escapeHTML(getActionDisplayName(action.id, action))}</div>
        <div class="ports-wrapper">
            <div class="input-ports">${inputsHTML}</div>
            <div class="output-ports">${outputsHTML}</div>
        </div>
    `;
    };

    const DEFAULT_TEMPLATE_BY_INPUT: Record<string, string> = {
        chat_id: "{{ runtime.chat_id }}",
        message_id: "{{ runtime.message_id }}",
        thread_id: "{{ runtime.thread_id }}",
        user_id: "{{ runtime.user_id }}",
        username: "{{ runtime.username }}",
        callback_data: "{{ runtime.callback_data }}",
        menu_id: "{{ runtime.variables.menu_id }}",
        button_id: "{{ runtime.variables.button_id }}",
    };

    const buildDefaultNodeData = (action: any) => {
        const defaults: Record<string, any> = {};
        (action.inputs || []).forEach((input: any) => {
            if (!input || !input.name) return;
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

    return {
        getActionDisplayName,
        getInputLabel,
        getOutputLabel,
        buildNodeHtml,
        buildDefaultNodeData,
        resolveI18nValue,
        getFlowOutputs
    };
}
