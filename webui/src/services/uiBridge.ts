export type UiInputType = "text" | "textarea" | "password";

export interface UiInputOptions {
  defaultValue?: string;
  [key: string]: unknown;
}

export type ShowInfoModal = (message: string, isError?: boolean) => void;
export type ShowConfirmModal = (
  title: string,
  message: string,
  onConfirm?: () => void,
  onCancel?: () => void
) => void;
export type ShowInputModal = (
  title: string,
  message: string,
  inputType?: UiInputType,
  placeholder?: string,
  onConfirm?: (value: string) => void,
  onCancel?: () => void,
  extraOptions?: UiInputOptions
) => void;

interface UiBridgeHandlers {
  showInfoModal: ShowInfoModal;
  showConfirmModal: ShowConfirmModal;
  showInputModal: ShowInputModal;
}

const fallbackHandlers: UiBridgeHandlers = {
  showInfoModal: (message, isError = false) => {
    if (isError) {
      console.error(message);
      return;
    }
    console.info(message);
  },
  showConfirmModal: (title, message, onConfirm) => {
    const decision = window.confirm([title, message].filter(Boolean).join("\n\n"));
    if (decision) {
      onConfirm?.();
    }
  },
  showInputModal: (title, message, _inputType = "text", placeholder = "", onConfirm) => {
    const promptText = [title, message, placeholder].filter(Boolean).join("\n");
    const value = window.prompt(promptText, "");
    if (value !== null) {
      onConfirm?.(value);
    }
  },
};

let handlers: UiBridgeHandlers = { ...fallbackHandlers };

export const setUiBridgeHandlers = (next: Partial<UiBridgeHandlers>) => {
  handlers = {
    ...handlers,
    ...next,
  };
};

export const resetUiBridgeHandlers = () => {
  handlers = { ...fallbackHandlers };
};

export const showInfoModal: ShowInfoModal = (message, isError = false) => {
  handlers.showInfoModal(message, isError);
};

export const showConfirmModal: ShowConfirmModal = (title, message, onConfirm, onCancel) => {
  handlers.showConfirmModal(title, message, onConfirm, onCancel);
};

export const showInputModal: ShowInputModal = (
  title,
  message,
  inputType = "text",
  placeholder = "",
  onConfirm,
  onCancel,
  extraOptions
) => {
  handlers.showInputModal(title, message, inputType, placeholder, onConfirm, onCancel, extraOptions);
};
