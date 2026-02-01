import { ref, computed } from 'vue';

import { useI18n } from '../../i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useNodePalette(store: any) {
    const { t, locale } = useI18n();
    const searchTerm = ref('');

    const resolveI18nValue = (entry: any, fallback = '') => {
        if (!entry || typeof entry !== 'object') return fallback;
        return entry[locale.value] || entry['zh-CN'] || entry['en-US'] || fallback;
    };

    const getActionDisplayName = (actionId: string, action: any) => {
        if (!action) return actionId || '';
        const localized = resolveI18nValue(action.i18n?.name, '');
        return localized || action.name || actionId || '';
    };

    const getActionDescription = (action: any) => {
        if (!action) return '';
        const localized = resolveI18nValue(action.i18n?.description, '');
        return localized || action.description || '';
    };

    const paletteNodes = computed(() => {
        const allActions = store.buildActionPalette ? store.buildActionPalette() : {};
        const modularActions = Object.entries(allActions)
            .filter(([, action]: [string, any]) => action && action.isModular)
            .map(([id, action]) => ({
                id,
                ...(action as any),
                displayName: getActionDisplayName(id, action),
                displayDescription: getActionDescription(action)
            }));

        const term = searchTerm.value.trim().toLowerCase();
        if (!term) {
            return modularActions.sort((a: any, b: any) => a.displayName.localeCompare(b.displayName));
        }

        return modularActions.filter((action: any) => {
            return action.displayName.toLowerCase().includes(term) ||
                action.displayDescription.toLowerCase().includes(term);
        }).sort((a: any, b: any) => a.displayName.localeCompare(b.displayName));
    });


    const uploadAction = async (file: File, password?: string) => {
        const content = await file.text();
        const payload: any = { filename: file.name, content };
        if (password) {
            payload.upload_password = password;
        }

        await fetch('/api/actions/modular/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...((localStorage.getItem('tg-button-auth-token')) ? { 'X-Auth-Token': localStorage.getItem('tg-button-auth-token')! } : {})
            },
            body: JSON.stringify(payload)
        }).then(async res => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(err.error || res.statusText);
            }
            return res;
        });

        // Trigger a reload of actions, simplest way is to ask store to reload
        if (store.loadAll) await store.loadAll();
    };

    const deleteAction = async (actionId: string, password?: string) => {
        const payload: any = {};
        if (password) {
            payload.upload_password = password;
        }

        await fetch(`/api/actions/modular/${encodeURIComponent(actionId)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...((localStorage.getItem('tg-button-auth-token')) ? { 'X-Auth-Token': localStorage.getItem('tg-button-auth-token')! } : {})
            },
            body: JSON.stringify(payload)
        }).then(async res => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(err.error || res.statusText);
            }
        });

        if (store.loadAll) await store.loadAll();
    };

    return {
        searchTerm,
        paletteNodes,
        uploadAction,
        deleteAction
    };
}

