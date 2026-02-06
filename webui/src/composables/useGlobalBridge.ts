import { h, onBeforeUnmount, ref } from "vue";
import { NInput, NSpace, NText } from "naive-ui";
import type { MessageApiInjection } from "naive-ui/es/message/src/MessageProvider";
import type { DialogApiInjection } from "naive-ui/es/dialog/src/DialogProvider";
import { resetUiBridgeHandlers, setUiBridgeHandlers, type UiInputOptions } from "../services/uiBridge";

export function useGlobalBridge(
  _message: MessageApiInjection,
  dialog: DialogApiInjection,
  t: (key: string, args?: any) => string
) {
  setUiBridgeHandlers({
    showInfoModal: (msg: string, isError: boolean = false) => {
      const content = msg.replace(/<br>/g, "\n");
      if (isError) {
        dialog.error({
          title: t("common.error"),
          content,
          positiveText: t("common.ok"),
          maskClosable: false,
        });
        return;
      }
      dialog.info({
        title: t("common.notice"),
        content,
        positiveText: t("common.ok"),
        maskClosable: true,
      });
    },
    showConfirmModal: (title: string, msg: string, onConfirm?: () => void, onCancel?: () => void) => {
      dialog.warning({
        title: title || t("common.confirm"),
        content: msg.replace(/<br>/g, "\n"),
        positiveText: t("common.confirm"),
        negativeText: t("common.cancel"),
        onPositiveClick: () => {
          onConfirm?.();
        },
        onNegativeClick: () => {
          onCancel?.();
        },
      });
    },
    showInputModal: (
      title: string,
      msg: string,
      inputType: "text" | "textarea" | "password" = "text",
      placeholder: string = "",
      onConfirm?: (value: string) => void,
      onCancel?: () => void,
      extraOptions?: UiInputOptions
    ) => {
      const inputValue = ref(extraOptions?.defaultValue || "");
      dialog.create({
        title: title || t("common.confirm"),
        content: () =>
          h(NSpace, { vertical: true }, {
            default: () => [
              h(NText, { depth: 1 }, { default: () => msg.replace(/<br>/g, "\n") }),
              h(NInput, {
                value: inputValue.value,
                type: inputType === "textarea" ? "textarea" : inputType,
                placeholder,
                autosize: inputType === "textarea" ? { minRows: 3, maxRows: 6 } : undefined,
                onUpdateValue: (v: string) => {
                  inputValue.value = v;
                },
              }),
            ],
          }),
        positiveText: t("common.confirm"),
        negativeText: t("common.cancel"),
        onPositiveClick: () => {
          onConfirm?.(inputValue.value);
        },
        onNegativeClick: () => {
          onCancel?.();
        },
      });
    },
  });

  onBeforeUnmount(() => {
    resetUiBridgeHandlers();
  });
}
