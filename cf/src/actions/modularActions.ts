import { BUILTIN_NODE_DEFINITIONS } from "./nodes_builtin";
import { CUSTOM_NODE_DEFINITIONS } from "./nodes_custom";

export interface ActionInputOption {
  value: string;
  label: string;
}

export interface ActionInputDef {
  name: string;
  type: string;
  label?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  enum_labels?: Record<string, string>;
  options?: ActionInputOption[];
  options_source?: string;
  placeholder?: string;
}

export interface ActionOutputDef {
  name: string;
  type: string;
  description?: string;
}

export interface NodeI18nPack {
  name?: Record<string, string>;
  description?: Record<string, string>;
  inputs?: Record<
    string,
    {
      label?: Record<string, string>;
      description?: Record<string, string>;
      placeholder?: Record<string, string>;
    }
  >;
  outputs?: Record<
    string,
    {
      label?: Record<string, string>;
      description?: Record<string, string>;
    }
  >;
}

export interface NodeUiMeta {
  icon?: string;
  color?: string;
  group?: string;
  order?: number;
}

export interface NodeRuntimeMeta {
  execution?: "local" | "remote";
  endpoint?: string;
  allowNetwork?: boolean;
  sideEffects?: boolean;
  requiredBindings?: string[];
}

export interface NodeCompatibilityMeta {
  engineVersion?: string;
}

export interface NodeLimitsMeta {
  timeoutMs?: number;
  rateLimit?: number;
  cost?: number;
}

export interface ModularActionDefinition {
  id: string;
  name: string;
  description?: string;
  inputs: ActionInputDef[];
  outputs: ActionOutputDef[];
  version?: string;
  category?: NodeCategoryKey | string;
  tags?: string[];
  i18n?: NodeI18nPack;
  ui?: NodeUiMeta;
  runtime?: NodeRuntimeMeta;
  compatibility?: NodeCompatibilityMeta;
  limits?: NodeLimitsMeta;
}

export const NODE_CATEGORY_KEYS = [
  "trigger",
  "flow",
  "message",
  "telegram",
  "navigation",
  "data",
  "integration",
  "utility",
] as const;

export type NodeCategoryKey = (typeof NODE_CATEGORY_KEYS)[number];

const DEFAULT_NODE_CATEGORY: NodeCategoryKey = "utility";

const NODE_CATEGORY_PRIORITY = Object.fromEntries(
  NODE_CATEGORY_KEYS.map((key, index) => [key, index + 1])
) as Record<NodeCategoryKey, number>;

const CATEGORY_ALIAS: Record<string, NodeCategoryKey> = {
  trigger: "trigger",
  triggers: "trigger",
  flow: "flow",
  control: "flow",
  branch: "flow",
  switch: "flow",
  message: "message",
  messages: "message",
  messaging: "message",
  send: "message",
  edit: "message",
  telegram: "telegram",
  tg: "telegram",
  input: "telegram",
  member: "telegram",
  navigation: "navigation",
  nav: "navigation",
  menu: "navigation",
  redirect: "navigation",
  data: "data",
  variable: "data",
  variables: "data",
  json: "data",
  string: "data",
  transform: "data",
  integration: "integration",
  io: "integration",
  r2: "integration",
  http: "integration",
  network: "integration",
  external: "integration",
  utility: "utility",
  tools: "utility",
  util: "utility",
  base: "utility",
  basic: "utility",
  common: "utility",
  custom: "utility",
};

const normalizeToken = (raw: unknown): string => {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const normalizeTags = (tags?: string[]): string[] => {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .map((tag) => normalizeToken(tag))
        .filter(Boolean)
    )
  );
};

const inferCategoryFromId = (id: string): NodeCategoryKey => {
  const token = normalizeToken(id);
  if (token.startsWith("trigger_")) return "trigger";
  if (token.includes("trigger")) return "trigger";
  if (token.startsWith("send_") || token.startsWith("edit_message") || token.startsWith("delete_message")) {
    return "message";
  }
  if (token.startsWith("forward_") || token.startsWith("copy_") || token.includes("message")) {
    return "message";
  }
  if (
    token.includes("chat_member") ||
    token.includes("member_role") ||
    token.startsWith("get_chat") ||
    token.includes("await_user_input")
  ) {
    return "telegram";
  }
  if (token.includes("redirect") || token.includes("submenu") || token.includes("menu")) return "navigation";
  if (token.includes("json") || token.includes("string") || token.includes("variable")) return "data";
  if (token.includes("cache") || token.includes("http") || token.includes("upload")) return "integration";
  if (token.includes("for_each") || token.includes("switch") || token.includes("try_catch")) return "flow";
  return DEFAULT_NODE_CATEGORY;
};

const resolveCategoryFromTags = (tags: string[]): NodeCategoryKey | "" => {
  for (const tag of tags) {
    const mapped = CATEGORY_ALIAS[tag];
    if (mapped) return mapped;
  }
  return "";
};

export function normalizeNodeCategory(input: {
  category?: string;
  group?: string;
  tags?: string[];
  id?: string;
}): NodeCategoryKey {
  const rawCategory = normalizeToken(input.category);
  const rawGroup = normalizeToken(input.group);
  const tags = normalizeTags(input.tags);

  const mappedCategory = CATEGORY_ALIAS[rawCategory];
  if (mappedCategory) return mappedCategory;

  const mappedGroup = CATEGORY_ALIAS[rawGroup];
  if (mappedGroup) return mappedGroup;

  const fromTags = resolveCategoryFromTags(tags);
  if (fromTags) return fromTags;

  return inferCategoryFromId(String(input.id || ""));
}

function normalizeDefinition(def: ModularActionDefinition): ModularActionDefinition {
  const normalizedTags = normalizeTags(def.tags);
  const normalizedCategory = normalizeNodeCategory({
    id: def.id,
    category: def.category,
    group: def.ui?.group,
    tags: normalizedTags,
  });
  return {
    ...def,
    category: normalizedCategory,
    tags: normalizedTags,
    ui: {
      ...(def.ui || {}),
      group: normalizedCategory,
      order:
        typeof def.ui?.order === "number" && Number.isFinite(def.ui.order)
          ? def.ui.order
          : NODE_CATEGORY_PRIORITY[normalizedCategory],
    },
  };
}

const ALL_DEFINITIONS: ModularActionDefinition[] = [
  ...BUILTIN_NODE_DEFINITIONS,
  ...CUSTOM_NODE_DEFINITIONS,
].map((def) => normalizeDefinition(def));

export const BUILTIN_MODULAR_ACTIONS = Object.fromEntries(
  ALL_DEFINITIONS.map((def) => [def.id, def])
) as Record<string, ModularActionDefinition>;

export const ALL_MODULAR_ACTIONS = ALL_DEFINITIONS;
