import { computed, ref } from 'vue';

import { useI18n } from '../../i18n';

type NodeCategoryKey =
  | 'trigger'
  | 'flow'
  | 'message'
  | 'telegram'
  | 'navigation'
  | 'data'
  | 'integration'
  | 'utility';

const CATEGORY_ORDER: NodeCategoryKey[] = [
  'trigger',
  'flow',
  'message',
  'telegram',
  'navigation',
  'data',
  'integration',
  'utility',
];

const CATEGORY_PRIORITY: Record<NodeCategoryKey, number> = {
  trigger: 1,
  flow: 2,
  message: 3,
  telegram: 4,
  navigation: 5,
  data: 6,
  integration: 7,
  utility: 8,
};

const CATEGORY_ALIAS: Record<string, NodeCategoryKey> = {
  trigger: 'trigger',
  triggers: 'trigger',
  flow: 'flow',
  control: 'flow',
  message: 'message',
  messages: 'message',
  messaging: 'message',
  telegram: 'telegram',
  tg: 'telegram',
  input: 'telegram',
  navigation: 'navigation',
  nav: 'navigation',
  menu: 'navigation',
  data: 'data',
  variable: 'data',
  variables: 'data',
  json: 'data',
  string: 'data',
  integration: 'integration',
  io: 'integration',
  r2: 'integration',
  http: 'integration',
  utility: 'utility',
  util: 'utility',
  basic: 'utility',
  custom: 'utility',
};

type PaletteNode = {
  id: string;
  category: NodeCategoryKey;
  displayName: string;
  displayDescription: string;
  ui?: {
    order?: number;
  };
  [key: string]: unknown;
};

type PaletteGroup = {
  key: NodeCategoryKey;
  label: string;
  nodes: PaletteNode[];
};

type CategoryOption = {
  label: string;
  value: NodeCategoryKey;
};

const normalizeToken = (raw: unknown): string => {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
};

const inferCategoryFromActionId = (actionId: string): NodeCategoryKey => {
  const token = normalizeToken(actionId);
  if (token.startsWith('trigger_') || token.includes('trigger')) return 'trigger';
  if (token.startsWith('send_') || token.includes('message')) return 'message';
  if (token.startsWith('get_chat') || token.includes('member')) return 'telegram';
  if (token.includes('redirect') || token.includes('menu')) return 'navigation';
  if (token.includes('json') || token.includes('string') || token.includes('variable')) return 'data';
  if (token.includes('cache') || token.includes('http') || token.includes('upload')) return 'integration';
  if (token.includes('switch') || token.includes('for_each') || token.includes('try_catch')) return 'flow';
  return 'utility';
};

const normalizeCategory = (input: unknown, actionId: string): NodeCategoryKey => {
  const normalized = normalizeToken(input);
  const mapped = CATEGORY_ALIAS[normalized];
  return mapped || inferCategoryFromActionId(actionId);
};

const getNodeSortOrder = (node: PaletteNode): number => {
  const order = Number(node.ui?.order);
  if (Number.isFinite(order)) return order;
  return CATEGORY_PRIORITY[node.category] * 1000;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useNodePalette(store: any) {
  const { t, locale } = useI18n();
  const searchTerm = ref('');
  const selectedCategories = ref<NodeCategoryKey[]>([]);

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

  const getCategoryLabel = (category: NodeCategoryKey): string => {
    const key = `workflow.paletteCategories.${category}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return category;
  };

  const categoryOptions = computed<CategoryOption[]>(() => {
    return CATEGORY_ORDER.map((category) => ({
      label: getCategoryLabel(category),
      value: category,
    }));
  });

  const paletteNodes = computed<PaletteNode[]>(() => {
    const allActions = store.buildActionPalette ? store.buildActionPalette() : {};
    const modularActions = Object.entries(allActions)
      .filter(([, action]: [string, any]) => action && action.isModular)
      .map(([id, action]) => {
        const normalizedCategory = normalizeCategory(action.category || action.ui?.group, id);
        return {
          id,
          ...(action as any),
          category: normalizedCategory,
          displayName: getActionDisplayName(id, action),
          displayDescription: getActionDescription(action),
        } as PaletteNode;
      });

    const term = searchTerm.value.trim().toLowerCase();
    const categorySet = new Set(selectedCategories.value || []);
    const categoryFiltered =
      categorySet.size > 0
        ? modularActions.filter((action) => categorySet.has(action.category))
        : modularActions;
    const filtered = term
      ? categoryFiltered.filter((action) => {
          return (
            action.displayName.toLowerCase().includes(term) ||
            action.displayDescription.toLowerCase().includes(term) ||
            action.id.toLowerCase().includes(term)
          );
        })
      : categoryFiltered;

    return filtered.sort((a, b) => {
      const categoryDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      if (categoryDiff !== 0) return categoryDiff;
      const orderDiff = getNodeSortOrder(a) - getNodeSortOrder(b);
      if (orderDiff !== 0) return orderDiff;
      return a.displayName.localeCompare(b.displayName);
    });
  });

  const paletteGroups = computed<PaletteGroup[]>(() => {
    const groups = new Map<NodeCategoryKey, PaletteGroup>();
    for (const node of paletteNodes.value) {
      if (!groups.has(node.category)) {
        groups.set(node.category, {
          key: node.category,
          label: getCategoryLabel(node.category),
          nodes: [],
        });
      }
      groups.get(node.category)!.nodes.push(node);
    }

    return CATEGORY_ORDER.map((category) => groups.get(category)).filter((group): group is PaletteGroup =>
      Boolean(group)
    );
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
        ...(localStorage.getItem('tg-button-auth-token')
          ? { 'X-Auth-Token': localStorage.getItem('tg-button-auth-token')! }
          : {}),
      },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res;
    });

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
        ...(localStorage.getItem('tg-button-auth-token')
          ? { 'X-Auth-Token': localStorage.getItem('tg-button-auth-token')! }
          : {}),
      },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
    });

    if (store.loadAll) await store.loadAll();
  };

  return {
    searchTerm,
    selectedCategories,
    categoryOptions,
    paletteNodes,
    paletteGroups,
    uploadAction,
    deleteAction,
  };
}

