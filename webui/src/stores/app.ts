import { defineStore } from "pinia";
import { apiJson, getErrorMessage } from "../services/api";

export interface LayoutConfig {
  row?: number;
  col?: number;
  rowspan?: number;
  colspan?: number;
}

export interface ButtonDefinition {
  id: string;
  text: string;
  type: string;
  payload: Record<string, unknown>;
  description?: string;
  layout?: LayoutConfig;
}

export interface MenuDefinition {
  id: string;
  name: string;
  header?: string;
  items: string[];
}

export interface ActionDefinition {
  id: string;
  name: string;
  kind: string;
  config: Record<string, unknown>;
  description?: string;
}

export interface WebAppDefinition {
  id: string;
  name: string;
  kind: string;
  url: string;
  description?: string;
  options?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  action_id: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source_node: string;
  source_output: string;
  source_path?: string;
  target_node: string;
  target_input: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: Record<string, WorkflowNode>;
  edges: WorkflowEdge[];
}

export interface ButtonsModel {
  version: number;
  menus: Record<string, MenuDefinition>;
  buttons: Record<string, ButtonDefinition>;
  actions: Record<string, ActionDefinition>;
  web_apps: Record<string, WebAppDefinition>;
  workflows: Record<string, WorkflowDefinition>;
}

export interface ModularActionInput {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  options_source?: string;
  enum?: string[];
  enum_labels?: Record<string, string>;
  label?: string;
  placeholder?: string;
}

export interface ModularActionOutput {
  name: string;
  type?: string;
  description?: string;
  label?: string;
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

export interface ModularActionDefinition {
  id: string;
  name: string;
  description?: string;
  inputs?: ModularActionInput[];
  outputs?: ModularActionOutput[];
  filename?: string;
  version?: string;
  category?: string;
  tags?: string[];
  i18n?: NodeI18nPack;
  ui?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  compatibility?: Record<string, unknown>;
  limits?: Record<string, unknown>;
}

export interface LocalActionDefinition {
  name: string;
  description?: string;
  parameters?: ModularActionInput[];
}

export interface CombinedActionDefinition {
  id: string;
  name: string;
  description?: string;
  inputs?: ModularActionInput[];
  outputs?: ModularActionOutput[];
  parameters?: ModularActionInput[];
  isModular?: boolean;
  isLocal?: boolean;
  i18n?: NodeI18nPack;
  ui?: Record<string, unknown>;
  category?: string;
  tags?: string[];
}

const defaultState: ButtonsModel = {
  version: 2,
  menus: {},
  buttons: {},
  actions: {},
  web_apps: {},
  workflows: {},
};

export const useAppStore = defineStore("app", {
  state: () => ({
    state: { ...defaultState } as ButtonsModel,
    modularActions: [] as ModularActionDefinition[],
    localActions: [] as LocalActionDefinition[],
    secureUploadEnabled: false,
    loading: false,
    loadError: null as string | null,
  }),
  actions: {
    async loadAll() {
      this.loading = true;
      this.loadError = null;
      try {
        const stateData = await apiJson<ButtonsModel>("/api/state");

        const [modularData, localData] = await Promise.all([
          apiJson<{ actions: ModularActionDefinition[]; secure_upload_enabled: boolean }>(
            "/api/actions/modular/available"
          ).catch((error) => {
            console.warn("[loadAll] modular actions load failed:", getErrorMessage(error));
            return { actions: [], secure_upload_enabled: false };
          }),
          apiJson<{ actions: LocalActionDefinition[] }>("/api/actions/local/available").catch((error) => {
            console.warn("[loadAll] local actions load failed:", getErrorMessage(error));
            return { actions: [] };
          }),
        ]);

        this.state = { ...defaultState, ...stateData };
        this.modularActions = modularData.actions || [];
        this.secureUploadEnabled = Boolean(modularData.secure_upload_enabled);
        this.localActions = localData.actions || [];
      } catch (error: unknown) {
        this.loadError = `/api/state: ${getErrorMessage(error)}`;
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async saveState() {
      await apiJson("/api/state", {
        method: "PUT",
        body: JSON.stringify(this.state),
      });
    },
    buildActionPalette(): Record<string, CombinedActionDefinition> {
      const result: Record<string, CombinedActionDefinition> = {};
      for (const [actionId, action] of Object.entries(this.state.actions || {})) {
        result[actionId] = {
          ...action,
          id: actionId,
          name: action.name || actionId,
          description: action.description || "",
        };
      }
      for (const localAction of this.localActions || []) {
        const actionId = localAction.name;
        result[actionId] = {
          id: actionId,
          name: localAction.name,
          description: localAction.description || "",
          parameters: localAction.parameters || [],
          isLocal: true,
        };
      }
      for (const modular of this.modularActions || []) {
        result[modular.id] = {
          ...modular,
          id: modular.id,
          name: modular.name,
          description: modular.description || "",
          inputs: modular.inputs || [],
          outputs: modular.outputs || [],
          isModular: true,
        };
      }
      return result;
    },
  },
});
