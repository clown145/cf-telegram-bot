import { BUILTIN_NODE_DEFINITIONS } from "./nodes_builtin";
import { CUSTOM_NODE_DEFINITIONS } from "./nodes_custom";

export interface ActionInputOption {
  value: string;
  label: string;
}

export interface ActionInputDef {
  name: string;
  type: string;
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
  category?: string;
  tags?: string[];
  i18n?: NodeI18nPack;
  ui?: NodeUiMeta;
  runtime?: NodeRuntimeMeta;
  compatibility?: NodeCompatibilityMeta;
  limits?: NodeLimitsMeta;
}

const ALL_DEFINITIONS: ModularActionDefinition[] = [
  ...BUILTIN_NODE_DEFINITIONS,
  ...CUSTOM_NODE_DEFINITIONS,
];

export const BUILTIN_MODULAR_ACTIONS = Object.fromEntries(
  ALL_DEFINITIONS.map((def) => [def.id, def])
) as Record<string, ModularActionDefinition>;

export const ALL_MODULAR_ACTIONS = ALL_DEFINITIONS;
