export interface TgButtonEditorBridge {
  saveCurrentWorkflow?: (options?: { silentSuccess?: boolean }) => Promise<void> | void;
  refreshPalette?: () => void;
  refreshWorkflows?: () => void;
  updateNodeConfig?: (id: string, newData: Record<string, unknown>) => void;
}

let bridge: TgButtonEditorBridge | null = null;

export const registerEditorBridge = (next: TgButtonEditorBridge) => {
  bridge = next;
};

export const clearEditorBridge = (target?: TgButtonEditorBridge) => {
  if (!target || bridge === target) {
    bridge = null;
  }
};

export const getEditorBridge = () => bridge;
